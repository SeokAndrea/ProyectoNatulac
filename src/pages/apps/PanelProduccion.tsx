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
  Layers,
  Loader2,
  RadioTower,
  ScanLine,
  Search,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

/** Color estable por sabor (mismo sabor = mismo color siempre), ciclando la paleta de "sabor" del tema. */
const COLORES_SABOR = ["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]
function colorSabor(nombre: string | null): string {
  if (!nombre) return "var(--muted-foreground)"
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

const ESTADO_LINEA_INFO: Record<EstadoLinea, { label: string; badge: "success" | "warning" | "danger" | "muted"; dot: string }> = {
  activa: { label: "Activa", badge: "success", dot: "bg-success" },
  parada: { label: "Parada", badge: "warning", dot: "bg-warning" },
  esperando_cierre: { label: "Esperando cierre", badge: "danger", dot: "bg-danger" },
  libre: { label: "Libre", badge: "muted", dot: "bg-muted-foreground" },
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
 * Panel de Producción: vista EN VIVO del turno en curso (tanques,
 * meta calculada, merma, por línea) — con selector de fecha/turno
 * para ver turnos anteriores. Estilo adaptado del dashboard de
 * referencia (github.com/SeokAndrea/brew-flow-monitor). Sin
 * restricción de rol (mismo criterio que el resto del dashboard).
 *
 * "Top Paradas" queda como placeholder — el catálogo de paradas
 * todavía no existe (ver resumen-diseno-dashboard-natulac.md).
 *
 * "Resumen de planta" (al final, componente ResumenPlanta) es lo que
 * antes vivía en Mis Estadísticas (página eliminada 2026-08-24): KPIs,
 * Por Grupo y Por Supervisor sobre un rango de fechas — independiente
 * del turno elegido arriba. Se sacó el gráfico de merma por línea (no
 * quedaba bien acá) y el filtro "mis turnos" del supervisor logueado
 * (ahora siempre muestra todas las áreas/supervisores).
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
   * supervisor finaliza su turno y el siguiente arranca el suyo, no
   * solo mientras hay uno abierto (antes esta pantalla se vaciaba ahí,
   * dando la falsa impresión de que finalizar turno borraba todo).
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
  const horaTexto = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}:${String(ahora.getSeconds()).padStart(2, "0")}`

  return (
    <AppShell title="Panel de Producción" description="Estado de la planta en vivo">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {turno?.estado === "ABIERTO" ? (
              <Badge variant="success" className="gap-1.5 py-1">
                <Activity className="size-3.5" />
                <span className="alert-pulse inline-flex size-1.5 rounded-full bg-success" />
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
              <span className="text-xs text-muted-foreground">
                Turno {turno.codigo} · {turno.supervisorNombre} · {nombrePorCodigo(GRUPOS, turno.grupo)}
                {turno.estado === "CERRADO" && turno.horaFin ? ` · Cerrado ${turno.horaFin.slice(0, 5)}` : ""}
              </span>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => setMostrarFiltros((v) => !v)}>
            <CalendarDays className="size-3.5" />
            {enVivo ? "En vivo" : `${fecha} · ${nombrePorCodigo(TURNO_TIPOS, turnoTipo)}`}
          </Button>
        </div>

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <HeroStat icon={Clock} label="Hora" value={horaTexto} />
              <HeroStat
                icon={Droplets}
                label="Litros producidos"
                value={litrosProducidos.toLocaleString("es-CO")}
                sub={
                  cajasPorPresentacion.length > 0
                    ? cajasPorPresentacion.map((c) => `${c.cajas.toLocaleString("es-CO")} caj. de ${c.nombre}`).join(" · ")
                    : undefined
                }
              />
              <HeroStat
                icon={Boxes}
                label="Cajas vs. meta"
                value={`${meta!.totalReales.toLocaleString("es-CO")} / ${meta!.totalEsperadas.toLocaleString("es-CO")}`}
                sub={meta!.pctCumplimiento !== null ? `${meta!.pctCumplimiento}% de la meta · ${horario ? `${horario.inicio}–${horario.fin}` : ""}` : "Ninguna línea en uso"}
              />
              {turnoAnterior ? (
                <TurnoAnteriorCard resumen={turnoAnterior} />
              ) : (
                <HeroStat icon={ScanLine} label="Merma turno anterior" value="—" sub="Sin turno cerrado previo" />
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Container className="size-4 text-primary" />
                    Tanques
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {turno.tanques.map((t) => (
                    <TanqueCard key={t.numeroTanque} tanque={t} preparaciones={turno.preparaciones} />
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Workflow className="size-4 text-primary" />
                    Líneas
                  </CardTitle>
                  <CardDescription>Estado actual de cada línea.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {lineasEstado.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Esta área todavía no tiene líneas cargadas.</p>
                  ) : (
                    lineasEstado.map((le) => <LineaEstadoRow key={le.codigo} linea={le} />)
                  )}
                </CardContent>
              </Card>
            </div>

            <SeccionColapsable titulo="Meta por línea" descripcion="Cajas reales vs. esperadas (velocidad elegida × horas transcurridas), por línea.">
              {meta!.porLinea.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguna línea en uso este turno.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {meta!.porLinea.map((m) => (
                    <span
                      key={m.linea}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs"
                    >
                      <span className="text-muted-foreground">{nombrePorCodigo(lineas, m.linea)}</span>
                      <span className="num font-semibold text-foreground">
                        {m.cajasReales.toLocaleString("es-CO")}/{m.cajasEsperadas.toLocaleString("es-CO")}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </SeccionColapsable>

            <SeccionColapsable titulo="Eficiencia por línea" descripcion="Velocidad elegida vs. máxima disponible.">
              <TablaEficienciaLineas turno={turno} velocidades={velocidades} lineas={lineas} />
            </SeccionColapsable>

            <SeccionColapsable titulo="Top Fallas y Paradas de Línea" descripcion="El catálogo de paradas todavía no existe — esto va a explicar la diferencia entre la meta esperada y lo producido.">
              <div className="flex items-center gap-2">
                <Construction className="size-4 text-muted-foreground" />
                <Badge variant="warning">Próximamente</Badge>
              </div>
            </SeccionColapsable>
          </>
        )}

        <SeccionColapsable titulo="Resumen de Planta" descripcion="KPIs, por grupo y por supervisor en un rango de fechas.">
          <ResumenPlanta />
        </SeccionColapsable>
      </div>
    </AppShell>
  )
}

function HeroStat({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="flex flex-col gap-1 py-5">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        <p className="num text-4xl font-bold leading-none tracking-tight sm:text-5xl">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function LineaEstadoRow({ linea }: { linea: LineaConEstado }) {
  const info = ESTADO_LINEA_INFO[linea.estado]
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2.5">
        <span className={cn("size-2 shrink-0 rounded-full", info.dot, linea.estado === "activa" && "alert-pulse")} />
        <div>
          <p className="font-medium text-foreground">{linea.nombre}</p>
          {linea.corrida?.saborNombre && (
            <p className="text-xs text-muted-foreground">
              {linea.corrida.saborNombre}
              {linea.corrida.lote ? ` · Lote ${linea.corrida.lote}` : ""}
            </p>
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

  if (tanque.condicion === "EN_PREPARACION") {
    return (
      <Card className="overflow-hidden border-border shadow-sm">
        <CardContent className="flex gap-2.5 p-3">
          <div className="relative h-20 w-8 shrink-0 overflow-hidden rounded-md border border-dashed border-warning/50 bg-warning-soft">
            <Layers className="alert-pulse absolute inset-x-0 top-1/2 mx-auto size-4 -translate-y-1/2 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Tanque {tanque.numeroTanque}</p>
            <Badge variant="warning" className="mt-1">
              En Preparación
            </Badge>
            {ultimaPrep && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {ultimaPrep.tambores}t · {ultimaPrep.saborNombre ?? "Sin sabor"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (tanque.condicion !== "LISTO") {
    return (
      <Card className="overflow-hidden border-border shadow-sm">
        <CardContent className="flex gap-2.5 p-3">
          <div className="flex h-20 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <span className="text-[9px] text-muted-foreground">{tanque.condicion === "SUCIO" ? "Sucio" : "Vacío"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Tanque {tanque.numeroTanque}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tanque.condicion === "SUCIO" ? "Pendiente de limpieza." : "Vacío."}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const volumen = tanque.volumenL ?? 0
  const pct = Math.min(100, (volumen / TANK_CAPACITY) * 100)
  const color = colorSabor(tanque.saborNombre)

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="flex gap-2.5 p-3">
        <div className="relative h-20 w-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-700"
            style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
          />
          <span className="num absolute inset-x-0 bottom-0.5 text-center text-[9px] font-semibold text-foreground/80">
            {pct.toFixed(0)}%
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-semibold">Tanque {tanque.numeroTanque}</p>
            <span
              className="truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-background"
              style={{ backgroundColor: color }}
            >
              {tanque.saborNombre ?? "Sabor"}
            </span>
          </div>
          <p className="num mt-1 text-lg font-semibold leading-none">{volumen.toLocaleString("es-CO")} L</p>
          {tanque.lote && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Lote {tanque.lote}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

/** Cómo cerró el último turno de esta área — referencia rápida al lado de lo que va del turno en curso. */
/** Solo la merma del turno anterior, en grande — litros/cajas de referencia van chicos abajo. */
function TurnoAnteriorCard({ resumen }: { resumen: ResumenTurnoAnterior }) {
  const nivel = resumen.mermaPct === null ? null : nivelMerma(resumen.mermaPct)
  const color = nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : nivel === "ok" ? "text-success" : undefined

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="flex flex-col gap-1 py-5">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ScanLine className="size-3.5" />
          Merma turno anterior
        </div>
        <p className={cn("num text-4xl font-bold leading-none tracking-tight sm:text-5xl", color)}>
          {resumen.mermaPct !== null ? `${resumen.mermaPct.toFixed(2)}%` : "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Turno {resumen.turnoCodigo} · {resumen.litrosProducidos.toLocaleString("es-CO")} L ·{" "}
          {resumen.cajasProducidas.toLocaleString("es-CO")} cajas
        </p>
      </CardContent>
    </Card>
  )
}


/** La vieja "Por Línea" de Control de Mermas — velocidad elegida vs. máxima disponible. Vive colapsada como detalle secundario. */
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Línea</TableHead>
          <TableHead className="text-right">Eficiencia</TableHead>
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
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${eficiencia}%` }} />
                  </div>
                  <span className="num text-xs font-semibold">{eficiencia}%</span>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/*
 * Resumen de planta: lo que antes era Mis Estadísticas (página
 * eliminada) — KPIs, Por Grupo y Por Supervisor sobre un rango de
 * fechas, siempre todas las áreas/supervisores (sin filtro personal).
 * Independiente del turno elegido arriba en la página.
 */
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
    <>
      <div className="flex items-center gap-2 pt-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resumen de Planta</h2>
      </div>

      <Card className="border-border bg-surface shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Desde</span>
            <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Hasta</span>
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={buscar} disabled={cargando}>
            {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Buscar
          </Button>
          <span className="text-xs text-muted-foreground">Incluye turnos en curso — todas las áreas y supervisores.</span>
        </CardContent>
      </Card>

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

          <div className="grid gap-4 xl:grid-cols-2">
            <TablaPorGrupo filas={filas} />
            <TablaPorSupervisor filas={filas} />
          </div>
        </div>
      )}
    </>
  )
}

