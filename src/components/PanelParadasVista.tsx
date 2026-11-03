import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Presentation, Tv, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CintaLinea, type EstadoLineaVista } from "@/components/CintaLinea"
import { BarrasLineas } from "@/components/panel-paradas/BarrasLineas"
import { colorLinea } from "@/components/panel-paradas/colores"
import { CarruselTop, type VistaCarrusel } from "@/components/panel-paradas/CarruselTop"
import { RankCard, RankList } from "@/components/panel-paradas/RankList"
import { TortaResponsables } from "@/components/panel-paradas/TortaResponsables"
import { useAjusteAPantalla } from "@/components/panel-paradas/useAjusteAPantalla"
import { usePresentacion } from "@/components/indicadores/usePresentacion"
import { conFallas, noProgramadasPorLinea, porResponsable, subsistemasMezclados, topPorNivel, type ParadaConFalla } from "@/lib/catalogoFallas/analisis"
import { useCatalogoModular } from "@/lib/catalogoFallas/switch"
import { useCatalogoFallas } from "@/lib/catalogoFallas/useCatalogoFallas"
import { useAuth } from "@/lib/auth"
import { useFallasDeParadas } from "@/lib/catalogoFallas/useFallasDeParadas"
import { DetalleParadas } from "@/components/paradas/DetalleParadas"
import { RangoFechas } from "@/components/paradas/RangoFechas"
import { cn } from "@/lib/utils"
import type { OeePeriodo } from "@/lib/eficiencia"
import { fechaJornadaPlanta, restarDias } from "@/lib/tiempoPlanta"
import { type TurnoTipoCodigo } from "@/lib/catalogos"
import {
  esDeMantenimiento,
  jornadaDeParada,
  LINEAS_PARADAS,
  minutosPorClaseSinSolape,
  NOMBRE_CLASE,
  nombreLineaParada,
  paradaAbierta,
  porSubsistema,
  porTipoPorFrecuencia,
  porTipoYLinea,
  porTipoYLineaPorFrecuencia,
  primeraDeCadaLinea,
  type ClaseParada,
  type GrupoTipo,
  type Parada,
} from "@/lib/paradas"

/*
 * Panel de Paradas — dashboard solo lectura, mismo estilo que el Panel de
 * Producción. Filtro de Turno (uno o "Todos") + Período (Hoy / Ayer / Últimos
 * 7 días / Este mes / Elegir fechas desde–hasta); en «Ver filtros», quién la
 * reportó (Producción / Mantenimiento), clase y línea. Un solo filtro para
 * todo, también la tarjeta de Mantenimiento del final. Todo el contenido (Top por frecuencia y por tiempo
 * — la primera de cada línea — + las 3 líneas con su cinta animada, su
 * OEE (Disponibilidad × Rendimiento, mismo cálculo que el Panel de
 * Producción — ver OeeLinea), sus minutos no programados, sus paradas registradas y su
 * top 3 de no programadas) queda siempre
 * visible, sin secciones colapsables — el objetivo es que entre entero en
 * una sola pantalla, sin scroll. Rework 2026-09-28 (dueño): la info es
 * POR LÍNEA, ya no hay KPIs globales, ni minutos programados / ociosos,
 * ni paradas por Sabor / Familia / Presentación.
 *
 * `estadoLineas` es el estado EN VIVO de las 3 líneas — a propósito NO
 * depende del filtro de Fecha/Turno de acá abajo (ese filtro es para
 * historial; la cinta solo tiene sentido mostrando el turno activo
 * real). undefined = todavía cargando.
 */

type PeriodoCodigo = "HOY" | "AYER" | "3D" | "7D" | "MES" | "MES_ELEGIDO" | "FECHAS"
const PERIODO_FILTRO: { codigo: PeriodoCodigo; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Hoy" },
  { codigo: "AYER", etiqueta: "Ayer" },
  { codigo: "3D", etiqueta: "Últimos 3 días" },
  { codigo: "7D", etiqueta: "Últimos 7 días" },
  { codigo: "MES", etiqueta: "Este mes" },
  // Un mes entero (o hasta hoy, si es el de ahora), con su selector (dueña, 2026-10-31).
  { codigo: "MES_ELEGIDO", etiqueta: "Elegir mes" },
  // Desde–hasta con calendario; el mismo día en los dos = un solo día (dueña, 2026-10-15).
  { codigo: "FECHAS", etiqueta: "Elegir fechas" },
]

