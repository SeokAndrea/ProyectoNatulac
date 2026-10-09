import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth"
import type { AreaCodigo } from "@/lib/catalogos"
import {
  cargoDeUsuario,
  type LecturaServiciosIndustriales,
  obtenerEstadoPlantaActual,
  obtenerLecturaServiciosIndustriales,
  obtenerProduccionDia,
  obtenerTurnoAnterior,
  obtenerTurnosDeFechaTipo,
  type ProduccionDiaItem,
} from "@/lib/panelProduccion"
import { listarParadas, type Parada } from "@/lib/paradas"
import { useCatalogoParadas } from "@/lib/paradasCatalogo"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { useProductoTerminado } from "@/lib/productoTerminado"
import { fechaJornada, obtenerProgramacionDia, type ProgramacionItem as PlanDiaItem } from "@/lib/programacion"
import { franjaDeHora } from "@/lib/tiempoPlanta"
import type { TurnoActivo } from "@/lib/turno"

/**
 * Cada cuánto el Panel se refresca solo cuando está EN VIVO, para que
 * nadie quede mirando datos viejos si deja la pestaña abierta. Es un
 * refresco silencioso (sin spinner de pantalla completa). No aplica
 * cuando se está viendo un turno histórico elegido a mano.
 */
const REFRESCO_EN_VIVO_MS = 15 * 60 * 1000

/**
 * Todos los datos del Panel de Producción y cómo se cargan: el turno (en
 * vivo, o el elegido por fecha y tipo), el turno anterior, los 3 módulos
 * de dominio de los dos, Servicios Industriales, el plan y la producción
 * de la jornada, las paradas del turno, el reloj y el refresco en vivo.
 * La página solo muestra lo que devuelve esto.
 */
