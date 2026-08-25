import { useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock,
  Construction,
  Container,
  Droplets,
  Gauge,
  Grid3x3,
  Layers,
  Loader2,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import { GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive, velocidadesParaLive, type LineaLive, type PresentacionLive } from "@/lib/catalogosLive"
import { horasTurno, mermaPct, obtenerEstadisticas, promedio, type FilaEstadistica } from "@/lib/estadisticas"
import {
  calcularMeta,
  obtenerEstadoPlantaActual,
  obtenerResumenTurnoAnterior,
  obtenerTurnoDeFechaTipo,
  type ResumenTurnoAnterior,
} from "@/lib/panelProduccion"
import { LIMITE_MERMA, type TurnoActivo } from "@/lib/turno"
import { cn } from "@/lib/utils"

const MERMA_MAX = LIMITE_MERMA * 100
const MERMA_WARN = MERMA_MAX * (2 / 3)
const TANK_CAPACITY = 20000

type NivelMerma = "ok" | "warn" | "danger"
const nivelMerma = (pct: number): NivelMerma => (pct <= MERMA_WARN ? "ok" : pct <= MERMA_MAX ? "warn" : "danger")
const badgeVariantPorNivel = { ok: "success", warn: "warning", danger: "danger" } as const

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
}

const ESTADO_LINEA_INFO: Record<
  EstadoLinea,
  { label: string; badge: "success" | "warning" | "danger" | "muted"; dot: string; ring: string; row: string }
> = {
  activa: {
    label: "Activa",
    badge: "success",
    dot: "bg-success",
    ring: "bg-success",
    row: "border-success/35 bg-success-soft/40",
  },
  parada: {
    label: "Parada",
    badge: "warning",
    dot: "bg-warning",
    ring: "bg-warning",
    row: "border-warning/35 bg-warning-soft/40",
  },
  esperando_cierre: {
    label: "Esperando cierre",
    badge: "danger",
    dot: "bg-danger",
    ring: "bg-danger",
    row: "border-danger/35 bg-danger-soft/40",
  },
  libre: { label: "Libre", badge: "muted", dot: "bg-muted-foreground", ring: "bg-muted-foreground", row: "border-border bg-muted/30" },
}

/** Una fila por línea del área (catálogo completo), cruzada con la corrida actual/últimamente tocada de turno.lineas. */
function estadoDeLineas(turno: TurnoActivo, lineasCatalogo: LineaLive[]): LineaConEstado[] {
  return lineasCatalogo.map((lc) => {
    const corridas = turno.lineas.filter((l) => l.linea === lc.codigo)
    const activa = corridas.find((l) => l.activa)
    if (activa) {
      return { codigo: lc.codigo, nombre: lc.nombre, estado: activa.pausadaEn ? "parada" : "activa", corrida: activa }
    }
    const esperandoCierre = corridas.find((l) => l.esperandoCierre)
    if (esperandoCierre) {
      return { codigo: lc.codigo, nombre: lc.nombre, estado: "esperando_cierre", corrida: esperandoCierre }
    }
    return { codigo: lc.codigo, nombre: lc.nombre, estado: "libre", corrida: null }
  })
}

interface CajasPorPresentacion {
  presentacion: string
  nombre: string
  cajas: number
}

