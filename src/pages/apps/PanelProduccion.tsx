import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Container,
  Droplets,
  Gauge,
  Grid3x3,
  Loader2,
  PauseCircle,
  RadioTower,
  ScanLine,
  Search,
  Target,
  UserRound,
  Users,
  Workflow,
} from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { TanqueVisual } from "@/components/TanqueVisual"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import { AREAS, CARGOS, GRUPOS, TURNO_TIPOS, nombrePorCodigo, type AreaCodigo } from "@/lib/catalogos"
import { useCatalogosLive, velocidadesParaLive, type LineaLive, type PresentacionLive } from "@/lib/catalogosLive"
import {
  badgeVariantPorNivel,
  colorTextoPorNivel,
  horasTurno,
  MERMA_DANGER_DESDE,
  mermaAgregada,
  MERMA_WARN_DESDE,
  nivelMerma,
  obtenerEstadisticas,
  type FilaEstadistica,
  type NivelMerma,
} from "@/lib/estadisticas"
import {
  calcularMeta,
  ajustesSemielaboradoTurno,
  cargoDeUsuario,
  type AjusteSemielaborado,
  mermaEnvasesTurno,
  mermaLineaTurno,
  mermaSemielaboradoTurno,
  obtenerEstadoPlantaActual,
  obtenerProduccionDia,
  obtenerResumenTurnoAnterior,
  obtenerTurnoDeFechaTipo,
  type ProduccionDiaItem,
  type ResumenTurnoAnterior,
} from "@/lib/panelProduccion"
import { type TurnoActivo } from "@/lib/turno"
import { desglosarCalculos } from "@/lib/calculosPruebas"
import { fechaJornada, obtenerProgramacionDia, type ProgramacionItem as PlanDiaItem } from "@/lib/programacion"
import { cn } from "@/lib/utils"

/** La merma de semielaborado tiene su propia tolerancia, más estricta que la de envases — amarillo/rojo proporcionales a ese máximo, en vez de los umbrales fijos (3%/5%) de la merma de envase. */
const MERMA_SEMIELABORADO_MAX = 1.5
const MERMA_SEMIELABORADO_WARN = (MERMA_SEMIELABORADO_MAX * 2) / 3
const TANK_CAPACITY = 20000

/**
 * Cada cuánto el Panel se refresca solo cuando está EN VIVO, para que
 * nadie quede mirando datos viejos si deja la pestaña abierta. Es un
 * refresco silencioso (sin spinner de pantalla completa). No aplica
 * cuando se está viendo un turno histórico elegido a mano.
 */
const REFRESCO_EN_VIVO_MS = 30 * 60 * 1000

/** El Área de Pruebas nunca debe verse desde el Panel de Producción — ni como selección explícita. */
const AREAS_SELECCIONABLES = AREAS.filter((a) => a.codigo !== "PRUEBAS")