export function usePanelTurno() {
  const { session } = useAuth()
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  /** Turnos de la fecha y tipo elegidos. En 12x12 el T2 se parte a las 19:00 y vienen dos (se elige con ElegirTramoTurno). */
  const [tramos, setTramos] = useState<TurnoActivo[]>([])
  const [cargando, setCargando] = useState(true)
  const [enVivo, setEnVivo] = useState(true)
  // Día de turno, no calendario: a las 2:00 el turno 3 en curso es el de la fecha anterior.
  const [fecha, setFecha] = useState(() => franjaDeHora().fecha)
  const [turnoTipo, setTurnoTipo] = useState<string>(() => franjaDeHora().tipo)
  const [buscado, setBuscado] = useState(false)
  /*
   * El turno pasado sin procesar: la merma se calcula en el render (junto
   * con la del turno actual) para que ambas usen el mismo `presentaciones`
   * ya cargado. Guardar acá la merma ya calculada hacía que "turno pasado"
   * quedara clavado en 100% de merma de envase si el catálogo todavía no
   * había resuelto al momento de la carga.
   */
  const [turnoAnterior, setTurnoAnterior] = useState<TurnoActivo | null>(null)
  /** Cargo (rótulo del puesto) del supervisor del turno, para mostrarlo junto al nombre. */
  const [supervisorCargo, setSupervisorCargo] = useState<string | null>(null)
  /** Servicios Industriales: Temperatura del Quantum / Agua Osmotizada — meramente informativo, arriba de Tanques. */
  const [servIndustriales, setServIndustriales] = useState<LecturaServiciosIndustriales | null>(null)
  const [ahora, setAhora] = useState(() => new Date())
  /** Sube cada REFRESCO_EN_VIVO_MS; dispara la recarga silenciosa del turno en vivo y de los datos de la jornada. */
  const [tickRefresco, setTickRefresco] = useState(0)
  const [planDia, setPlanDia] = useState<PlanDiaItem[]>([])
  /*
   * Producción acumulada de la jornada (los 3 turnos del día), solo en
   * modo EN VIVO. La usa el "hecho" del carrusel de Programación diaria.
   */
  const [produccionDia, setProduccionDia] = useState<ProduccionDiaItem[]>([])
  /**
   * Paradas del turno mostrado (listarParadas con el turno). Alimenta
   * "Tiempo de parada", "Parada con mayor duración" y la eficiencia (OEE)
   * de cada línea — ver src/lib/eficiencia.ts.
   */
  const [paradasTurno, setParadasTurno] = useState<Parada[]>([])
  useCatalogoParadas() // carga el catálogo: hace falta para mostrar el código de cada parada
  /*
   * Solo el Super Administrador tiene session.area === null ("ve
   * todas las áreas") — sin este filtro, "en vivo" mostraba el turno
   * más reciente de CUALQUIER área, mezclando el Área de Pruebas con
   * la producción real. El resto de los roles ya tiene su área fija
   * en la sesión, no necesita elegir.
   *
   * Excepción: Servicios Industriales tiene área propia en la sesión,
   * pero esa área nunca abre un turno (no produce) — filtrar por
   * session.area ahí dejaba el Panel siempre vacío para ese rol. Se
   * trata igual que al Super Administrador: elige qué área mirar,
   * arrancando siempre en ASEPTICO.
   */
  // Calidad y Mantenimiento (también de apoyo, sin turnos propios) igual que Servicios Industriales.
  const puedeElegirArea =
    !session?.area || ["SERVICIOS_INDUSTRIALES", "CALIDAD", "MANTENIMIENTO"].includes(session.area)
  const [areaFiltro, setAreaFiltro] = useState<AreaCodigo | "TODAS">(puedeElegirArea ? "ASEPTICO" : (session?.area ?? "ASEPTICO"))
  const areaEfectiva = puedeElegirArea ? (areaFiltro === "TODAS" ? null : areaFiltro) : (session?.area ?? null)

  /*
   * Datos de dominio: el Panel NO trae tanques/corridas/contadores/PT
   * dentro de `turno` (eso lo siguen resolviendo obtenerEstadoPlantaActual
   * / obtenerTurnoDeFechaTipo / obtenerTurnoAnterior, para la CABECERA del
   * turno: id, código, fecha, supervisor, horario). Los 3 módulos de
   * dominio se piden acá aparte — con `turno?.id ?? null` (nunca
   * `undefined`) para que, si todavía no hay turno resuelto, se vea vacío
   * y NUNCA el turno propio del supervisor que está mirando el Panel (ver
   * el fix de usePreparacion/useProduccion/useProductoTerminado a null vs.
   * undefined).
   */
  const prep = usePreparacion(turno?.id ?? null)
  const prod = useProduccion(turno?.id ?? null)
  const pt = useProductoTerminado(turno?.id ?? null)
  const prepAnterior = usePreparacion(turnoAnterior?.id ?? null)
  const prodAnterior = useProduccion(turnoAnterior?.id ?? null)
  const ptAnterior = useProductoTerminado(turnoAnterior?.id ?? null)

  /*
   * Jornada (día de planta 7am→7am) que corresponde a lo que se está
   * viendo. Se toma de turnos.fecha del turno cargado — el backend lo
   * estampa al crear el turno y es el MISMO para los 3 turnos de la
   * jornada, así que no depende del reloj ni se rompe en el borde de
   * las 7am (ej. un Turno 3 que cierra 07:05 sigue siendo su jornada).
   * Solo si todavía no hay turno se cae al reloj (fechaJornada(ahora)),
   * que además rota solo al pasar las 7am con el Panel abierto.
   * Es un string "YYYY-MM-DD": los efectos que dependen de él se
   * re-disparan únicamente cuando cambia el día, no en cada tick.
   */
  const fechaJornadaPanel = turno?.fecha ?? fechaJornada(ahora)

  // Por minuto: las cuentas (eficiencia, duraciones) no necesitan segundos. El reloj del banner tiene su propio intervalo (RelojPlanta).
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTickRefresco((n) => n + 1), REFRESCO_EN_VIVO_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let vivo = true
    if (!turno?.supervisorUsuario) {
      setSupervisorCargo(null)
      return
    }
    cargoDeUsuario(turno.supervisorUsuario).then((c) => {
      if (vivo) setSupervisorCargo(c)
    })
    return () => {
      vivo = false
    }
  }, [turno?.supervisorUsuario])

  /** Servicios Industriales: no depende del área/turno que se esté viendo — es una lectura global. Se refresca junto con el resto del Panel en vivo. */
  useEffect(() => {
    let vivo = true
    obtenerLecturaServiciosIndustriales().then((l) => {
      if (vivo) setServIndustriales(l)
    })
    return () => {
      vivo = false
    }
  }, [tickRefresco])

  useEffect(() => {
    let vivo = true
    if (!areaEfectiva) {
      setPlanDia([])
      return
    }
    obtenerProgramacionDia(areaEfectiva, fechaJornadaPanel).then((items) => {
      if (vivo) setPlanDia(items)
    })
    return () => {
      vivo = false
    }
  }, [areaEfectiva, fechaJornadaPanel, tickRefresco])

  useEffect(() => {
    let vivo = true
    if (!areaEfectiva || !enVivo) {
      setProduccionDia([])
      return
    }
    obtenerProduccionDia(areaEfectiva, fechaJornadaPanel).then((items) => {
      if (vivo) setProduccionDia(items)
    })
    return () => {
      vivo = false
    }
  }, [areaEfectiva, enVivo, turno?.id, fechaJornadaPanel, tickRefresco])

  useEffect(() => {
    let vivo = true
    if (!turno?.id) {
      setParadasTurno([])
      return
    }
    listarParadas({ desde: fecha, hasta: fecha, turnoId: turno.id }).then((filas) => {
      if (vivo) setParadasTurno(filas)
    })
    return () => {
      vivo = false
    }
  }, [fecha, turno?.id, tickRefresco])

  async function cargarTurnoAnterior(turnoActualId: string | null) {
    if (!areaEfectiva) {
      setTurnoAnterior(null)
      return
    }
    setTurnoAnterior(await obtenerTurnoAnterior(areaEfectiva, turnoActualId))
  }

  /*
   * "En vivo" ya no exige un turno con estado ABIERTO en ese instante:
   * usa estado_planta_actual(), que trae el turno más reciente en
   * general (abierto o recién cerrado). Líneas y tanques son estado
   * continuo — tienen que verse igual en el hueco entre que un
   * supervisor finaliza su turno y el siguiente arranca el suyo.
   */
  async function cargarEnVivo(silencioso = false) {
    if (!silencioso) setCargando(true)
    const t = await obtenerEstadoPlantaActual(areaEfectiva)
    // Mismo turno: el id no cambia y los módulos no recargan solos (tanques, corridas y PT quedarían viejos).
    if (silencioso && t && t.id === turno?.id) {
      void prep.recargar()
      void prod.recargar()
      void pt.recargar()
    }
    setTramos([])
    if (t) {
      setTurno(t)
      setFecha(t.fecha)
      setTurnoTipo(t.turnoTipo)
      setEnVivo(true)
    } else {
      setTurno(null)
      setEnVivo(true)
    }
    await cargarTurnoAnterior(t?.id ?? null)
    setBuscado(true)
    if (!silencioso) setCargando(false)
  }

  async function buscarFechaTipo(f: string, tt: string) {
    setCargando(true)
    setEnVivo(false)
    const lista = await obtenerTurnosDeFechaTipo(f, tt, areaEfectiva)
    const t = lista.at(-1) ?? null
    setTramos(lista)
    setTurno(t)
    await cargarTurnoAnterior(t?.id ?? null)
    setBuscado(true)
    setCargando(false)
  }

  useEffect(() => {
    if (enVivo) {
      cargarEnVivo()
    } else {
      buscarFechaTipo(fecha, turnoTipo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaEfectiva])

  // Refresco periódico (cada REFRESCO_EN_VIVO_MS): solo en modo EN VIVO
  // y silencioso — no saca de pantalla lo que se ve. El turno histórico
  // elegido a mano no se toca.
  useEffect(() => {
    if (tickRefresco === 0 || !enVivo) return
    cargarEnVivo(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickRefresco])

  return {
    turno,
    tramos,
    turnoAnterior,
    cargando,
    buscado,
    enVivo,
    fecha,
    turnoTipo,
    ahora,
    puedeElegirArea,
    areaFiltro,
    areaEfectiva,
    supervisorCargo,
    servIndustriales,
    planDia,
    produccionDia,
    paradasTurno,
    prep,
    prod,
    pt,
    prepAnterior,
    prodAnterior,
    ptAnterior,
    elegirArea: setAreaFiltro,
    /** Elegir el tipo de turno busca ese turno en la fecha elegida (deja de estar en vivo). */
    elegirTurnoTipo(tt: string) {
      setTurnoTipo(tt)
      buscarFechaTipo(fecha, tt)
    },
    /** Elegir la fecha busca ese turno (deja de estar en vivo). */
    elegirFecha(f: string) {
      setFecha(f)
      buscarFechaTipo(f, turnoTipo)
    },
    verEnVivo: () => cargarEnVivo(),
    /** 12x12: ver el otro T2 de la misma fecha (día 15:00–19:00 / noche 19:00–22:30). */
    async elegirTramo(id: string) {
      const t = tramos.find((x) => x.id === id)
      if (!t || t.id === turno?.id) return
      setTurno(t)
      await cargarTurnoAnterior(t.id)
    },
  }
}