type ReportoCodigo = "TODAS" | "PRODUCCION" | "MANTENIMIENTO"
const REPORTO_FILTRO: { codigo: ReportoCodigo; etiqueta: string }[] = [
  { codigo: "TODAS", etiqueta: "Todas" },
  { codigo: "PRODUCCION", etiqueta: "Producción" },
  { codigo: "MANTENIMIENTO", etiqueta: "Mantenimiento" },
]

const TURNO_FILTRO: { codigo: TurnoTipoCodigo | "TODOS"; etiqueta: string }[] = [
  { codigo: "TODOS", etiqueta: "Todos" },
  { codigo: "TURNO_1", etiqueta: "Turno 1" },
  { codigo: "TURNO_2", etiqueta: "Turno 2" },
  { codigo: "TURNO_3", etiqueta: "Turno 3" },
]

const CLASE_FILTRO: { codigo: ClaseParada | "TODAS"; etiqueta: string }[] = [
  { codigo: "TODAS", etiqueta: "Todas" },
  { codigo: "PROGRAMADA", etiqueta: "Programada" },
  { codigo: "NO_PROGRAMADA", etiqueta: "No programada" },
  { codigo: "OCIOSO", etiqueta: "Ocioso" },
]

export interface EstadoLineaEnVivo {
  lineaCodigo: string
  estado: EstadoLineaVista
  saborNombre: string | null
  lote: string | null
  /** Código de presentación de la corrida activa ("1000", "500"...) — para dibujar el envase correcto en la cinta. */
  presentacion?: string | null
  /** Parada abierta: "Parada hace 6 min" / "Mantenimiento · 42 min" (src/lib/paradasEnVivo.ts). */
  aviso?: string | null
  /** Ya pasó el margen de 15 min. */
  avisoUrgente?: boolean
  /** Descripción de la parada en curso. */
  nota?: string | null
}

/** Carga el OEE por línea (clave LINEA_1/2/3) del período y turno elegidos — ver cargarOeePeriodo (src/lib/eficienciaPeriodo.ts). */
export type CargarOee = (filtro: { desde: string; hasta: string; turnoTipo: string }) => Promise<Map<string, OeePeriodo>>

/** Carga las paradas del período — solo ese rango, no todo el historial. */
export type CargarParadas = (filtro: { desde: string; hasta: string }) => Promise<Parada[]>

/** Panel de pared: las paradas se vuelven a leer cada minuto; el OEE (más pesado, un pedido por turno) cada 5. */
const REFRESCO_PARADAS_MS = 60 * 1000
const REFRESCO_OEE_MS = 5 * 60 * 1000