/** Cuántas cajas se cargaron en Producto Terminado, agrupadas por presentación (1L, 250ml, etc.) — para el desglose bajo Litros producidos. */
function cajasPorPresentacionDe(turno: TurnoActivo, presentaciones: PresentacionLive[]): CajasPorPresentacion[] {
  const porPresentacion = new Map<string, CajasPorPresentacion>()

  for (const p of turno.productoTerminado) {
    const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
    const cajas = p.paletas * (pres?.cajasXPaleta ?? 0) + p.cajasSueltas
    const existente = porPresentacion.get(p.presentacion)
    if (existente) {
      existente.cajas += cajas
    } else {
      porPresentacion.set(p.presentacion, { presentacion: p.presentacion, nombre: pres?.nombre ?? `${p.presentacion} ml`, cajas })
    }
  }

  return [...porPresentacion.values()].filter((c) => c.cajas > 0)
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
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enVivo, setEnVivo] = useState(true)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [turnoTipo, setTurnoTipo] = useState(() => turnoTipoActual())
  const [buscado, setBuscado] = useState(false)
  const [turnoAnterior, setTurnoAnterior] = useState<ResumenTurnoAnterior | null>(null)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  async function cargarTurnoAnterior(turnoActualId: string | null) {
    if (!session?.area) {
      setTurnoAnterior(null)
      return
    }
    setTurnoAnterior(await obtenerResumenTurnoAnterior(session.area, turnoActualId))
  }

  /*
   * "En vivo" ya no exige un turno con estado ABIERTO en ese instante:
   * usa estado_planta_actual(), que trae el turno más reciente en
   * general (abierto o recién cerrado). Líneas y tanques son estado
   * continuo — tienen que verse igual en el hueco entre que un
   * supervisor finaliza su turno y el siguiente arranca el suyo.
   */
  async function cargarEnVivo() {
    setCargando(true)
    const t = await obtenerEstadoPlantaActual(session?.area ?? null)
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
    setCargando(false)
  }

  async function buscarFechaTipo(f: string, tt: string) {
    setCargando(true)
    setEnVivo(false)
    const t = await obtenerTurnoDeFechaTipo(f, tt)
    setTurno(t)
    await cargarTurnoAnterior(t?.id ?? null)
    setBuscado(true)
    setCargando(false)
  }

  useEffect(() => {
    cargarEnVivo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.area])

  const meta = turno ? calcularMeta(turno, presentaciones) : null
  const horario = HORARIOS[turnoTipo]
  const litrosProducidos = turno ? turno.productoTerminado.reduce((a, p) => a + p.litrosProducidos, 0) : 0
  const lineasEstado = turno ? estadoDeLineas(turno, lineas) : []
  const cajasPorPresentacion = turno ? cajasPorPresentacionDe(turno, presentaciones) : []
  const hh = String(ahora.getHours()).padStart(2, "0")
  const mm = String(ahora.getMinutes()).padStart(2, "0")
  const ss = String(ahora.getSeconds()).padStart(2, "0")

  const tanquesListos = turno ? turno.tanques.filter((t) => t.condicion === "LISTO").length : 0
  const lineasActivas = lineasEstado.filter((l) => l.estado === "activa").length

  return (
    <AppShell title="Panel de Producción" description="Estado de la planta en vivo">
      <div className="flex flex-col gap-5">
        {/* ---------------- BANNER SUPERIOR ---------------- */}
        <section className="panel-banner shadow-panel relative overflow-hidden rounded-2xl border border-border">
          <div className="panel-grid pointer-events-none absolute inset-0 opacity-40" />

          <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
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

              {turno && (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">
                    <UserRound className="size-3.5 text-primary" />
                    {turno.supervisorNombre}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Turno {turno.codigo} · {nombrePorCodigo(GRUPOS, turno.grupo)}
                    {turno.estado === "CERRADO" && turno.horaFin ? ` · Cerrado ${turno.horaFin.slice(0, 5)}` : ""}
                  </span>
                </>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={() => setMostrarFiltros((v) => !v)}>
              <CalendarDays className="size-3.5" />
              {enVivo ? "En vivo" : `${fecha} · ${nombrePorCodigo(TURNO_TIPOS, turnoTipo)}`}
            </Button>
          </div>

          {turno && meta && (
            <div className="relative grid grid-cols-1 divide-y divide-border/70 md:grid-cols-4 md:divide-x md:divide-y-0">
              {/* HORA */}
              <BannerCelda icon={Clock} label="Hora">
                <p className="num flex items-baseline gap-1 text-5xl font-bold leading-none tracking-tight text-foreground">
                  {hh}
                  <span className="alert-pulse text-muted-foreground">:</span>
                  {mm}
                  <span className="text-xl font-semibold text-muted-foreground">:{ss}</span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {horario ? `Ventana ${horario.inicio} – ${horario.fin}` : "Sin horario definido"}
                </p>
              </BannerCelda>

              {/* CAJAS */}
              <BannerCelda icon={Boxes} label="Cajas producidas" acento>
                <p className="num text-5xl font-bold leading-none tracking-tight text-foreground">
                  {meta.totalReales.toLocaleString("es-CO")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Meta del turno {meta.totalEsperadas.toLocaleString("es-CO")} cajas
                </p>
              </BannerCelda>

              {/* LITROS */}
              <BannerCelda icon={Droplets} label="Litros producidos">
                <p className="num text-5xl font-bold leading-none tracking-tight text-foreground">
                  {litrosProducidos.toLocaleString("es-CO")}
                  <span className="ml-1 text-lg font-semibold text-muted-foreground">L</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cajasPorPresentacion.length > 0 ? (
                    cajasPorPresentacion.map((c) => (
                      <span
                        key={c.presentacion}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <span className="num font-semibold text-foreground">{c.cajas.toLocaleString("es-CO")}</span>
                        caj. {c.nombre}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin producto terminado cargado.</span>
                  )}
                </div>
              </BannerCelda>

              {/* META */}
              <BannerCelda icon={Target} label="Cumplimiento de meta">
                <MetaAnillo pct={meta.pctCumplimiento} reales={meta.totalReales} esperadas={meta.totalEsperadas} />
              </BannerCelda>
            </div>
          )}
        </section>

        {mostrarFiltros && (
          <Card className="border-border bg-surface shadow-sm">
            <CardContent className="flex flex-wrap items-end gap-3">
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

              <Button variant="outline" size="sm" onClick={cargarEnVivo} disabled={cargando}>
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
            {/* ------- TANQUES · LÍNEAS · MERMA ------- */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
              <PanelCard
                className="rise-in xl:col-span-5"
                icon={Container}
                titulo="Tanques activos"
                meta={`${tanquesListos}/${turno.tanques.length} listos`}
              >
                <div className="grid grid-cols-3 gap-3">
                  {turno.tanques.map((t) => (
                    <TanqueCard key={t.numeroTanque} tanque={t} preparaciones={turno.preparaciones} />
                  ))}
                </div>
              </PanelCard>

              <PanelCard
                className="rise-in xl:col-span-4"
                icon={Workflow}
                titulo="Líneas activas"
                meta={`${lineasActivas}/${lineasEstado.length} en marcha`}
                descripcion="Estado actual de cada línea de envasado."
              >
                {lineasEstado.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Esta área todavía no tiene líneas cargadas.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {lineasEstado.map((le) => (
                      <LineaEstadoRow key={le.codigo} linea={le} />
                    ))}
                  </div>
                )}
              </PanelCard>

              <div className="rise-in xl:col-span-3">
                {turnoAnterior ? (
                  <TurnoAnteriorCard resumen={turnoAnterior} />
                ) : (
                  <PanelCard icon={ScanLine} titulo="Merma turno anterior">
                    <p className="num text-5xl font-bold leading-none tracking-tight text-muted-foreground">—</p>
                    <p className="mt-2 text-xs text-muted-foreground">Sin turno cerrado previo.</p>
                  </PanelCard>
                )}
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

              <SeccionColapsable titulo="Eficiencia por línea" descripcion="Velocidad elegida vs. máxima disponible.">
                <TablaEficienciaLineas turno={turno} velocidades={velocidades} lineas={lineas} />
              </SeccionColapsable>

              <SeccionColapsable
                titulo="Top Fallas y Paradas de Línea"
                descripcion="El catálogo de paradas todavía no existe — esto va a explicar la diferencia entre la meta esperada y lo producido."
              >
                <TopFallasPlaceholder />
              </SeccionColapsable>
            </div>
          </>
        )}

        <div className="flex flex-col gap-3">
          <TituloSeccion>Histórico</TituloSeccion>
          <SeccionColapsable titulo="Resumen de Planta" descripcion="KPIs, matriz grupo × supervisor y tablas en un rango de fechas.">
            <ResumenPlanta />
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

function BannerCelda({
  icon: Icon,
  label,
  acento,
  children,
}: {
  icon: typeof Clock
  label: string
  acento?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("px-5 py-5", acento && "bg-background/40")}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** Anillo de cumplimiento — conic-gradient sobre tokens del tema. */
function MetaAnillo({ pct, reales, esperadas }: { pct: number | null; reales: number; esperadas: number }) {
  if (pct === null) {
    return (
      <div>
        <p className="num text-5xl font-bold leading-none tracking-tight text-muted-foreground">—</p>
        <p className="mt-2 text-xs text-muted-foreground">Ninguna línea en uso.</p>
      </div>
    )
  }

  const clamped = Math.max(0, Math.min(100, pct))
  const color = clamped >= 90 ? "var(--success)" : clamped >= 60 ? "var(--warning)" : "var(--danger)"

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative grid size-20 shrink-0 place-items-center rounded-full transition-all duration-700"
        style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, color-mix(in oklab, var(--muted) 90%, transparent) 0deg)` }}
      >
        <div className="grid size-[3.6rem] place-items-center rounded-full bg-background">
          <span className="num text-base font-bold" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="num text-2xl font-bold leading-none">
          {reales.toLocaleString("es-CO")}
          <span className="text-sm font-medium text-muted-foreground"> / {esperadas.toLocaleString("es-CO")}</span>
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">Cajas reales vs. meta del turno</p>
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

function LineaEstadoRow({ linea }: { linea: LineaConEstado }) {
  const info = ESTADO_LINEA_INFO[linea.estado]
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors duration-300",
        info.row,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative flex size-2.5 shrink-0 items-center justify-center">
          {linea.estado === "activa" && <span className={cn("dot-ring absolute size-2.5 rounded-full", info.ring)} />}
          <span className={cn("relative size-2.5 rounded-full", info.dot)} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{linea.nombre}</p>
          {linea.corrida?.saborNombre ? (
            <p className="truncate text-xs text-muted-foreground">
              {linea.corrida.saborNombre}
              {linea.corrida.lote ? ` · Lote ${linea.corrida.lote}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/70">Sin corrida</p>
          )}
        </div>
      </div>
      <Badge variant={info.badge}>{info.label}</Badge>
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
  const volumen = listo ? (tanque.volumenL ?? 0) : 0
  const pct = listo ? Math.min(100, (volumen / TANK_CAPACITY) * 100) : 0
  const color = colorSabor(listo ? tanque.saborNombre : null)

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-background/60 transition-shadow duration-300",
        listo ? "border-border hover:shadow-panel" : enPreparacion ? "border-warning/40" : "border-border",
      )}
    >
      {/* Vidrio del tanque */}
      <div className="relative h-44 w-full overflow-hidden bg-muted">
        {listo && (
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-out"
            style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.92 }}
          >
            <div className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%]" style={{ backgroundColor: color }} />
            <div
              className="liquid-wave-2 absolute -top-1 h-2.5 w-[170%] rounded-[50%]"
              style={{ backgroundColor: color, opacity: 0.55 }}
            />
            <span className="liquid-bubble absolute bottom-2 left-1/3 size-1 rounded-full bg-background/70" />
            <span
              className="liquid-bubble absolute bottom-3 left-2/3 size-1.5 rounded-full bg-background/60"
              style={{ animationDelay: "1.4s" }}
            />
          </div>
        )}

        {enPreparacion && (
          <div className="absolute inset-0 grid place-items-center bg-warning-soft">
            <Layers className="alert-pulse size-6 text-warning" />
          </div>
        )}

        {!listo && !enPreparacion && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {tanque.condicion === "SUCIO" ? "Sucio" : "Vacío"}
            </span>
          </div>
        )}

        {/* Marcas de nivel + reflejo */}
        {[25, 50, 75].map((m) => (
          <div
            key={m}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70"
            style={{ bottom: `${m}%` }}
          />
        ))}
        <div className="tank-glass pointer-events-none absolute inset-0" />

        <span className="absolute left-2 top-2 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-foreground">
          T{tanque.numeroTanque}
        </span>

        {listo && (
          <span className="num absolute inset-x-0 bottom-1.5 text-center text-sm font-bold text-foreground drop-shadow">
            {pct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Pie del tanque */}
      <div className="flex min-w-0 flex-col gap-1 border-t border-border/70 px-2.5 py-2">
        {listo ? (
          <>
            <p className="num text-base font-bold leading-none">
              {volumen.toLocaleString("es-CO")}
              <span className="text-[11px] font-medium text-muted-foreground"> L</span>
            </p>
            <span
              className="w-fit max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-background"
              style={{ backgroundColor: color }}
            >
              {tanque.saborNombre ?? "Sabor"}
            </span>
            {tanque.lote && <p className="truncate text-[10px] text-muted-foreground">Lote {tanque.lote}</p>}
          </>
        ) : enPreparacion ? (
          <>
            <Badge variant="warning" className="w-fit">
              En Preparación
            </Badge>
            <p className="truncate text-[10px] text-muted-foreground">
              {ultimaPrep ? `${ultimaPrep.tambores}t · ${ultimaPrep.saborNombre ?? "Sin sabor"}` : "Sin registrar aún."}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {tanque.condicion === "SUCIO" ? "Pendiente de limpieza." : "Disponible para llenar."}
          </p>
        )}
      </div>
    </div>
  )
}