/** Color real de la fruta cuando el sabor la nombra (Manzana, Durazno, Naranja, Pera, y variantes como "Naranja 100%"). */
const COLOR_POR_FRUTA: Array<{ fruta: RegExp; color: string }> = [
  { fruta: /manzana/i, color: "var(--flavor-red)" },
  { fruta: /durazno/i, color: "var(--flavor-yellow)" },
  { fruta: /naranja/i, color: "var(--flavor-orange)" },
  { fruta: /pera/i, color: "var(--flavor-green)" },
]
/** Sabores sin fruta reconocida (ej. Mango) ciclan esta paleta según su nombre, para seguir siendo estables. */
const COLORES_SABOR = ["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]
function colorSabor(nombre: string | null): string {
  if (!nombre) return "var(--muted-foreground)"
  const fruta = COLOR_POR_FRUTA.find((f) => f.fruta.test(nombre))
  if (fruta) return fruta.color
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % 997
  return COLORES_SABOR[hash % COLORES_SABOR.length]
}

const HORARIOS: Record<string, { inicio: string; fin: string }> = {
  TURNO_1: { inicio: "07:00", fin: "15:00" },
  TURNO_2: { inicio: "15:00", fin: "22:30" },
  TURNO_3: { inicio: "22:30", fin: "07:00" },
  "12X12": { inicio: "07:00", fin: "19:00" },
}

function haceDias(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function turnoTipoActual(): string {
  const ahora = new Date().getHours() * 60 + new Date().getMinutes()
  if (ahora >= 7 * 60 && ahora < 15 * 60) return "TURNO_1"
  if (ahora >= 15 * 60 && ahora < 22 * 60 + 30) return "TURNO_2"
  return "TURNO_3"
}

type EstadoLinea = "activa" | "parada" | "esperando_cierre" | "libre"

interface LineaConEstado {
  codigo: string
  nombre: string
  estado: EstadoLinea
  corrida: TurnoActivo["lineas"][number] | null
  /** Falla u observación cargada al dejar la línea en DETENIDA — solo cuando aplica. null si no hay. */
  observacion: string | null
}

/** Fila de la tabla "Líneas activas": estado + producción + merma, todo junto. */
interface FilaLineaCompacta extends LineaConEstado {
  cajas: number
  litros: number
  eficienciaPct: number | null
  mermaPct: number | null
  /** Minutos desde que se marcó Parada (pausadaEn) — null si no está parada. */
  minutosParada: number | null
  /**
   * TP = Tiempo de Producción: minutos desde que se activó la corrida
   * (activadaEn) — null si no hay corrida activa ahora mismo. Por
   * ahora es solo el tiempo corrido desde que arrancó; cuando se
   * agreguen paradas reales (no el mock de "Tiempo detenida"), esto
   * debería restarles el tiempo pausado en vez de contar todo seguido.
   */
  minutosProduccion: number | null
}

/** DEV: ejemplo de observación de ~140 caracteres para ver cómo cae en la fila de la línea. Nunca llega al build. */
const MOCK_OBSERVACION_LINEA =
  "Falla en la selladora: recalienta y corta el film cada 15 minutos. Mantenimiento revisó, falta repuesto del termostato — llega mañana.".slice(
    0,
    140,
  )

/** "125 min" hasta la hora, "2h 5min" de ahí para arriba. */
function formatDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`
}

const ESTADO_LINEA_INFO: Record<EstadoLinea, { label: string; dot: string; ring: string }> = {
  activa: { label: "Activa", dot: "bg-success", ring: "bg-success" },
  parada: { label: "Parada", dot: "bg-warning", ring: "bg-warning" },
  esperando_cierre: { label: "Esperando cierre", dot: "bg-danger", ring: "bg-danger" },
  libre: { label: "Libre", dot: "bg-muted-foreground", ring: "bg-muted-foreground" },
}

/**
 * "Última actualización" real: el máximo de todos los timestamps que
 * ya trae el turno (líneas, tanques, contadores, producto terminado,
 * preparaciones) — NO cuándo esta pantalla hizo el último fetch. Así
 * no se resetea a "hace 0s" cada vez que se entra o se cambia de
 * pantalla y se vuelve; solo se mueve cuando alguien realmente cargó
 * algo.
 */
function ultimaAccionDeTurno(turno: TurnoActivo): Date | null {
  const timestamps = [
    ...turno.lineas.map((l) => l.activadaEn),
    ...turno.tanques.map((t) => t.activadaEn),
    ...turno.contadores.map((c) => c.creadoEn),
    ...turno.productoTerminado.map((p) => p.creadoEn),
    ...turno.preparaciones.map((p) => p.creadoEn),
  ].filter((t): t is string => Boolean(t))

  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps.map((t) => new Date(t).getTime())))
}

/** Una fila por línea del área (catálogo completo), cruzada con la corrida actual/últimamente tocada de turno.lineas. */
function estadoDeLineas(turno: TurnoActivo, lineasCatalogo: LineaLive[]): LineaConEstado[] {
  return lineasCatalogo.map((lc) => {
    const corridas = turno.lineas.filter((l) => l.linea === lc.codigo)
    const estadoContinuo = turno.lineasEstado.find((e) => e.linea === lc.codigo)
    // La nota solo tiene sentido mostrarla cuando la línea está DETENIDA y sin corrida activa.
    const observacion = estadoContinuo?.condicion === "DETENIDA" ? estadoContinuo.observacion : null

    const activa = corridas.find((l) => l.activa)
    if (activa) {
      return { codigo: lc.codigo, nombre: lc.nombre, estado: activa.pausadaEn ? "parada" : "activa", corrida: activa, observacion: null }
    }
    const esperandoCierre = corridas.find((l) => l.esperandoCierre)
    if (esperandoCierre) {
      return { codigo: lc.codigo, nombre: lc.nombre, estado: "esperando_cierre", corrida: esperandoCierre, observacion }
    }
    return { codigo: lc.codigo, nombre: lc.nombre, estado: "libre", corrida: null, observacion }
  })
}

interface ProduccionLinea {
  linea: string
  cajas: number
  litros: number
  eficienciaPct: number | null
}

/** Cajas, litros y eficiencia de CADA línea del catálogo, para la tabla combinada del banner. */
function produccionPorLineaDe(
  turno: TurnoActivo,
  lineasCatalogo: LineaLive[],
  presentaciones: PresentacionLive[],
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"],
): ProduccionLinea[] {
  return lineasCatalogo.map((lc) => {
    const productoLinea = turno.productoTerminado.filter((p) => p.linea === lc.codigo)
    const cajas = productoLinea.reduce((a, p) => {
      const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
      return a + p.paletas * (pres?.cajasXPaleta ?? 0) + p.cajasSueltas
    }, 0)
    const litros = productoLinea.reduce((a, p) => a + p.litrosProducidos, 0)

    const corridaActiva = turno.lineas.find((l) => l.linea === lc.codigo && l.activa)
    let eficienciaPct: number | null = null
    if (corridaActiva) {
      const opciones = velocidadesParaLive(velocidades, corridaActiva.linea, corridaActiva.presentacion)
      const maxima = Math.max(corridaActiva.envasesHora, ...opciones.map((o) => o.envasesHora))
      eficienciaPct = maxima > 0 ? Math.round((corridaActiva.envasesHora / maxima) * 100) : 0
    }

    return { linea: lc.codigo, cajas, litros, eficienciaPct }
  })
}

/*
 * Panel de Producción: vista EN VIVO del turno en curso (banner de
 * cabecera con hora/cajas/litros/meta/supervisor, y abajo tanques,
 * líneas y merma del turno anterior) — con selector de fecha/turno
 * para ver turnos anteriores.
 *
 * Rediseño visual 2026-08: la lógica (calcularMeta, estadoDeLineas,
 * cajasPorPresentacionDe, obtener*) quedó intacta; sólo cambió la
 * presentación. Utilidades CSS nuevas (panel-banner, panel-grid,
 * shadow-panel, tank-glass, liquid-bubble, dot-ring, rise-in) viven
 * al final de src/index.css.
 *
 * "Top Fallas" sigue siendo placeholder — el catálogo de paradas
 * todavía no existe (ver resumen-diseno-dashboard-natulac.md).
 *
 * "Resumen de planta" (al final) es lo que antes vivía en Mis
 * Estadísticas: KPIs, matriz grupo × supervisor, y tablas por grupo y
 * por supervisor sobre un rango de fechas — independiente del turno
 * elegido arriba.
 */
export default function PanelProduccion() {
  const { session } = useAuth()
  /** Para el supervisor, tanques y líneas del panel llevan a Preparación (donde puede tocarlos). */
  const esSupervisor = session?.rol === "SUPERVISOR"
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enVivo, setEnVivo] = useState(true)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [turnoTipo, setTurnoTipo] = useState(() => turnoTipoActual())
  const [buscado, setBuscado] = useState(false)
  const [turnoAnterior, setTurnoAnterior] = useState<ResumenTurnoAnterior | null>(null)
  /** Cargo (rótulo del puesto) del supervisor del turno, para mostrarlo junto al nombre. */
  const [supervisorCargo, setSupervisorCargo] = useState<string | null>(null)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())
  /** Sube cada REFRESCO_EN_VIVO_MS; dispara la recarga silenciosa del turno en vivo y de los datos de la jornada. */
  const [tickRefresco, setTickRefresco] = useState(0)
  const [planDia, setPlanDia] = useState<PlanDiaItem[]>([])
  /*
   * Producción acumulada de la jornada (los 3 turnos del día), solo en
   * modo EN VIVO. El banner la usa para Cajas / Litros y el "hecho" del
   * carrusel, para que al abrir un turno nuevo no caiga todo a 0 —
   * arranca mostrando lo que ya dejó el turno anterior.
   */
  const [produccionDia, setProduccionDia] = useState<ProduccionDiaItem[]>([])
  /*
   * Solo el Super Administrador tiene session.area === null ("ve
   * todas las áreas") — sin este filtro, "en vivo" mostraba el turno
   * más reciente de CUALQUIER área, mezclando el Área de Pruebas con
   * la producción real. El resto de los roles ya tiene su área fija
   * en la sesión, no necesita elegir.
   */
  const [areaFiltro, setAreaFiltro] = useState<AreaCodigo | "TODAS">(session?.area ?? "ASEPTICO")
  const areaEfectiva = session?.area ?? (areaFiltro === "TODAS" ? null : areaFiltro)

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

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000)
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

  async function cargarTurnoAnterior(turnoActualId: string | null) {
    if (!areaEfectiva) {
      setTurnoAnterior(null)
      return
    }
    setTurnoAnterior(await obtenerResumenTurnoAnterior(areaEfectiva, turnoActualId, presentaciones))
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
    const t = await obtenerTurnoDeFechaTipo(f, tt, areaEfectiva)
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

  const meta = turno ? calcularMeta(turno, presentaciones) : null
  const horario = HORARIOS[turnoTipo]
  const litrosProducidos = turno ? turno.productoTerminado.reduce((a, p) => a + p.litrosProducidos, 0) : 0
  const lineasEstado = turno ? estadoDeLineas(turno, lineas) : []
  const produccionPorLinea = turno ? produccionPorLineaDe(turno, lineas, presentaciones, velocidades) : []
  const cajasProducidasTotal = produccionPorLinea.reduce((a, l) => a + l.cajas, 0)
  /*
   * "Producción del turno": Cajas / Litros del banner son SIEMPRE del
   * turno cargado — se mueven con lo que carga el supervisor activo. El
   * acumulado de la jornada (los 3 turnos) solo lo usa el carrusel de
   * Programación diaria, para cruzarlo contra el plan del día.
   */
  const usarDiario = enVivo && produccionDia.length > 0
  const mermaEnvases = turno ? mermaEnvasesTurno(turno, presentaciones) : null
  const mermaSemielaborado = turno ? mermaSemielaboradoTurno(turno) : null
  /*
   * Programación diaria: el carrusel del banner cruza el PLAN del día
   * (módulo Programación, por sabor y en cajas) con lo HECHO (cajas de
   * Producto Terminado del turno, agrupadas por sabor). Primero van los
   * sabores del plan; después, cualquier sabor producido que no estaba
   * planificado (plan = null).
   */
  const programacionItems = useMemo<ProgramacionItem[]>(() => {
    // Cajas hechas por (sabor + presentación en ml). En vivo se toma el
    // acumulado de la jornada (produccion_dia_de, ya agrupado por
    // sabor+ml); si no, el Producto Terminado del turno cargado — que
    // trae la presentación como string de volumen_ml en p.presentacion.
    const hecho = new Map<string, number>()
    const claveDe = (sabor: string, ml: number | null) => `${sabor}|${ml ?? ""}`
    if (usarDiario) {
      for (const p of produccionDia) {
        const k = claveDe(p.saborNombre, p.presentacionMl)
        hecho.set(k, (hecho.get(k) ?? 0) + p.cajas)
      }
    } else {
      for (const p of turno?.productoTerminado ?? []) {
        const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
        const cajas = p.paletas * (pres?.cajasXPaleta ?? 0) + p.cajasSueltas
        const k = claveDe(p.saborNombre ?? "—", Number(p.presentacion) || null)
        hecho.set(k, (hecho.get(k) ?? 0) + cajas)
      }
    }

    const delPlan: ProgramacionItem[] = planDia.map((p) => ({
      sabor: p.saborNombre,
      presentacionMl: p.presentacionMl,
      hecho: hecho.get(claveDe(p.saborNombre, p.presentacionMl)) ?? 0,
      plan: p.cajasPlan,
    }))
    const clavesPlan = new Set(planDia.map((p) => claveDe(p.saborNombre, p.presentacionMl)))
    const extra: ProgramacionItem[] = [...hecho.entries()]
      .filter(([k]) => !clavesPlan.has(k))
      .sort((a, b) => b[1] - a[1])
      .map(([k, cajas]) => {
        const [sabor, ml] = k.split("|")
        return { sabor, presentacionMl: ml ? Number(ml) : null, hecho: cajas, plan: null }
      })

    const items = [...delPlan, ...extra]

    // DEV: ejemplo SOLO en `npm run dev` para ver el carrusel girar
    // cuando no hay plan ni producción cargados. Nunca llega al build.
    if (import.meta.env.DEV && items.length < 2) {
      return [
        { sabor: "Manzana", presentacionMl: 1000, hecho: 300, plan: 4000 },
        { sabor: "Pera", presentacionMl: 250, hecho: 0, plan: 2000 },
      ]
    }

    return items
  }, [turno, presentaciones, planDia, produccionDia, usarDiario])
  /*
   * DEV: números de ejemplo para Cajas / Litros del banner cuando el
   * turno en vivo todavía no produjo nada. `import.meta.env.DEV` es
   * false en el build, así que nunca sale del `npm run dev`.
   */
  const cajasDisplay = import.meta.env.DEV && cajasProducidasTotal === 0 ? 1840 : cajasProducidasTotal
  const litrosDisplay = import.meta.env.DEV && litrosProducidos === 0 ? 24680 : litrosProducidos
  /** Una fila por línea: estado + producción + merma juntos (antes vivían en 3 lugares separados de la pantalla). */
  const filasLineas: FilaLineaCompacta[] = lineasEstado.map((le) => {
    const prod = produccionPorLinea.find((p) => p.linea === le.codigo)
    // Sumando TODAS las corridas de la línea en el turno, igual que el
    // contador — así un lote recién arrancado (sin datos propios
    // todavía) no le hace perder de vista la merma que sí lleva
    // acumulada la línea en este turno.
    const merma = turno ? mermaLineaTurno(turno, le.codigo, presentaciones) : null
    const minutosParada = le.corrida?.pausadaEn
      ? Math.max(0, Math.round((ahora.getTime() - new Date(le.corrida.pausadaEn).getTime()) / 60000))
      : null
    const minutosProduccion =
      le.estado === "activa" && le.corrida
        ? Math.max(0, Math.round((ahora.getTime() - new Date(le.corrida.activadaEn).getTime()) / 60000))
        : null
    return {
      ...le,
      cajas: prod?.cajas ?? 0,
      litros: prod?.litros ?? 0,
      eficienciaPct: prod?.eficienciaPct ?? null,
      mermaPct: merma?.pct ?? null,
      minutosParada,
      minutosProduccion,
    }
  })
  // DEV: si ninguna línea trae observación real, mete el ejemplo en la
  // primera que no esté activa (solo en `npm run dev`) para ver cómo se
  // ve la nota larga en el dashboard.
  if (import.meta.env.DEV && !filasLineas.some((f) => f.observacion)) {
    const objetivo = filasLineas.find((f) => f.estado !== "activa") ?? filasLineas[0]
    if (objetivo) objetivo.observacion = MOCK_OBSERVACION_LINEA
  }
  const lineaParadaHaceMas = [...filasLineas]
    .filter((f) => f.minutosParada !== null)
    .sort((a, b) => (b.minutosParada ?? 0) - (a.minutosParada ?? 0))[0] ?? null
  const hh = String(ahora.getHours()).padStart(2, "0")
  const mm = String(ahora.getMinutes()).padStart(2, "0")
  const ss = String(ahora.getSeconds()).padStart(2, "0")

  const tanquesListos = turno ? turno.tanques.filter((t) => t.condicion === "LISTO").length : 0
  const lineasActivas = lineasEstado.filter((l) => l.estado === "activa").length
  const ultimaAccion = turno ? ultimaAccionDeTurno(turno) : null
  const segundosDesdeActualizacion = ultimaAccion
    ? Math.max(0, Math.round((ahora.getTime() - ultimaAccion.getTime()) / 1000))
    : null
  const textoUltimaActualizacion =
    segundosDesdeActualizacion === null
      ? null
      : segundosDesdeActualizacion < 60
        ? `hace ${segundosDesdeActualizacion}s`
        : `hace ${Math.floor(segundosDesdeActualizacion / 60)} min`

  return (
    <AppShell title="Panel de Producción" description="Estado de la planta en vivo" fullWidth ocultarEstadoBanner>
      <div className="flex flex-col gap-5">
        {/* ---------------- BANNER SUPERIOR ---------------- */}
        <section className="panel-banner shadow-panel relative overflow-hidden rounded-2xl border border-border">
          <div className="panel-grid pointer-events-none absolute inset-0 opacity-40" />

          <div className="relative flex flex-wrap items-center gap-2.5 border-b border-border/70 px-5 py-3">
            {turno?.estado === "ABIERTO" ? (
              <Badge variant="success" className="gap-1.5 py-1">
                <span className="relative flex size-1.5">
                  <span className="dot-ring absolute inset-0 rounded-full bg-success" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                <Activity className="size-3.5" />
                En Operación
              </Badge>
            ) : turno ? (
              <Badge variant="muted" className="gap-1.5 py-1">
                <RadioTower className="size-3.5" />
                Turno cerrado
              </Badge>
            ) : (
              <Badge variant="muted" className="gap-1.5 py-1">
                <RadioTower className="size-3.5" />
                {buscado ? "Sin turnos registrados" : "Cargando"}
              </Badge>
            )}

            <button
              type="button"
              onClick={() => setMostrarFiltros((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                enVivo ? "border-success/50 bg-success-soft text-success" : "border-primary/50 bg-primary/10 text-primary",
              )}
            >
              {enVivo ? (
                <>
                  <span className="relative flex size-1.5">
                    <span className="dot-ring absolute inset-0 rounded-full bg-success" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                  </span>
                  EN VIVO
                </>
              ) : (
                <>
                  <CalendarDays className="size-3.5" />
                  FECHA: {fecha} · {nombrePorCodigo(TURNO_TIPOS, turnoTipo)}
                </>
              )}
            </button>

            {textoUltimaActualizacion && <span className="text-[11px] text-muted-foreground">Última actualización {textoUltimaActualizacion}</span>}

            {!session?.area && (
              <button
                type="button"
                onClick={() => setMostrarFiltros(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground"
              >
                <Building2 className="size-3.5" />
                {areaFiltro === "TODAS" ? "Todas las áreas" : nombrePorCodigo(AREAS, areaFiltro)}
              </button>
            )}

            {turno && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">
                  <UserRound className="size-3.5 text-primary" />
                  {turno.supervisorNombre}
                  {supervisorCargo && (
                    <span className="text-muted-foreground">· {nombrePorCodigo(CARGOS, supervisorCargo)}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  Turno {turno.codigo} · {nombrePorCodigo(GRUPOS, turno.grupo)}
                  {turno.estado === "CERRADO" && turno.horaFin ? ` · Cerrado ${turno.horaFin.slice(0, 5)}` : ""}
                </span>
              </>
            )}
          </div>

          {turno && meta && (
            <>
              <div className="relative grid grid-cols-1 divide-y divide-border/70 md:grid-cols-4 md:divide-x md:divide-y-0">
                {/* HORA */}
                <BannerCelda icon={Clock} label="Hora" centrado>
                  <p className="num flex items-baseline justify-center gap-1 text-4xl font-bold leading-none tracking-tight text-foreground">
                    {hh}
                    <span className="alert-pulse text-muted-foreground">:</span>
                    {mm}
                    <span className="text-lg font-semibold text-muted-foreground">:{ss}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {horario ? `Turno de ${horario.inicio} a ${horario.fin}` : "Sin horario definido"}
                  </p>
                </BannerCelda>

                {/* PRODUCCIÓN — cajas + litros compactados en una sola celda para dejar libre la de Programación */}
                <BannerCelda icon={Boxes} label="Producción del turno" acento centrado>
                  <div className="flex items-stretch divide-x divide-border/70">
                    <div className="flex flex-1 flex-col items-center px-3">
                      <p className="num text-3xl font-bold leading-none tracking-tight text-foreground">
                        {cajasDisplay.toLocaleString("es-CO")}
                      </p>
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cajas</p>
                    </div>
                    <div className="flex flex-1 flex-col items-center px-3">
                      <p className="num text-3xl font-bold leading-none tracking-tight text-info">
                        {litrosDisplay.toLocaleString("es-CO")}
                        <span className="ml-0.5 text-sm font-semibold text-info/60">L</span>
                      </p>
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Litros</p>
                    </div>
                  </div>
                </BannerCelda>

                {/* PROGRAMACIÓN — carrusel de sabores del día, rota cada 2.5s (plan diario pendiente de módulo) */}
                <BannerCelda icon={ClipboardList} label="Programación diaria" centrado>
                  <ProgramacionCarrusel items={programacionItems} />
                </BannerCelda>

                {/* META */}
                <BannerCelda icon={Target} label="Cumplimiento de meta" centrado>
                  <MetaAnillo pct={meta.pctCumplimiento} reales={meta.totalReales} esperadas={meta.totalEsperadas} />
                </BannerCelda>
              </div>
            </>
          )}
        </section>

        {mostrarFiltros && (
          <Card className="border-border bg-surface shadow-sm">
            <CardContent className="flex flex-wrap items-end gap-3">
              {!session?.area && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-muted-foreground">Área</span>
                  <Select value={areaFiltro} onValueChange={(v) => setAreaFiltro(v as AreaCodigo | "TODAS")}>
                    <SelectTrigger className="w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AREAS_SELECCIONABLES.map((a) => (
                        <SelectItem key={a.codigo} value={a.codigo}>
                          {a.nombre}
                        </SelectItem>
                      ))}
                      <SelectItem value="TODAS">Todas las áreas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">Turno</span>
                <Select
                  value={turnoTipo}
                  onValueChange={(v) => {
                    setTurnoTipo(v)
                    buscarFechaTipo(fecha, v)
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TURNO_TIPOS.map((t) => (
                      <SelectItem key={t.codigo} value={t.codigo}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">Fecha</span>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => {
                    setFecha(e.target.value)
                    buscarFechaTipo(e.target.value, turnoTipo)
                  }}
                  className="w-[160px]"
                />
              </div>

              <Button variant="outline" size="sm" onClick={() => cargarEnVivo()} disabled={cargando}>
                {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <RadioTower className="size-3.5" />}
                Ver en vivo
              </Button>
            </CardContent>
          </Card>
        )}

        {cargando || cargandoCatalogos ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !turno ? (
          <EmptyState
            icon={Gauge}
            title={enVivo ? "Todavía no se registró ningún turno" : "No hay ningún turno para esa fecha/turno"}
            description={
              enVivo
                ? "En cuanto un supervisor inicie el primer turno, tanques y líneas van a aparecer acá."
                : "Prueba con otra fecha o tipo de turno."
            }
          />
        ) : (
          <>
            {/* ------- TANQUES (angosta, izquierda, alta) · LÍNEAS + MERMAS/PARADAS (derecha) ------- */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
              <div className="rise-in flex flex-col gap-4 xl:col-span-4">
                <PanelCard icon={Container} titulo="Tanques" meta={`${tanquesListos}/${turno.tanques.length} listos`}>
                  <div className="grid grid-cols-3 gap-3">
                    {turno.tanques.map((t) =>
                      esSupervisor ? (
                        <Link
                          key={t.numeroTanque}
                          to="/preparacion"
                          className="rounded-xl outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring"
                          title="Ir a Preparación"
                        >
                          <TanqueCard tanque={t} preparaciones={turno.preparaciones} />
                        </Link>
                      ) : (
                        <TanqueCard key={t.numeroTanque} tanque={t} preparaciones={turno.preparaciones} />
                      ),
                    )}
                  </div>
                </PanelCard>

                <PanelCard icon={PauseCircle} titulo="Parada con mayor duración" meta={lineaParadaHaceMas ? undefined : "Mock"}>
                  {lineaParadaHaceMas ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{lineaParadaHaceMas.nombre}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lineaParadaHaceMas.corrida?.saborNombre ?? "Sin sabor"}
                        </p>
                      </div>
                      <span className="num shrink-0 text-lg font-bold text-warning">
                        {formatDuracion(lineaParadaHaceMas.minutosParada ?? 0)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 opacity-60">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">Línea 2</p>
                        <p className="truncate text-xs text-muted-foreground">Manzana (Jucosa) — vista previa, sin parada real ahora</p>
                      </div>
                      <span className="num shrink-0 text-lg font-bold text-warning">{formatDuracion(14)}</span>
                    </div>
                  )}
                </PanelCard>
              </div>

              <div className="flex flex-col gap-4 xl:col-span-8">
                <PanelCard
                  className="rise-in"
                  icon={Workflow}
                  titulo="Líneas activas"
                  meta={`${lineasActivas}/${lineasEstado.length} en marcha`}
                >
                  {filasLineas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Esta área todavía no tiene líneas cargadas.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="min-w-[660px]">
                        <div className="linea-fila-grid border-b border-border px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>Línea</span>
                          <span className="text-right">Cajas producidas</span>
                          <span className="text-right">Litros producidos</span>
                          <span className="text-right">Eficiencia</span>
                          <span className="text-right">Tiempo detenida</span>
                          <span className="text-right">Merma</span>
                        </div>
                        {filasLineas.map((f) =>
                          esSupervisor ? (
                            <Link key={f.codigo} to="/preparacion" className="block" title="Ir a Preparación y Producción">
                              <LineaFilaCompacta fila={f} />
                            </Link>
                          ) : (
                            <LineaFilaCompacta key={f.codigo} fila={f} />
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </PanelCard>

                {/* ------- MERMA DE ENVASE · MERMA DE SEMIELABORADO ------- */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MermaComparativaCard
                    titulo="Merma de envase"
                    pasado={turnoAnterior?.mermaPct ?? null}
                    actual={mermaEnvases?.pct ?? null}
                  />
                  <MermaComparativaCard
                    titulo="Rendimiento"
                    pasado={turnoAnterior?.mermaSemielaboradoPct ?? null}
                    actual={mermaSemielaborado?.pct ?? null}
                    dangerDesde={MERMA_SEMIELABORADO_MAX}
                    warnDesde={MERMA_SEMIELABORADO_WARN}
                    invertido
                  />
                </div>
              </div>
            </div>

            {/* ------- SECCIONES SECUNDARIAS ------- */}
            <div className="flex flex-col gap-3">
              <TituloSeccion>Detalle del turno</TituloSeccion>

              <SeccionColapsable
                titulo="Meta por línea"
                descripcion="Cajas reales vs. esperadas (velocidad elegida × horas transcurridas), por línea."
              >
                {meta!.porLinea.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguna línea en uso este turno.</p>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {meta!.porLinea.map((m) => {
                      const pct = m.cajasEsperadas > 0 ? Math.min(100, Math.round((m.cajasReales / m.cajasEsperadas) * 100)) : 0
                      return (
                        <div key={m.linea} className="rounded-xl border border-border bg-background/60 p-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {nombrePorCodigo(lineas, m.linea)}
                            </span>
                            <span className="num text-xs font-semibold text-foreground">{pct}%</span>
                          </div>
                          <p className="num mt-1 text-2xl font-bold leading-none">
                            {m.cajasReales.toLocaleString("es-CO")}
                            <span className="text-sm font-medium text-muted-foreground">
                              {" "}
                              / {m.cajasEsperadas.toLocaleString("es-CO")}
                            </span>
                          </p>
                          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-700",
                                pct >= 90 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </SeccionColapsable>

              <SeccionColapsable
                titulo="Paradas por línea"
                descripcion="El catálogo de paradas todavía no existe — esto va a explicar la diferencia entre la meta esperada y lo producido."
              >
                <ParadasPorLineaPlaceholder lineas={lineas} />
              </SeccionColapsable>

              {(areaEfectiva === "PRUEBAS" || areaEfectiva === "ASEPTICO") && (
                <SeccionColapsable
                  titulo="Desglose de cálculo"
                  descripcion="Números crudos detrás de cada merma y meta — envases, litros y cajas que alimentan cada porcentaje del turno."
                >
                  <DesgloseCalculosPanel turno={turno} />
                </SeccionColapsable>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-3">
          <TituloSeccion>Histórico</TituloSeccion>
          <SeccionColapsable titulo="Resumen de Planta" descripcion="KPIs, matriz grupo × supervisor y tablas en un rango de fechas.">
            <ResumenPlanta areaCodigo={areaEfectiva} />
          </SeccionColapsable>
        </div>
      </div>
    </AppShell>
  )
}

/* ============================ PIEZAS DE UI ============================ */

function TituloSeccion({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

interface ProgramacionItem {
  sabor: string
  /** Presentación en ml — null si es un sabor producido sin presentación identificable. */
  presentacionMl: number | null
  /** Cajas ya producidas (real). */
  hecho: number
  /** Objetivo del día en cajas — null si se produjo un sabor+presentación que no estaba en el plan. */
  plan: number | null
}

/**
 * Carrusel del banner: rota los renglones del plan del día cada 2.5s,
 * mostrando "SABOR · 1000 ml  hecho / plan" (plan del módulo
 * Programación; hecho del Producto Terminado del turno).
 */
function ProgramacionCarrusel({ items }: { items: ProgramacionItem[] }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 2500)
    return () => clearInterval(t)
  }, [items.length])

  if (items.length === 0) {
    return (
      <div>
        <p className="text-lg font-bold uppercase tracking-[0.14em] text-muted-foreground">Por programar</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Módulo en preparación</p>
      </div>
    )
  }

  const activo = idx % items.length
  const item = items[activo]

  return (
    <div>
      <div key={activo} className="carrusel-slide">
        <p className="truncate text-sm font-semibold uppercase tracking-wide text-primary">
          {item.sabor}
          {item.presentacionMl !== null && (
            <span className="font-medium text-muted-foreground"> · {item.presentacionMl} ml</span>
          )}
        </p>
        <p className="num mt-0.5 text-2xl font-bold leading-none tracking-tight text-foreground">
          {item.hecho.toLocaleString("es-CO")}
          <span className="text-base font-semibold text-muted-foreground">
            {" / "}
            {item.plan !== null ? item.plan.toLocaleString("es-CO") : "—"}
          </span>
        </p>
      </div>
      {items.length > 1 && (
        <div className="mt-2 flex justify-center gap-1">
          {items.map((it, i) => (
            <span
              key={it.sabor}
              className={cn("size-1 rounded-full transition-colors", i === activo ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BannerCelda({
  icon: Icon,
  label,
  acento,
  centrado,
  children,
}: {
  icon: typeof Clock
  label: string
  acento?: boolean
  centrado?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("px-4 py-3", acento && "bg-background/40", centrado && "text-center")}>
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
          centrado && "justify-center",
        )}
      >
        <Icon className="size-3 text-primary" />
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/** Anillo de cumplimiento — conic-gradient sobre tokens del tema. */
function MetaAnillo({ pct, reales, esperadas }: { pct: number | null; reales: number; esperadas: number }) {
  if (pct === null) {
    return (
      <div>
        <p className="num text-2xl font-bold leading-none tracking-tight text-muted-foreground">—</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Ninguna línea en uso.</p>
      </div>
    )
  }

  const clamped = Math.max(0, Math.min(100, pct))
  const color = clamped >= 90 ? "var(--success)" : clamped >= 60 ? "var(--warning)" : "var(--danger)"

  return (
    <div className="flex items-center justify-center gap-2.5">
      <div
        className="relative grid size-11 shrink-0 place-items-center rounded-full transition-all duration-700"
        style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, color-mix(in oklab, var(--muted) 90%, transparent) 0deg)` }}
      >
        <div className="grid size-8 place-items-center rounded-full bg-background">
          <span className="num text-[11px] font-bold" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="num text-lg font-bold leading-none">
          {reales.toLocaleString("es-CO")}
          <span className="text-xs font-medium text-muted-foreground"> / {esperadas.toLocaleString("es-CO")}</span>
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">Cajas reales vs. meta</p>
      </div>
    </div>
  )
}