export function PanelParadasVista({
  cargarParadas,
  estadoLineas,
  cargarOee,
  mantenimiento,
  modoTv = false,
  onModoTv,
}: {
  cargarParadas: CargarParadas
  /** Estado en vivo de las 3 líneas (no filtrado). Ver nota de cabecera. */
  estadoLineas?: EstadoLineaEnVivo[]
  cargarOee: CargarOee
  /** Tarjeta de Mantenimiento, al final: recibe las paradas filtradas que reportó Mantenimiento. */
  mantenimiento?: (paradas: Parada[], ahora: Date) => ReactNode
  /** Dentro del modo TV: siempre presentando; se sale desde el modo TV. */
  modoTv?: boolean
  /** Abre el modo TV (Producción y Paradas, un minuto cada uno). */
  onModoTv?: () => void
}) {
  const [periodo, setPeriodo] = useState<PeriodoCodigo>("HOY")
  const [rango, setRango] = useState(() => {
    const ayer = restarDias(fechaJornadaPlanta(), 1)
    return { desde: ayer, hasta: ayer }
  })
  /** «Elegir mes»: 'YYYY-MM'; arranca en el mes pasado. */
  const [mesElegido, setMesElegido] = useState(() => restarDias(`${fechaJornadaPlanta().slice(0, 8)}01`, 1).slice(0, 7))
  const [clase, setClase] = useState<ClaseParada | "TODAS">("TODAS")
  const [linea, setLinea] = useState("TODAS")
  const [reporto, setReporto] = useState<ReportoCodigo>("TODAS")
  const [turno, setTurno] = useState<TurnoTipoCodigo | "TODOS">("TODOS")
  /** Un equipo del catálogo nuevo: todo el panel pasa a ser de ese equipo. Vacío = todos. */
  const [equipoElegido, setEquipo] = useState("")
  // El switch del catálogo nuevo (por área). Apagado y sin paradas con falla nueva en el período, el panel es el de antes (solo subsistemas del catálogo viejo).
  const { session } = useAuth()
  const switchEncendido = useCatalogoModular(session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO") === true
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  /**
   * Presentar (TV), como en Indicadores: a pantalla completa, sin el encabezado
   * ni los filtros, y los carruseles pasan solos (tocar uno lo deja quieto).
   * Se sale con Esc o con la ✕.
   */
  const presentacion = usePresentacion()
  const presentar = modoTv || presentacion.presentando
  // Al presentar, todo entra en la pantalla: se agranda o achica junto (dueña, 2026-10-31: en la TV no se veía lo de abajo).
  const contenidoRef = useRef<HTMLDivElement>(null)
  const escala = useAjusteAPantalla(contenidoRef, presentar)

  // Reloj del panel: avanza cada minuto y dispara la relectura de paradas.
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), REFRESCO_PARADAS_MS)
    return () => clearInterval(id)
  }, [])

  // Todo se calcula por JORNADA de planta (7:00 → 7:00), como el Resumen Diario (dueña, 2026-10-15):
  // «Hoy» no mezcla el Turno 3 de anoche y sí toma entero el de esta noche. Ayer = la jornada
  // anterior; 7 días = hoy y las 6 anteriores; Este mes = del 1 hasta hoy.
  const hoy = fechaJornadaPlanta(ahora)
  const { desde, hasta } = useMemo(() => {
    if (periodo === "HOY") return { desde: hoy, hasta: hoy }
    if (periodo === "FECHAS") return rango
    if (periodo === "AYER") {
      const ayer = restarDias(hoy, 1)
      return { desde: ayer, hasta: ayer }
    }
    if (periodo === "3D") return { desde: restarDias(hoy, 2), hasta: hoy }
    if (periodo === "7D") return { desde: restarDias(hoy, 6), hasta: hoy }
    if (periodo === "MES_ELEGIDO") {
      const [anio, mes] = mesElegido.split("-").map(Number)
      const ultimo = `${mesElegido}-${String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, "0")}`
      return { desde: `${mesElegido}-01`, hasta: ultimo < hoy ? ultimo : hoy }
    }
    return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
  }, [periodo, hoy, rango, mesElegido])

  // Paradas del período. Se guardan con la clave del rango: al refrescar se
  // sigue viendo lo anterior; al cambiar de período, cargando.
  const claveParadas = `${desde}|${hasta}`
  const [paradasCargadas, setParadasCargadas] = useState<{ clave: string; filas: Parada[] } | null>(null)
  useEffect(() => {
    let vivo = true
    const clave = `${desde}|${hasta}`
    // Hasta el día siguiente: la madrugada de la última jornada (su Turno 3) cae en esa fecha.
    cargarParadas({ desde, hasta: restarDias(hasta, -1) }).then((filas) => vivo && setParadasCargadas({ clave, filas }))
    return () => {
      vivo = false
    }
  }, [cargarParadas, desde, hasta, ahora])
  const paradas = paradasCargadas?.clave === claveParadas ? paradasCargadas.filas : null

  const base = useMemo(() => {
    return (paradas ?? [])
      .filter((p) => {
        const dia = jornadaDeParada(p)
        if (dia < desde || dia > hasta) return false
        if (clase !== "TODAS" && p.clase !== clase) return false
        if (linea !== "TODAS" && p.lineaCodigo !== linea) return false
        if (turno !== "TODOS" && p.turnoTipo !== turno) return false
        if (reporto !== "TODAS" && esDeMantenimiento(p) !== (reporto === "MANTENIMIENTO")) return false
        return true
      })
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
  }, [paradas, desde, hasta, clase, linea, turno, reporto])

  // Las fallas del catálogo nuevo (desde el switch, 20261113890000). Con un equipo
  // elegido quedan solo sus paradas; las demás cuentas siguen igual sobre ellas.
  const fallas = useFallasDeParadas(base)
  const { catalogo } = useCatalogoFallas()
  const conFallaBase = useMemo(() => conFallas(base, fallas, catalogo), [base, fallas, catalogo])
  // Si el switch se apagó pero ya hay fallas nuevas registradas, siguen a la vista: el panel las muestra por los datos, no solo por el switch.
  const modular = switchEncendido || conFallaBase.length > 0
  const equipo = modular ? equipoElegido : ""
  const conFalla = useMemo(() => (equipo ? conFallaBase.filter((x) => x.cuenta.equipo.id === equipo) : conFallaBase), [conFallaBase, equipo])
  const filtradas = useMemo(() => (equipo ? conFalla.map((x) => x.parada) : base), [equipo, conFalla, base])
  const nombreEquipo = catalogo.equipos.find((e) => e.id === equipo)?.nombre ?? null
  const equiposConParadas = useMemo(() => {
    const ids = new Set(conFallaBase.map((x) => x.cuenta.equipo.id))
    return catalogo.equipos.filter((e) => ids.has(e.id) || e.id === equipo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [conFallaBase, catalogo.equipos, equipo])

  const abiertas = filtradas.filter(paradaAbierta).length
  /** Lo que está filtrando «Ver filtros», para mostrarlo en el botón aunque esté cerrado. */
  const filtrosActivos = [
    reporto !== "TODAS" && `Reportó ${REPORTO_FILTRO.find((r) => r.codigo === reporto)?.etiqueta}`,
    clase !== "TODAS" && NOMBRE_CLASE[clase],
    linea !== "TODAS" && nombreLineaParada(linea),
  ].filter((x): x is string => !!x)
  // Por tipo + línea, y de ahí SOLO la primera de cada línea (máximo 3
  // filas): cada fila dice de qué línea es — ver RankList.
  // Solo las no programadas: una programada (arranque, cambio de sabor…) o un ocioso no son «lo que más para» (dueña, 2026-11-03).
  const soloNoProgramadas = useMemo(() => filtradas.filter((p) => p.clase === "NO_PROGRAMADA"), [filtradas])
  const topFrecuencia = useMemo(() => primeraDeCadaLinea(porTipoYLineaPorFrecuencia(soloNoProgramadas, ahora)), [soloNoProgramadas, ahora])
  const topTiempo = useMemo(() => primeraDeCadaLinea(porTipoYLinea(soloNoProgramadas, ahora)), [soloNoProgramadas, ahora])
  /** Top de toda la planta (o del equipo elegido), por tiempo. Sin equipo, los subsistemas incluyen los del catálogo viejo. */
  const vistasPlanta = useMemo(
    () =>
      !modular
        ? [{ nombre: "Subsistemas", items: porSubsistema(filtradas, ahora) }]
        : equipo
        ? vistasTop(conFalla, ahora, true)
        : vistasTop(conFalla, ahora, false, subsistemasMezclados(conFalla, porSubsistema(filtradas.filter((p) => !fallas.has(p.id)), ahora), ahora)),
    [modular, equipo, conFalla, filtradas, fallas, ahora],
  )
  const reparto = useMemo(() => porResponsable(filtradas, ahora), [filtradas, ahora])
  const porLinea = useMemo(() => noProgramadasPorLinea(filtradas, LINEAS_PARADAS.map((l) => l.codigo), ahora), [filtradas, ahora])

  // OEE por línea del período — sale de Producción (contadores y velocidades),
  // no de las paradas, así que se pide aparte. Se guarda con la clave del
  // filtro que lo pidió: si no coincide con el filtro actual, está cargando.
  const claveOee = `${desde}|${hasta}|${turno}`
  // Cambia cada REFRESCO_OEE_MS: vuelve a pedir el OEE sin mostrar "calculando" otra vez.
  const vueltaOee = Math.floor(ahora.getTime() / REFRESCO_OEE_MS)
  const [oeeCargado, setOeeCargado] = useState<{ clave: string; datos: Map<string, OeePeriodo> } | null>(null)
  useEffect(() => {
    let vivo = true
    const clave = `${desde}|${hasta}|${turno}`
    cargarOee({ desde, hasta, turnoTipo: turno }).then(
      (datos) => vivo && setOeeCargado({ clave, datos }),
      () => vivo && setOeeCargado({ clave, datos: new Map() }),
    )
    return () => {
      vivo = false
    }
  }, [cargarOee, desde, hasta, turno, vueltaOee])
  const oee = oeeCargado?.clave === claveOee ? oeeCargado.datos : undefined

  return (
    <div className={cn(presentar && "fixed inset-0 z-50 overflow-hidden bg-background p-3")}>
    <div ref={contenidoRef} className="flex flex-col gap-4" style={presentar ? { zoom: escala } : undefined}>
      {presentar && (
        <div className="flex items-center gap-3">
          {/* En el modo TV el nombre del panel lo dice el recuadro de arriba a la izquierda: se le deja su lugar. */}
          {modoTv ? (
            <div className="shrink-0" style={{ width: `${280 / escala}px` }} aria-hidden />
          ) : (
            <h1 className="text-lg font-bold text-foreground">
              Panel de Paradas{nombreEquipo && <span className="text-muted-foreground"> · {nombreEquipo}</span>}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODO_FILTRO.filter((p) => p.codigo !== "FECHAS").map((p) => (
              <Button key={p.codigo} type="button" size="sm" variant={periodo === p.codigo ? "default" : "outline"} onClick={() => setPeriodo(p.codigo)}>
                {p.etiqueta}
              </Button>
            ))}
            {periodo === "MES_ELEGIDO" && (
              <input
                type="month"
                aria-label="Mes"
                value={mesElegido}
                max={hoy.slice(0, 7)}
                onChange={(e) => e.target.value && setMesElegido(e.target.value)}
                className="h-8 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11"
              />
            )}
          </div>
          {modular && (
            <select
              aria-label="Equipo"
              className="h-8 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11"
              value={equipo}
              onChange={(e) => setEquipo(e.target.value)}
            >
              <option value="">Todos los equipos</option>
              {equiposConParadas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}
          {turno !== "TODOS" && <span className="text-sm text-muted-foreground">{TURNO_FILTRO.find((t) => t.codigo === turno)?.etiqueta}</span>}
          {!modoTv && (
            <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" aria-label="Salir de presentar" onClick={presentacion.salir}>
              <X />
            </Button>
          )}
        </div>
      )}
      {/* ---- Filtros — Turno/Fecha siempre visibles (el control principal,
           mismo patrón que Panel de Producción); Clase/Línea son
           secundarios, un botón "Ver filtros" en la MISMA fila los
           despliega debajo — nada de una card aparte. ---- */}
      <div className={cn("flex flex-col gap-2", presentar && "hidden")}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Turno</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {TURNO_FILTRO.map((t) => (
                <Button
                  key={t.codigo}
                  type="button"
                  size="sm"
                  variant={turno === t.codigo ? "default" : "outline"}
                  onClick={() => setTurno(t.codigo)}
                >
                  {t.etiqueta}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Período</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {PERIODO_FILTRO.map((p) => (
                <Button
                  key={p.codigo}
                  type="button"
                  size="sm"
                  variant={periodo === p.codigo ? "default" : "outline"}
                  onClick={() => setPeriodo(p.codigo)}
                >
                  {p.etiqueta}
                </Button>
              ))}
            </div>
            {periodo === "FECHAS" && <RangoFechas desde={rango.desde} hasta={rango.hasta} max={hoy} onChange={setRango} />}
            {periodo === "MES_ELEGIDO" && (
              <input
                type="month"
                aria-label="Mes"
                value={mesElegido}
                max={hoy.slice(0, 7)}
                onChange={(e) => e.target.value && setMesElegido(e.target.value)}
                className="h-8 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11"
              />
            )}
          </div>
          {modular && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Equipo</span>
            <select
            aria-label="Equipo"
            className="h-8 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11"
            value={equipo}
            onChange={(e) => setEquipo(e.target.value)}
          >
            <option value="">Todos los equipos</option>
            {equiposConParadas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          </div>
          )}
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setMostrarFiltros((v) => !v)}>
            {mostrarFiltros ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {filtrosActivos.length > 0 ? `Filtros (${filtrosActivos.join(" · ")})` : "Ver filtros"}
          </Button>
          <Button type="button" size="sm" variant="outline" className="ml-auto self-end" onClick={() => void presentacion.entrar()} title="Pantalla completa para la TV: los carruseles pasan solos">
            <Presentation className="size-3.5" /> Presentar
          </Button>
          {onModoTv && (
            <Button type="button" size="sm" variant="outline" className="self-end" onClick={onModoTv} title="Para la TV: Panel de Producción y Panel de Paradas, un minuto cada uno">
              <Tv className="size-3.5" /> Modo TV
            </Button>
          )}
        </div>

        {mostrarFiltros && (
          // Como Turno y Período: cada filtro con su etiqueta arriba, para que no quede una etiqueta suelta al cortar el renglón.
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Reportó</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {REPORTO_FILTRO.map((r) => (
                  <Button
                    key={r.codigo}
                    type="button"
                    size="sm"
                    variant={reporto === r.codigo ? "default" : "outline"}
                    onClick={() => setReporto(r.codigo)}
                  >
                    {r.etiqueta}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Clase</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {CLASE_FILTRO.map((c) => (
                  <Button
                    key={c.codigo}
                    type="button"
                    size="sm"
                    variant={clase === c.codigo ? "default" : "outline"}
                    onClick={() => setClase(c.codigo)}
                  >
                    {c.etiqueta}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Línea</span>
              <Select value={linea} onValueChange={setLinea}>
                <SelectTrigger className="h-8 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas las líneas</SelectItem>
                  {LINEAS_PARADAS.map((l) => (
                    <SelectItem key={l.codigo} value={l.codigo}>
                      {l.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {paradas === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <>
        {/* ---- Hero: ranking + líneas (en vivo + sus números) ----
             Ya no hay columna de KPIs globales: OEE, minutos no
             programados y paradas registradas van DENTRO de cada línea. */}
        <div className="grid w-full grid-cols-1 items-stretch gap-3 lg:grid-cols-3 xl:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(0,1.3fr))]">
          <div className="flex flex-col gap-3 lg:col-span-3 lg:grid lg:grid-cols-2 xl:col-span-1 xl:flex">
            <TortaResponsables produccion={reparto.produccion} mantenimiento={reparto.mantenimiento} />
            <BarrasLineas lineas={porLinea} />
            {/* El logo llena lo que queda de la columna en pantallas anchas (la TV): identidad sin ocupar datos (dueña, 2026-10-31). */}
            <div className="hidden min-h-0 flex-1 items-center justify-center xl:flex">
              {/* Logo de texto (dueña, 2026-10-31: este es el que va; sin versión HD todavía, se arma con letra y queda nítido). */}
              <span className="rounded-lg bg-marca px-6 py-2.5 text-4xl font-bold tracking-tight text-white italic shadow-sm">Natulac</span>
            </div>
          </div>

          {/* ---- Una columna por línea: cinta en vivo + sus números. ---- */}
          {LINEAS_PARADAS.map((l, i) => {
            const propias = filtradas.filter((p) => p.lineaCodigo === l.codigo)
            const noProgramadas = propias.filter((p) => p.clase === "NO_PROGRAMADA")
            // Sin solape con las demás paradas de la línea (supervisor y Mantenimiento cargando la misma falla).
            const minutosNoProgramados = minutosPorClaseSinSolape(propias, ahora).NO_PROGRAMADA
            const enVivo = estadoLineas?.find((e) => e.lineaCodigo === l.codigo)
            return (
              <div key={l.codigo} className="flex min-w-0 flex-col gap-3">
                {/* El filo de arriba con el color de la línea, el mismo de sus barras en todo el panel. */}
                <div className="flex flex-1 flex-col rounded-xl border border-t-4 border-border bg-card p-3 shadow-sm" style={{ borderTopColor: colorLinea(l.codigo) }}>
                  {/* Nombre a la izquierda y el dibujo chico al lado, como un guiño (dueña, 2026-10-31). */}
                  <div className="mb-1 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Producción</p>
                      <h2 className="flex items-center gap-1.5 text-lg font-bold text-foreground">
                        <span className="size-3 shrink-0 rounded-[3px]" style={{ background: colorLinea(l.codigo) }} aria-hidden />
                        {l.nombre}
                      </h2>
                      {enVivo && (
                        <span
                          className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-success/10 px-2 py-0.5 text-xs font-bold uppercase text-success-foreground"
                          title="El dibujo muestra el turno activo real, no el filtro de arriba"
                        >
                          <span className="alert-pulse size-1.5 rounded-full bg-current" />
                          En vivo
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      {enVivo ? (
                      <CintaLinea
                        numeroLinea={i + 1}
                        estado={enVivo.estado}
                        saborNombre={enVivo.saborNombre}
                        lote={enVivo.lote}
                        presentacion={enVivo.presentacion}
                        aviso={enVivo.aviso}
                        avisoUrgente={enVivo.avisoUrgente}
                        nota={enVivo.nota}
                        compacto
                      />
                      ) : (
                        <div className="grid h-14 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                  {enVivo && (
                    <>
                      {enVivo.aviso ? (
                        <p className={cn("mt-1.5 truncate text-sm font-semibold", enVivo.avisoUrgente ? "alert-pulse text-danger-foreground" : "text-warning-foreground")}>
                          {enVivo.aviso}
                          {enVivo.nota && <span className="font-normal text-muted-foreground"> · {enVivo.nota}</span>}
                        </p>
                      ) : (
                        (enVivo.saborNombre || enVivo.lote) && (
                          <p className="mt-1.5 truncate text-xs text-muted-foreground">
                            {[enVivo.saborNombre, enVivo.lote && `Lote ${enVivo.lote}`].filter(Boolean).join(" · ")}
                          </p>
                        )
                      )}
                    </>
                  )}
                  <OeeLinea oee={oee === undefined ? "cargando" : (oee.get(l.codigo) ?? null)} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <DatoLinea etiqueta="Min. no programados" valor={minutosNoProgramados} tono="text-danger" />
                    <DatoLinea etiqueta="Paradas registradas" valor={propias.length} tono="text-primary" />
                  </div>
                  <div className="mt-3">
                    <h3 className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">Fallas por frecuencia</h3>
                    <div className="text-danger">
                      <RankList items={porTipoPorFrecuencia(noProgramadas, ahora)} metrica="veces" compacto color={colorLinea(l.codigo)} />
                    </div>
                  </div>
                  {/* Pegado al fondo: la tarjeta llega hasta la fila de abajo (dueña, 2026-10-31). */}
                  <div className="mt-auto border-t border-border pt-3">
                    <CarruselTop vistas={modular ? vistasTop(conFalla.filter((x) => x.parada.lineaCodigo === l.codigo), ahora, !!equipo) : [{ nombre: "Subsistemas", items: porSubsistema(propias, ahora) }]} presentar={presentar} color={colorLinea(l.codigo)} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {/* Lo general de toda la planta: los Top de siempre y el carrusel de equipos, sistemas y subsistemas. */}
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
          <RankCard titulo="Paradas por frecuencia" tono="info" items={topFrecuencia} metrica="veces" porLinea />
          <RankCard titulo="Paradas por tiempo" tono="danger" items={topTiempo} metrica="minutos" porLinea />
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-card-foreground">{nombreEquipo ? `Resumen de ${nombreEquipo}` : "Resumen de la planta"}</h2>
            <CarruselTop vistas={vistasPlanta} presentar={presentar} />
          </section>
        </div>
        {/* Abajo, cerrado y con su resumen (dueña, 2026-10-15: limpio para la presidencia). Un solo día va por
            turno, Producción y Mantenimiento juntas; varios días, en tabla. */}
        {/* Al presentar no van: en la TV no se abren. */}
        <div className={cn("flex w-full flex-col gap-3", presentar && "hidden")}>
          <DetalleParadas paradas={filtradas} ahora={ahora} unDia={desde === hasta} />
          {mantenimiento && reporto !== "PRODUCCION" && mantenimiento(filtradas.filter(esDeMantenimiento), ahora)}
        </div>
        </>
      )}

      {abiertas > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="size-4 shrink-0" />
          {abiertas === 1 ? "Hay 1 parada en curso" : `Hay ${abiertas} paradas en curso`} en el rango filtrado.
        </div>
      )}
    </div>
    </div>
  )
}

function colorNivel(pct: number | null) {
  return pct === null ? "var(--muted-foreground)" : pct >= 90 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)"
}

/**
 * OEE de la línea en el período: el "reloj" (anillo) con el OEE, y al lado
 * sus dos factores en barritas — Disponibilidad × Rendimiento (Calidad = 1,
 * ver src/lib/eficiencia.ts) — para ver cuál de los dos lo baja.
 */
function OeeLinea({ oee }: { oee: OeePeriodo | null | "cargando" }) {
  if (oee === "cargando") {
    return (
      <div className="mt-2 flex h-9 items-center justify-center gap-2 rounded-lg bg-muted/40 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Calculando OEE…
      </div>
    )
  }
  if (oee === null || oee.oeePct === null) {
    return (
      // Vacío: un renglón, no un recuadro grande (dueña, 2026-10-31: que entre todo en la TV).
      <div className="mt-2 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-muted/40 text-xs text-muted-foreground">
        <span className="font-bold uppercase tracking-wide">OEE</span> · Sin producción en el período
      </div>
    )
  }
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <AnilloPct pct={oee.oeePct} tamano={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          OEE · {oee.turnos} {oee.turnos === 1 ? "turno" : "turnos"}
        </p>
        <FactorOee etiqueta="Disponibilidad" pct={oee.disponibilidadPct} />
        <FactorOee etiqueta="Rendimiento" pct={oee.rendimientoPct} />
      </div>
    </div>
  )
}

function FactorOee({ etiqueta, pct }: { etiqueta: string; pct: number | null }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className="num font-semibold text-foreground">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, backgroundColor: colorNivel(pct) }} />
      </div>
    </div>
  )
}

/** Anillo de porcentaje (conic-gradient) — mismo patrón que MetaAnillo en PanelProduccion.tsx, para que los dos dashboards se lean igual. */
function AnilloPct({ pct, tamano }: { pct: number; tamano: number }) {
  const color = colorNivel(pct)
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full transition-all duration-700"
      style={{ width: tamano, height: tamano, background: `conic-gradient(${color} ${Math.max(0, Math.min(100, pct)) * 3.6}deg, color-mix(in oklab, var(--muted) 90%, transparent) 0deg)` }}
    >
      <div className="grid place-items-center rounded-full bg-background" style={{ width: tamano * 0.72, height: tamano * 0.72 }}>
        <span className="num font-bold" style={{ color, fontSize: tamano * 0.24 }}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

/** Número chico de una línea (Min. no programados / Paradas registradas), debajo de su Eficiencia. */
function DatoLinea({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background/60 px-2 py-2 text-center">
      <p className={cn("num text-2xl font-extrabold leading-none", tono)}>{valor.toLocaleString("es-CO")}</p>
      <p className="mt-1 text-xs font-medium leading-snug text-muted-foreground">{etiqueta}</p>
    </div>
  )
}

/**
 * Las vistas del carrusel: Top equipos, sistemas y subsistemas (estos, con los
 * del catálogo viejo si se pasan). Con un equipo elegido, en vez de equipos
 * (sería uno solo), sus sistemas, subsistemas y fallas.
 */
function vistasTop(items: ParadaConFalla[], ahora: Date, deUnEquipo: boolean, subsistemas?: GrupoTipo[]): VistaCarrusel[] {
  const sistemasYSubsistemas = [
    { nombre: "Sistemas", items: topPorNivel(items, "SISTEMA", ahora) },
    { nombre: "Subsistemas", items: subsistemas ?? topPorNivel(items, "SUBSISTEMA", ahora) },
  ]
  return deUnEquipo
    ? [...sistemasYSubsistemas, { nombre: "Fallas", items: topPorNivel(items, "FALLA", ahora) }]
    : [{ nombre: "Equipos", items: topPorNivel(items, "EQUIPO", ahora) }, ...sistemasYSubsistemas]
}