/** Solo la merma del turno anterior, en grande — rojo si supera la tolerancia. */
function TurnoAnteriorCard({ resumen }: { resumen: ResumenTurnoAnterior }) {
  const nivel = resumen.mermaPct === null ? null : nivelMerma(resumen.mermaPct)
  const color = nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : nivel === "ok" ? "text-success" : undefined

  return (
    <Card
      className={cn(
        "shadow-panel gap-0 overflow-hidden border py-0",
        nivel === "danger" ? "border-danger/45" : nivel === "warn" ? "border-warning/40" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3",
          nivel === "danger" ? "bg-danger-soft" : nivel === "warn" ? "bg-warning-soft" : "bg-surface",
        )}
      >
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ScanLine className="size-4 text-primary" />
          Merma turno anterior
        </p>
        {nivel && <Badge variant={badgeVariantPorNivel[nivel]}>Máx. {MERMA_MAX}%</Badge>}
      </div>

      <div className="p-4">
        <p className={cn("num text-5xl font-bold leading-none tracking-tight", color)}>
          {resumen.mermaPct !== null ? `${resumen.mermaPct.toFixed(2)}%` : "—"}
        </p>

        {resumen.mermaPct !== null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                nivel === "danger" ? "bg-danger" : nivel === "warn" ? "bg-warning" : "bg-success",
              )}
              style={{ width: `${Math.min(100, (resumen.mermaPct / MERMA_MAX) * 100)}%` }}
            />
          </div>
        )}

        {nivel === "danger" && (
          <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-danger">
            <AlertTriangle className="size-3" /> Fuera de tolerancia
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs">
          <div>
            <p className="text-muted-foreground">Litros</p>
            <p className="num font-semibold text-foreground">{resumen.litrosProducidos.toLocaleString("es-CO")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Cajas</p>
            <p className="num font-semibold text-foreground">{resumen.cajasProducidas.toLocaleString("es-CO")}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Turno {resumen.turnoCodigo}</p>
      </div>
    </Card>
  )
}

/** Placeholder del top de fallas: la estructura ya está armada, sólo falta el catálogo de paradas. */
function TopFallasPlaceholder() {
  const filas = ["Falla mecánica", "Cambio de formato", "Falta de insumo", "Limpieza / CIP", "Corte eléctrico"]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Construction className="size-4 text-muted-foreground" />
        <Badge variant="warning">Próximamente</Badge>
        <span className="text-xs text-muted-foreground">Vista previa de cómo se va a ver cuando existan registros.</span>
      </div>

      <div className="flex flex-col gap-2">
        {filas.map((f, i) => (
          <div
            key={f}
            className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5"
          >
            <span className="num grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
              {i + 1}
            </span>
            <span className="text-sm text-muted-foreground">{f}</span>
            <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-border" style={{ width: `${100 - i * 18}%` }} />
            </div>
            <span className="num w-12 text-right text-xs text-muted-foreground/70">— min</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** La vieja "Por Línea" de Control de Mermas — velocidad elegida vs. máxima disponible. */
function TablaEficienciaLineas({
  turno,
  velocidades,
  lineas,
}: {
  turno: TurnoActivo
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"]
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
}) {
  const lineasActivas = turno.lineas.filter((l) => l.activa)

  if (lineasActivas.length === 0) {
    return <p className="text-sm text-muted-foreground">Ninguna línea en uso.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface">
            <TableHead className="text-[11px] uppercase tracking-wide">Línea</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wide">Eficiencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineasActivas.map((l) => {
            const opciones = velocidadesParaLive(velocidades, l.linea, l.presentacion)
            const maxima = Math.max(l.envasesHora, ...opciones.map((o) => o.envasesHora))
            const eficiencia = maxima > 0 ? Math.round((l.envasesHora / maxima) * 100) : 0
            return (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{nombrePorCodigo(lineas, l.linea)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-700",
                          eficiencia >= 90 ? "bg-success" : eficiencia >= 60 ? "bg-warning" : "bg-danger",
                        )}
                        style={{ width: `${eficiencia}%` }}
                      />
                    </div>
                    <span className="num w-10 text-right text-xs font-semibold">{eficiencia}%</span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/* ============================ RESUMEN DE PLANTA ============================ */

function ResumenPlanta() {
  const [fechaDesde, setFechaDesde] = useState(() => haceDias(30))
  const [fechaHasta, setFechaHasta] = useState("")
  const [filas, setFilas] = useState<FilaEstadistica[]>([])
  const [cargando, setCargando] = useState(true)

  async function buscar() {
    setCargando(true)
    const lista = await obtenerEstadisticas({ fechaDesde, fechaHasta })
    setFilas(lista)
    setCargando(false)
  }

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mermaProm = promedio(filas.map(mermaPct))
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
        <span className="text-xs text-muted-foreground">Incluye turnos en curso — todas las áreas y supervisores.</span>
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
            <EstadisticaMerma titulo="Merma (prom.)" pct={mermaProm} />
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
        merma: promedio(filasGrupo.map(mermaPct)) ?? 0,
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
        merma: promedio(filasSup.map(mermaPct)) ?? 0,
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
                    {s.merma <= MERMA_WARN && <CheckCircle2 className="size-3" />}
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