function PanelCard({
  icon: Icon,
  titulo,
  meta,
  descripcion,
  className,
  children,
}: {
  icon: typeof Clock
  titulo: string
  meta?: string
  descripcion?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("shadow-panel gap-0 overflow-hidden border-border py-0", className)}>
      <div className="flex items-start justify-between gap-2 border-b border-border/70 bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Icon className="size-4 text-primary" />
            {titulo}
          </p>
          {descripcion && <p className="mt-1 truncate text-xs text-muted-foreground/80">{descripcion}</p>}
        </div>
        {meta && (
          <span className="num shrink-0 rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground">
            {meta}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  )
}

/** Mock estable (mismo código = mismo número) para previsualizar "Tiempo detenida" mientras no hay ninguna línea realmente parada. */
function mockMinutosDetenida(codigo: string): number {
  let hash = 0
  for (let i = 0; i < codigo.length; i++) hash = (hash * 31 + codigo.charCodeAt(i)) % 97
  return hash % 40
}

/** Fila compacta de "Líneas activas": estado + producción + merma en una sola línea — reemplaza a la fila alta de antes + la tablita aparte del banner. */
function LineaFilaCompacta({ fila }: { fila: FilaLineaCompacta }) {
  const info = ESTADO_LINEA_INFO[fila.estado]
  const nivelEficiencia: NivelMerma | null =
    fila.eficienciaPct === null ? null : fila.eficienciaPct >= 90 ? "ok" : fila.eficienciaPct >= 60 ? "warn" : "danger"
  const nivelMermaFila = fila.mermaPct === null ? null : nivelMerma(fila.mermaPct)
  const colorPor = colorTextoPorNivel
  const minutosDetenidaMock = fila.minutosParada ?? mockMinutosDetenida(fila.codigo)

  return (
    <div className="linea-fila-grid border-b border-border/60 px-2 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-muted/40">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex size-2.5 shrink-0 items-center justify-center">
          {fila.estado === "activa" && <span className={cn("dot-ring absolute size-2.5 rounded-full", info.ring)} />}
          <span className={cn("relative size-2.5 rounded-full", info.dot)} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {fila.nombre}
            {fila.corrida ? ` - ${fila.corrida.presentacion} ml` : ""}
          </p>
          {fila.corrida?.saborNombre && <p className="truncate text-xs text-muted-foreground">{fila.corrida.saborNombre}</p>}
          <p className="truncate text-xs text-muted-foreground">
            {info.label}
            {fila.minutosProduccion !== null ? ` - TP: ${formatDuracion(fila.minutosProduccion)}` : ""}
          </p>
          {fila.observacion && (
            <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-danger">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{fila.observacion}</span>
            </p>
          )}
        </div>
      </div>
      <p className="num text-right font-semibold text-foreground">{fila.cajas.toLocaleString("es-CO")}</p>
      <p className="num text-right font-semibold text-foreground">{fila.litros.toLocaleString("es-CO")} L</p>
      <p className={cn("num text-right font-semibold", colorPor(nivelEficiencia))}>
        {fila.eficienciaPct !== null ? `${fila.eficienciaPct}%` : "—"}
      </p>
      <p className={cn("num text-right font-semibold", fila.minutosParada !== null ? "text-warning" : "italic text-muted-foreground/60")}>
        {formatDuracion(minutosDetenidaMock)}
      </p>
      <p className={cn("num text-right font-semibold", colorPor(nivelMermaFila))}>
        {fila.mermaPct !== null ? `${fila.mermaPct.toFixed(2)}%` : "—"}
      </p>
    </div>
  )
}

function TanqueCard({
  tanque,
  preparaciones,
}: {
  tanque: TurnoActivo["tanques"][number]
  preparaciones: TurnoActivo["preparaciones"]
}) {
  const ultimaPrep = preparaciones
    .filter((p) => p.numeroTanque === tanque.numeroTanque)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0]

  const enPreparacion = tanque.condicion === "EN_PREPARACION"
  const listo = tanque.condicion === "LISTO"
  const standby = tanque.condicion === "STANDBY"
  const tieneLiquido = listo || standby
  const color = colorSabor(
    tanque.condicion === "SUCIO"
      ? tanque.ultimoSaborNombre
      : enPreparacion
        ? (ultimaPrep?.saborNombre ?? null)
        : tieneLiquido
          ? tanque.saborNombre
          : null,
  )

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-background/60 transition-shadow duration-300",
        listo ? "border-border hover:shadow-panel" : standby ? "border-secondary/50" : enPreparacion ? "border-warning/40" : "border-border",
      )}
    >
      <TanqueVisual
        numeroTanque={tanque.numeroTanque}
        condicion={tanque.condicion}
        volumenL={tanque.volumenL}
        volumenInicialL={tanque.volumenInicialL}
        color={color}
        capacidad={TANK_CAPACITY}
      />

      {/* Pie del tanque */}
      <div className="flex min-w-0 flex-col gap-1 border-t border-border/70 px-2.5 py-2">
        {tieneLiquido ? (
          <>
            <p className="num text-base font-bold leading-none">
              {(tanque.volumenL ?? 0).toLocaleString("es-CO")}
              <span className="text-[11px] font-medium text-muted-foreground"> L</span>
            </p>
            <span
              className="w-fit max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-background"
              style={{ backgroundColor: color }}
            >
              {tanque.saborNombre ?? "Sabor"}
            </span>
            {tanque.lote && (
              <p className="truncate text-[10px] text-muted-foreground">
                {standby ? "Resto del lote " : "Lote "}
                {tanque.lote}
              </p>
            )}
          </>
        ) : enPreparacion ? (
          <>
            <Badge variant="warning" className="w-fit">
              En Preparación
            </Badge>
            <p className="truncate text-[10px] text-muted-foreground">
              {ultimaPrep
                ? `${ultimaPrep.tambores}t · ${ultimaPrep.saborNombre ?? "Sin sabor"}${tanque.lote ? ` · Lote ${tanque.lote}` : ""}`
                : "Sin registrar aún."}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {tanque.condicion === "SUCIO"
              ? "Pendiente de limpieza."
              : tanque.condicion === "CIP"
                ? `Proceso de limpieza${tanque.cipIniciadoEn ? ` desde las ${tanque.cipIniciadoEn.slice(11, 16)}` : ""}.`
                : "Disponible para llenar."}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Comparativo Turno pasado vs. Turno actual para una merma — se usa
 * dos veces (envase y semielaborado). "Pasado" viene de
 * obtenerResumenTurnoAnterior(), "actual" de mermaEnvasesTurno()/
 * mermaSemielaboradoTurno() en src/lib/panelProduccion.ts. Cada
 * columna se colorea según su propio nivel de tolerancia.
 */
function MermaComparativaCard({
  titulo,
  pasado,
  actual,
  dangerDesde = MERMA_DANGER_DESDE,
  warnDesde = MERMA_WARN_DESDE,
  invertido = false,
}: {
  titulo: string
  pasado: number | null
  actual: number | null
  dangerDesde?: number
  warnDesde?: number
  /** Si es true, se muestra el rendimiento (100 - merma) en vez de la merma — los umbrales siguen siendo tolerancia de MERMA, no de rendimiento. */
  invertido?: boolean
}) {
  const nivelActual = actual === null ? null : nivelMerma(actual, dangerDesde, warnDesde)

  return (
    <Card
      className={cn(
        "shadow-panel gap-0 overflow-hidden border py-0",
        nivelActual === "danger" ? "border-danger/45" : nivelActual === "warn" ? "border-warning/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ScanLine className="size-4 text-primary" />
          {titulo}
        </p>
        <Badge variant="muted">{invertido ? `Mín. ${Math.round((100 - dangerDesde) * 100) / 100}%` : `Máx. ${dangerDesde}%`}</Badge>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/70">
        <MermaBloque titulo="Turno pasado" pct={pasado} dangerDesde={dangerDesde} warnDesde={warnDesde} invertido={invertido} />
        <MermaBloque titulo="Turno actual" pct={actual} dangerDesde={dangerDesde} warnDesde={warnDesde} invertido={invertido} />
      </div>

      {nivelActual === "danger" && (
        <p className="flex items-center gap-1 border-t border-border/70 px-3 py-2 text-[11px] font-medium text-danger">
          <AlertTriangle className="size-3" />
          {invertido ? "El turno actual está por debajo del rendimiento esperado." : "El turno actual está fuera de tolerancia."}
        </p>
      )}
    </Card>
  )
}

function MermaBloque({
  titulo,
  pct,
  dangerDesde = MERMA_DANGER_DESDE,
  warnDesde = MERMA_WARN_DESDE,
  invertido = false,
}: {
  titulo: string
  pct: number | null
  dangerDesde?: number
  warnDesde?: number
  invertido?: boolean
}) {
  const nivel = pct === null ? null : nivelMerma(pct, dangerDesde, warnDesde)
  const color = nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : nivel === "ok" ? "text-success" : undefined
  const valorMostrado = pct === null ? null : invertido ? Math.round((100 - pct) * 100) / 100 : pct
  return (
    <div className="min-w-0 px-3 py-5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={cn("num mt-2 truncate text-3xl font-bold leading-none", color)}>
        {valorMostrado !== null ? `${valorMostrado}%` : "—"}
      </p>
    </div>
  )
}

/** Placeholder de paradas por línea: la estructura ya está armada, solo falta el catálogo real de paradas. */
function ParadasPorLineaPlaceholder({ lineas }: { lineas: LineaLive[] }) {
  const motivosMock = [
    ["Falla mecánica", 8],
    ["Cambio de formato", 6],
    ["Falta de insumo", 4],
  ] as const
  const totalMock = motivosMock.reduce((a, [, minutos]) => a + minutos, 0)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lineas
        .filter((l) => l.activo)
        .map((l) => (
          <div key={l.codigo} className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{l.nombre}</h3>
              <span className="num text-xs font-semibold text-danger">{totalMock} min</span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {motivosMock.map(([motivo, minutos], i) => (
                <li key={motivo} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    <b className="num mr-1.5 text-primary">0{i + 1}</b>
                    {motivo}
                  </span>
                  <span className="num shrink-0 text-foreground">{minutos} min</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
    </div>
  )
}


/* ===================== DESGLOSE DE CÁLCULO (ÁREA DE PRUEBAS) ===================== */

/**
 * Los mismos números que verifica src/lib/calculosPruebas.test.ts, pero
 * sobre el turno que se está viendo: envases de llenadora vs. Producto
 * Terminado por corrida, litros consumidos vs. producidos, cajas reales
 * vs. esperadas. Se muestra en Aséptico y en el Área de Pruebas (ver la
 * condición sobre areaEfectiva en el render del Panel).
 */
function DesgloseCalculosPanel({ turno }: { turno: TurnoActivo }) {
  const { lineas, presentaciones, cargando } = useCatalogosLive()
  const d = desglosarCalculos(turno, presentaciones)
  const [ajustes, setAjustes] = useState<AjusteSemielaborado[]>([])

  useEffect(() => {
    let vivo = true
    ajustesSemielaboradoTurno(turno.id).then((a) => {
      if (vivo) setAjustes(a)
    })
    return () => {
      vivo = false
    }
  }, [turno.id])

  const totalAjuste = ajustes.reduce((a, x) => a + x.diferencia, 0)

  const fmt = (n: number | null, suf = "") => (n === null ? "—" : `${n.toLocaleString("es-CO")}${suf}`)
  const fmtSigno = (n: number, suf = "") =>
    `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("es-CO")}${suf}`

  if (cargando) {
    return <p className="text-sm text-muted-foreground">Cargando catálogos…</p>
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Horas transcurridas del turno:{" "}
        <span className="num font-semibold text-foreground">{d.horasTranscurridas}</span>{" "}
        {turno.estado === "CERRADO" ? "(hasta la hora de cierre)" : "(hasta ahora)"}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3 font-semibold">Corrida</th>
              <th className="py-1.5 pr-3 font-semibold">Lote</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Env. llenadora</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Env. prod. term.</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Merma envase</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Cajas reales</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Cajas esperadas</th>
            </tr>
          </thead>
          <tbody>
            {d.porCorrida.map((c) => (
              <tr key={c.turnoLineaId} className="border-b border-border/60">
                <td className="py-1.5 pr-3">
                  {nombrePorCodigo(lineas, c.linea)}
                  {c.presentacionMl ? <span className="text-muted-foreground"> · {c.presentacionMl} ml</span> : null}
                  {!c.activa ? <span className="text-muted-foreground"> · finalizada</span> : null}
                </td>
                <td className="py-1.5 pr-3">{c.lote ?? "—"}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.envasesLlenadora)}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.envasesProductoTerminado)}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.mermaEnvasePct, " %")}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.cajasReales)}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.cajasEsperadas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <DesgloseDato
          etiqueta="Merma de envase — turno"
          valor={fmt(d.mermaEnvaseTurnoPct, " %")}
          formula="1 − (Σ envases prod. term. ÷ Σ envases llenadora)"
        />
        <DesgloseDato
          etiqueta="Volumen inicial preparado (lotes cerrados)"
          valor={fmt(d.volumenInicial, " L")}
          formula="Σ volumen inicial de cada lote ya cerrado del turno"
        />
        <DesgloseDato
          etiqueta="Litros de Producto Terminado (lotes cerrados)"
          valor={fmt(d.litrosProducidos, " L")}
          formula="Σ litros de Producto Terminado de las corridas de esos lotes"
        />
        <DesgloseDato
          etiqueta="Rendimiento del semielaborado"
          valor={
            d.rendimientoTurnoPct === null
              ? d.hayLoteAbierto
                ? "— (lote abierto)"
                : "—"
              : `${Math.round((100 - d.rendimientoTurnoPct) * 100) / 100} %`
          }
          formula="litros de Producto Terminado ÷ volumen inicial preparado"
        />
        <DesgloseDato
          etiqueta="Merma de semielaborado"
          valor={d.rendimientoTurnoPct === null ? (d.hayLoteAbierto ? "— (lote abierto)" : "—") : fmt(d.rendimientoTurnoPct, " %")}
          formula="1 − (litros de Producto Terminado ÷ volumen inicial preparado), solo lotes cerrados"
        />
        {ajustes.length > 0 && (
          <DesgloseDato
            etiqueta="Ajuste teórico vs. real"
            valor={fmtSigno(totalAjuste, " L")}
            formula="correcciones manuales de volumen de lote (negativo = litros que faltaron)"
          />
        )}
        <DesgloseDato
          etiqueta="Cajas reales / esperadas"
          valor={`${fmt(d.cajasRealesTotal)} / ${fmt(d.cajasEsperadasTotal)}`}
          formula="corridas activas: velocidad ÷ envases por caja × horas"
        />
        <DesgloseDato
          etiqueta="Cumplimiento de meta"
          valor={fmt(d.cumplimientoTurnoPct, " %")}
          formula="cajas reales ÷ cajas esperadas"
        />
      </div>

      {ajustes.length > 0 && (
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Correcciones de volumen (teórico → real)
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs">
            {ajustes.map((a, i) => (
              <li key={i} className="text-foreground">
                {a.sabor}
                {a.lote ? ` · Lote ${a.lote}` : ""}: {Math.round(a.volumenTeorico).toLocaleString("es-CO")} L →{" "}
                {Math.round(a.volumenReal).toLocaleString("es-CO")} L{" "}
                <span className={a.diferencia < 0 ? "text-danger" : "text-muted-foreground"}>
                  ({fmtSigno(a.diferencia, " L")})
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {a.usuarioNombre ?? "—"} ·{" "}
                  {new Date(a.creadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DesgloseDato({ etiqueta, valor, formula }: { etiqueta: string; valor: string; formula: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="num mt-1 text-xl font-bold leading-none text-foreground">{valor}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{formula}</p>
    </div>
  )
}


/* ============================ RESUMEN DE PLANTA ============================ */

function ResumenPlanta({ areaCodigo }: { areaCodigo: AreaCodigo | null }) {
  const [fechaDesde, setFechaDesde] = useState(() => haceDias(30))
  const [fechaHasta, setFechaHasta] = useState("")
  const [filas, setFilas] = useState<FilaEstadistica[]>([])
  const [cargando, setCargando] = useState(true)

  async function buscar() {
    setCargando(true)
    const lista = await obtenerEstadisticas({ fechaDesde, fechaHasta, areaCodigo })
    setFilas(lista)
    setCargando(false)
  }

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaCodigo])

  const mermaProm = mermaAgregada(filas)
  const horasTotales = filas.reduce((acc, f) => acc + (horasTurno(f) ?? 0), 0)
  const litrosTotales = filas.reduce((acc, f) => acc + f.litrosProducidos, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Desde</span>
          <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hasta</span>
          <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={buscar} disabled={cargando}>
          {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          Buscar
        </Button>
        <span className="text-xs text-muted-foreground">
          Incluye turnos en curso{areaCodigo ? "" : " — todas las áreas (sin Pruebas)"}.
        </span>
      </div>

      {cargando ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : filas.length === 0 ? (
        <EmptyState icon={BarChart3} title="Sin datos" description="No hay turnos en ese rango de fechas." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <EstadisticaMerma titulo="Merma real" pct={mermaProm} />
            <EstadisticaTile icon={Clock} label="Horas de producción" valor={`${Math.round(horasTotales)} h`} />
            <EstadisticaTile icon={Droplets} label="Litros producidos" valor={litrosTotales.toLocaleString("es-CO")} />
          </div>

          <MatrizGrupoSupervisor filas={filas} />

          <div className="grid gap-4 xl:grid-cols-2">
            <TablaPorGrupo filas={filas} />
            <TablaPorSupervisor filas={filas} />
          </div>
        </div>
      )}
    </div>
  )
}

function EstadisticaTile({ icon: Icon, label, valor }: { icon: typeof Clock; label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </div>
      <p className="num mt-2 text-3xl font-bold leading-none">{valor}</p>
    </div>
  )
}

function EstadisticaMerma({ titulo, pct }: { titulo: string; pct: number | null }) {
  const nivel = pct === null ? null : nivelMerma(pct)
  const color = nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : "text-success"
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        nivel === "danger"
          ? "border-danger/35 bg-danger-soft"
          : nivel === "warn"
            ? "border-warning/35 bg-warning-soft"
            : "border-border bg-background/60",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Gauge className="size-3.5 text-primary" />
        {titulo}
      </div>
      <p className={cn("num mt-2 text-3xl font-bold leading-none", nivel !== null && color)}>{pct !== null ? `${pct}%` : "—"}</p>
      {nivel === "danger" && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
          <AlertTriangle className="size-3" /> Fuera de tolerancia
        </p>
      )}
    </div>
  )
}

/** Matriz supervisor × grupo: litros producidos, con intensidad de color según el máximo de la matriz. */
function MatrizGrupoSupervisor({ filas }: { filas: FilaEstadistica[] }) {
  const grupos = [...new Set(filas.map((f) => f.grupo))].sort((a, b) =>
    nombrePorCodigo(GRUPOS, a).localeCompare(nombrePorCodigo(GRUPOS, b)),
  )

  const supervisores = [...new Set(filas.map((f) => f.supervisorUsuario))]
    .map((usuario) => {
      const filasSup = filas.filter((f) => f.supervisorUsuario === usuario)
      return {
        usuario,
        nombre: filasSup[0]?.supervisorNombre ?? usuario,
        total: filasSup.reduce((a, f) => a + f.litrosProducidos, 0),
        porGrupo: Object.fromEntries(
          grupos.map((g) => [g, filasSup.filter((f) => f.grupo === g).reduce((a, f) => a + f.litrosProducidos, 0)]),
        ) as Record<string, number>,
      }
    })
    .sort((a, b) => b.total - a.total)

  const maxCelda = Math.max(1, ...supervisores.flatMap((s) => grupos.map((g) => s.porGrupo[g] ?? 0)))

  return (
    <Card className="shadow-panel gap-0 overflow-hidden border-border py-0">
      <div className="border-b border-border/70 bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Grid3x3 className="size-4 text-primary" />
          Matriz supervisor × grupo
        </p>
        <p className="mt-1 text-xs text-muted-foreground/80">Litros producidos por cruce; más intenso = más volumen.</p>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[520px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Supervisor
              </th>
              {grupos.map((g) => (
                <th key={g} className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {nombrePorCodigo(GRUPOS, g)}
                </th>
              ))}
              <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {supervisores.map((s) => (
              <tr key={s.usuario}>
                <td className="truncate pr-2 text-sm font-medium text-foreground">{s.nombre}</td>
                {grupos.map((g) => {
                  const v = s.porGrupo[g] ?? 0
                  const intensidad = Math.round((v / maxCelda) * 100)
                  return (
                    <td key={g} className="p-0">
                      <div
                        className="num grid h-10 place-items-center rounded-lg border border-border/60 text-xs font-semibold text-foreground transition-colors duration-300"
                        style={{
                          backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(intensidad * 0.55)}%, var(--background))`,
                        }}
                        title={`${s.nombre} · ${nombrePorCodigo(GRUPOS, g)}: ${v.toLocaleString("es-CO")} L`}
                      >
                        {v > 0 ? v.toLocaleString("es-CO") : "·"}
                      </div>
                    </td>
                  )
                })}
                <td className="num pl-2 text-right text-sm font-bold text-foreground">{s.total.toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TablaPorGrupo({ filas }: { filas: FilaEstadistica[] }) {
  const grupos = [...new Set(filas.map((f) => f.grupo))]
    .map((grupo) => {
      const filasGrupo = filas.filter((f) => f.grupo === grupo)
      return {
        grupo,
        merma: mermaAgregada(filasGrupo) ?? 0,
        litros: filasGrupo.reduce((a, f) => a + f.litrosProducidos, 0),
        horas: filasGrupo.reduce((a, f) => a + (horasTurno(f) ?? 0), 0),
      }
    })
    .sort((a, b) => nombrePorCodigo(GRUPOS, a.grupo).localeCompare(nombrePorCodigo(GRUPOS, b.grupo)))

  return (
    <Card className="shadow-panel gap-0 overflow-hidden border-border py-0">
      <div className="border-b border-border/70 bg-surface px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Users className="size-4 text-primary" />
          Por Grupo
        </CardTitle>
        <CardDescription className="mt-1 text-xs">Litros, horas y merma real por grupo de turno.</CardDescription>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wide">Grupo</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Litros</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Horas</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Merma real</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.map((g) => (
              <TableRow key={g.grupo}>
                <TableCell className="font-medium">{nombrePorCodigo(GRUPOS, g.grupo)}</TableCell>
                <TableCell className="num text-right">{g.litros.toLocaleString("es-CO")}</TableCell>
                <TableCell className="num text-right">{Math.round(g.horas)} h</TableCell>
                <TableCell className="text-right">
                  <Badge variant={badgeVariantPorNivel[nivelMerma(g.merma)]}>{g.merma.toFixed(1)}%</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function TablaPorSupervisor({ filas }: { filas: FilaEstadistica[] }) {
  const supervisores = [...new Set(filas.map((f) => f.supervisorUsuario))]
    .map((usuario) => {
      const filasSup = filas.filter((f) => f.supervisorUsuario === usuario)
      return {
        usuario,
        nombre: filasSup[0]?.supervisorNombre ?? usuario,
        merma: mermaAgregada(filasSup) ?? 0,
        litros: filasSup.reduce((a, f) => a + f.litrosProducidos, 0),
      }
    })
    .sort((a, b) => b.litros - a.litros)

  const maxLitros = Math.max(1, ...supervisores.map((s) => s.litros))

  return (
    <Card className="shadow-panel gap-0 overflow-hidden border-border py-0">
      <div className="border-b border-border/70 bg-surface px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <UserRound className="size-4 text-primary" />
          Por Supervisor
        </CardTitle>
        <CardDescription className="mt-1 text-xs">Litros producidos y merma real por supervisor.</CardDescription>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wide">Supervisor</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Litros</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Merma real</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supervisores.map((s) => (
              <TableRow key={s.usuario}>
                <TableCell className="font-medium">{s.nombre}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-700"
                        style={{ width: `${(s.litros / maxLitros) * 100}%` }}
                      />
                    </div>
                    <span className="num text-xs font-semibold">{s.litros.toLocaleString("es-CO")}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={badgeVariantPorNivel[nivelMerma(s.merma)]}>
                    {s.merma <= MERMA_WARN_DESDE && <CheckCircle2 className="size-3" />}
                    {s.merma.toFixed(1)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
