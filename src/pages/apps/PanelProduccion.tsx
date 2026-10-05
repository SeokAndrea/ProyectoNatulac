import { useEffect, useMemo, useState } from "react"
import { Gauge, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { BannerSuperior } from "@/components/panel/BannerSuperior"
import {
  estadoDeLineas,
  filasDeLineas,
  produccionPorLineaDe,
  programacionDelDia,
  textoUltimaActualizacion,
  ultimaAccionDeTurno,
} from "@/components/panel/calculosPanel"
import { DetalleTurno } from "@/components/panel/DetalleTurno"
import { FiltrosPanel } from "@/components/panel/FiltrosPanel"
import { TituloSeccion } from "@/components/panel/PanelCard"
import { ParadaMasLarga } from "@/components/panel/ParadaMasLarga"
import { ResumenPlanta } from "@/components/panel/resumen-planta/ResumenPlanta"
import { SeccionLineas } from "@/components/panel/SeccionLineas"
import { SeccionMermas } from "@/components/panel/SeccionMermas"
import { SeccionTanques } from "@/components/panel/SeccionTanques"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { type AreaCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import {
  cargoDeUsuario,
  type LecturaServiciosIndustriales,
  obtenerEstadoPlantaActual,
  obtenerLecturaServiciosIndustriales,
  obtenerProduccionDia,
  obtenerTurnoAnterior,
  obtenerTurnoDeFechaTipo,
  type ProduccionDiaItem,
} from "@/lib/panelProduccion"
import { type TurnoActivo } from "@/lib/turno"
import { horasTranscurridasTurno, mermaEnvasesTurno, mermaSemielaboradoTurno } from "@/lib/reportes"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { useProductoTerminado } from "@/lib/productoTerminado"
import { fechaJornada, obtenerProgramacionDia, type ProgramacionItem as PlanDiaItem } from "@/lib/programacion"
import { franjaDeHora } from "@/lib/tiempoPlanta"
import { listarParadas, minutosPorLinea, type Parada } from "@/lib/paradas"
import { eficienciaDelTurno } from "@/lib/eficiencia"
import { useCatalogoParadas } from "@/lib/paradasCatalogo"

/**
 * Cada cuánto el Panel se refresca solo cuando está EN VIVO, para que
 * nadie quede mirando datos viejos si deja la pestaña abierta. Es un
 * refresco silencioso (sin spinner de pantalla completa). No aplica
 * cuando se está viendo un turno histórico elegido a mano.
 */
const REFRESCO_EN_VIVO_MS = 30 * 60 * 1000

/*
 * Panel de Producción: vista EN VIVO del turno en curso (banner de
 * cabecera con hora/cajas/litros/meta/supervisor, y abajo tanques,
 * líneas y merma del turno anterior) — con selector de fecha/turno
 * para ver turnos anteriores.
 *
 * Esta página carga los datos y arma las piezas; cada sección vive en
 * src/components/panel/ y las cuentas en calculosPanel.ts. Utilidades
 * CSS (panel-banner, panel-grid, shadow-panel, tank-glass,
 * liquid-bubble, dot-ring, rise-in) viven al final de src/index.css.
 */
export default function PanelProduccion() {
  const { session } = useAuth()
  /** Para quien carga el turno, tanques y líneas del panel llevan a Preparación (donde puede tocarlos). */
  const esSupervisor = session?.rol !== "SUPERADMINISTRADOR" && puede(session ?? null, "TURNO_CARGAR")
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enVivo, setEnVivo] = useState(true)
  // Día de turno, no calendario: a las 2:00 el turno 3 en curso es el de la fecha anterior.
  const [fecha, setFecha] = useState(() => franjaDeHora().fecha)
  const [turnoTipo, setTurnoTipo] = useState<string>(() => franjaDeHora().tipo)
  const [buscado, setBuscado] = useState(false)
  /*
   * El turno pasado sin procesar: la merma se calcula abajo (en el
   * render, junto con la del turno actual) para que ambas usen el mismo
   * `presentaciones` ya cargado. Guardar acá la merma ya calculada
   * hacía que "turno pasado" quedara clavado en 100% de merma de envase
   * si el catálogo todavía no había resuelto al momento de la carga.
   */
  const [turnoAnterior, setTurnoAnterior] = useState<TurnoActivo | null>(null)
  /** Cargo (rótulo del puesto) del supervisor del turno, para mostrarlo junto al nombre. */
  const [supervisorCargo, setSupervisorCargo] = useState<string | null>(null)
  /** Servicios Industriales: Temperatura del Quantum / Agua Osmotizada — meramente informativo, arriba de Tanques. */
  const [servIndustriales, setServIndustriales] = useState<LecturaServiciosIndustriales | null>(null)
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
   * Datos de dominio: Panel NO trae más tanques/corridas/contadores/PT
   * dentro de `turno` (eso lo siguen resolviendo obtenerEstadoPlantaActual
   * / obtenerTurnoDeFechaTipo / obtenerTurnoAnterior, para la CABECERA del
   * turno: id, código, fecha, supervisor, horario). Los 3 módulos de
   * dominio se piden acá aparte, igual que en cualquier otra página ya
   * migrada — con `turno?.id ?? null` (nunca `undefined`) para que, si
   * todavía no hay turno resuelto, se vea vacío y NUNCA el turno propio
   * del supervisor que está mirando el Panel (ver el fix de
   * usePreparacion/useProduccion/useProductoTerminado a null vs. undefined).
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

  // ------------------------------------------------------------ cuentas
  const horasTurnoActual = turno ? horasTranscurridasTurno(turno.horaInicio, turno.estado, turno.horaFin) : 0
  // Meta y eficiencia con paradas (src/lib/eficiencia.ts, plan-eficiencia-meta.md): base = turno completo;
  // la meta baja con las Programadas y el Ocioso; la eficiencia en vivo es el ritmo.
  const eficiencia = turno
    ? eficienciaDelTurno({
        turnoTipo: turno.turnoTipo,
        estado: turno.estado,
        horasTranscurridas: horasTurnoActual,
        corridas: prod.corridas,
        contadores: prod.contadores,
        presentaciones,
        velocidades,
        paradas: paradasTurno,
        lineas: lineas.map((l) => l.codigo),
        ahora,
      })
    : null
  const meta = turno
    ? {
        pctCumplimiento: eficiencia?.total?.avancePct ?? null,
        ritmoPct: eficiencia?.total?.eficienciaPct ?? null,
        totalReales: eficiencia?.total?.realCajas ?? 0,
        totalEsperadas: eficiencia?.total?.metaCajas ?? 0,
      }
    : null
  const litrosProducidos = pt.registros.reduce((a, p) => a + p.litrosProducidos, 0)
  const lineasEstado = turno ? estadoDeLineas(prod.corridas, prod.lineasEstado, lineas) : []
  const produccionPorLinea = turno ? produccionPorLineaDe(pt.registros, lineas, presentaciones) : []
  const cajasProducidasTotal = produccionPorLinea.reduce((a, l) => a + l.cajas, 0)
  /*
   * "Producción del turno": Cajas / Litros del banner son SIEMPRE del
   * turno cargado — se mueven con lo que carga el supervisor activo. El
   * acumulado de la jornada (los 3 turnos) solo lo usa el carrusel de
   * Programación diaria, para cruzarlo contra el plan del día.
   */
  const usarDiario = enVivo && produccionDia.length > 0
  const mermaEnvases = turno ? mermaEnvasesTurno(prod.contadores, pt.registros, presentaciones) : null
  const mermaSemielaborado = turno
    ? mermaSemielaboradoTurno(turno.id, prep.preparaciones, prod.corridas, pt.registros, prod.contadores, presentaciones, prep.transferencias, prep.desvases)
    : null
  // "Turno pasado": mismas funciones, mismo `presentaciones` ya cargado
  // que el turno actual. Al correr en el render se recalculan solas
  // cuando el catálogo termina de cargar.
  const mermaEnvasesAnterior = turnoAnterior ? mermaEnvasesTurno(prodAnterior.contadores, ptAnterior.registros, presentaciones) : null
  const mermaSemielaboradoAnterior = turnoAnterior
    ? mermaSemielaboradoTurno(
        turnoAnterior.id,
        prepAnterior.preparaciones,
        prodAnterior.corridas,
        ptAnterior.registros,
        prodAnterior.contadores,
        presentaciones,
        prepAnterior.transferencias,
        prepAnterior.desvases,
      )
    : null
  const programacionItems = useMemo(
    () => programacionDelDia(planDia, produccionDia, usarDiario, pt.registros, presentaciones),
    [pt.registros, presentaciones, planDia, produccionDia, usarDiario],
  )
  const filasLineas = filasDeLineas({
    lineasEstado,
    produccionPorLinea,
    corridas: prod.corridas,
    contadores: prod.contadores,
    productoTerminado: pt.registros,
    presentaciones,
    eficiencia,
    minutosParadaPorLinea: new Map(minutosPorLinea(paradasTurno, ahora).map((r) => [r.linea, r.minutos])),
    ahora,
  })
  const ultimaAccion = turno ? ultimaAccionDeTurno(prod.corridas, prep.tanques, prod.contadores, pt.registros, prep.preparaciones) : null

  // ------------------------------------------------------------ pantalla
  return (
    <AppShell title="Panel de Producción" description="Estado de la planta en vivo" fullWidth ocultarEstadoBanner>
      <div className="flex flex-col gap-5">
        <BannerSuperior
          turno={turno}
          buscado={buscado}
          enVivo={enVivo}
          fecha={fecha}
          turnoTipo={turnoTipo}
          textoUltimaActualizacion={textoUltimaActualizacion(ultimaAccion, ahora)}
          puedeElegirArea={puedeElegirArea}
          areaFiltro={areaFiltro}
          supervisorCargo={supervisorCargo}
          ahora={ahora}
          cajas={cajasProducidasTotal}
          litros={litrosProducidos}
          programacionItems={programacionItems}
          meta={meta}
          onAlternarFiltros={() => setMostrarFiltros((v) => !v)}
          onAbrirFiltros={() => setMostrarFiltros(true)}
        />

        {mostrarFiltros && (
          <FiltrosPanel
            puedeElegirArea={puedeElegirArea}
            areaFiltro={areaFiltro}
            turnoTipo={turnoTipo}
            fecha={fecha}
            cargando={cargando}
            onArea={setAreaFiltro}
            onTurnoTipo={(v) => {
              setTurnoTipo(v)
              buscarFechaTipo(fecha, v)
            }}
            onFecha={(f) => {
              setFecha(f)
              buscarFechaTipo(f, turnoTipo)
            }}
            onEnVivo={() => cargarEnVivo()}
          />
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
              enVivo ? "En cuanto un supervisor inicie el primer turno, tanques y líneas van a aparecer acá." : "Prueba con otra fecha o tipo de turno."
            }
          />
        ) : (
          <>
            {/* ------- TANQUES (angosta, izquierda, alta) · LÍNEAS + MERMAS/PARADAS (derecha) ------- */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
              <div className="rise-in flex flex-col gap-4 xl:col-span-4">
                <SeccionTanques
                  tanques={prep.tanques}
                  preparaciones={prep.preparaciones}
                  servIndustriales={servIndustriales}
                  ahora={ahora}
                  conLinks={esSupervisor}
                />
                <ParadaMasLarga paradas={paradasTurno} lineas={lineas} ahora={ahora} />
              </div>

              <div className="flex flex-col gap-4 xl:col-span-8">
                <SeccionLineas filas={filasLineas} conLinks={esSupervisor} />
                <SeccionMermas
                  envasePasado={mermaEnvasesAnterior?.pct ?? null}
                  envaseActual={mermaEnvases?.pct ?? null}
                  semielaboradoPasado={mermaSemielaboradoAnterior?.pct ?? null}
                  semielaboradoActual={mermaSemielaborado?.pct ?? null}
                />
              </div>
            </div>

            <DetalleTurno
              turno={turno}
              areaEfectiva={areaEfectiva}
              eficiencia={eficiencia}
              lineas={lineas}
              paradas={paradasTurno}
              preparaciones={prep.preparaciones}
              corridas={prod.corridas}
              productoTerminado={pt.registros}
              contadores={prod.contadores}
              transferencias={prep.transferencias}
              desvases={prep.desvases}
            />
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