function EstadisticaTile({ icon: Icon, label, valor }: { icon: typeof Clock; label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="num mt-1.5 text-2xl font-semibold">{valor}</p>
    </div>
  )
}

function EstadisticaMerma({ titulo, pct }: { titulo: string; pct: number | null }) {
  const nivel = pct === null ? null : nivelMerma(pct)
  const color = nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : "text-success"
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        nivel === "danger"
          ? "border-danger/30 bg-danger-soft"
          : nivel === "warn"
            ? "border-warning/30 bg-warning-soft"
            : "border-border bg-background/60",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Gauge className="size-3.5" />
        {titulo}
      </div>
      <p className={cn("num mt-1.5 text-2xl font-semibold", nivel !== null && color)}>{pct !== null ? `${pct}%` : "—"}</p>
      {nivel === "danger" && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-danger">
          <AlertTriangle className="size-3" /> Fuera de tolerancia
        </p>
      )}
    </div>
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
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="size-4 text-primary" />
          Por Grupo
        </CardTitle>
        <CardDescription>Litros, horas y merma real por grupo de turno.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grupo</TableHead>
              <TableHead className="text-right">Litros</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead className="text-right">Merma real</TableHead>
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
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <UserRound className="size-4 text-primary" />
          Por Supervisor
        </CardTitle>
        <CardDescription>Litros producidos y merma real por supervisor.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supervisor</TableHead>
              <TableHead className="text-right">Litros</TableHead>
              <TableHead className="text-right">Merma real</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supervisores.map((s) => (
              <TableRow key={s.usuario}>
                <TableCell className="font-medium">{s.nombre}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(s.litros / maxLitros) * 100}%` }} />
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

