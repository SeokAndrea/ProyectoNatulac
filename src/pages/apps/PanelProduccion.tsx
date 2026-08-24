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
  PackageCheck,
  RadioTower,
  ScanLine,
  Search,
  Target,
  UserRound,
  Users,
} from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive, velocidadesParaLive } from "@/lib/catalogosLive"
import { horasTurno, mermaPct, obtenerEstadisticas, promedio, type FilaEstadistica } from "@/lib/estadisticas"
import { construirHistorial } from "@/lib/historial"
import { calcularMeta, horasTranscurridasTurno, mermaResumenTurno, obtenerEstadoPlantaActual, obtenerTurnoDeFechaTipo } from "@/lib/panelProduccion"
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
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enVivo, setEnVivo] = useState(true)
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [turnoTipo, setTurnoTipo] = useState(() => turnoTipoActual())
  const [buscado, setBuscado] = useState(false)

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
    const t = await obtenerEstadoPlantaActual()
    if (t) {
      setTurno(t)
      setFecha(t.fecha)
      setTurnoTipo(t.turnoTipo)
      setEnVivo(true)
    } else {
      setTurno(null)
      setEnVivo(true)
    }
    setBuscado(true)
    setCargando(false)
  }

  async function buscarFechaTipo(f: string, tt: string) {
    setCargando(true)
    setEnVivo(false)
    const t = await obtenerTurnoDeFechaTipo(f, tt)
    setTurno(t)
    setBuscado(true)
    setCargando(false)
  }

  useEffect(() => {
    cargarEnVivo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const historial = turno ? construirHistorial(turno, lineas, presentaciones) : []
  const meta = turno ? calcularMeta(turno, presentaciones) : null
  const merma = turno ? mermaResumenTurno(turno, presentaciones) : null
  const horario = HORARIOS[turnoTipo]

  return (
    <AppShell title="Panel de Producción" description="Tanques, meta y merma del turno en curso">
      <div className="flex flex-col gap-4">
        <Card className="border-border bg-surface shadow-sm">
          <CardContent className="flex flex-wrap items-end gap-3">
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
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => {
                    setFecha(e.target.value)
                    buscarFechaTipo(e.target.value, turnoTipo)
                  }}
                  className="w-[160px] pl-8"
                />
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={cargarEnVivo} disabled={cargando}>
              {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <RadioTower className="size-3.5" />}
              Ver en vivo
            </Button>

            {turno && (
              <span className="ml-auto text-xs text-muted-foreground">
                Turno {turno.codigo} · {nombrePorCodigo(GRUPOS, turno.grupo)}
                {turno.estado === "CERRADO" && turno.horaFin ? ` · Cerrado ${turno.horaFin.slice(0, 5)}` : ""}
              </span>
            )}
          </CardContent>
        </Card>

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
                : "Probá con otra fecha o tipo de turno."
            }
          />
        ) : (
          <>
            <MetaCard turno={turno} meta={meta!} horario={horario} lineas={lineas} />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Container className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Recepción · {TANK_CAPACITY.toLocaleString("es-CO")} L c/u
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {turno.tanques.map((t) => (
                  <TanqueCard key={t.numeroTanque} tanque={t} preparaciones={turno.preparaciones} />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Control de Mermas · Tolerancia máxima {MERMA_MAX}%
              </h2>
            </div>
            <MermaSection turno={turno} merma={merma!} velocidades={velocidades} lineas={lineas} />

            <div className="flex items-center gap-2 pt-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Paradas de Línea</h2>
            </div>
            <Card className="relative border-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Construction className="size-4 text-primary" />
                    Top Fallas y Paradas de Línea
                  </CardTitle>
                  <Badge variant="warning">Próximamente</Badge>
                </div>
                <CardDescription>
                  El catálogo de paradas todavía no existe — esto va a explicar la diferencia entre la meta esperada y lo
                  producido.
                </CardDescription>
              </CardHeader>
            </Card>

            {historial.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Historial del turno</CardTitle>
                  <CardDescription>Todo lo registrado, en orden.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {historial.map((e, i) => (
                    <div key={i} className="flex gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="num w-12 shrink-0 font-medium text-foreground">{e.hora}</span>
                      <span className="w-36 shrink-0 text-muted-foreground">{e.seccion}</span>
                      <span className="text-foreground">{e.detalle}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        <ResumenPlanta />
      </div>
    </AppShell>
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
        <CardContent className="flex gap-4 p-4">
          <div className="relative h-40 w-14 shrink-0 overflow-hidden rounded-md border border-dashed border-warning/50 bg-warning-soft">
            <Layers className="alert-pulse absolute inset-x-0 top-1/2 mx-auto size-5 -translate-y-1/2 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Container className="size-4 text-muted-foreground" />
                Tanque {tanque.numeroTanque}
              </p>
              <Badge variant="warning">En Preparación</Badge>
            </div>
            {ultimaPrep ? (
              <>
                <p className="num mt-2 text-2xl font-semibold">{ultimaPrep.tambores} tambores</p>
                <p className="text-xs text-muted-foreground">
                  {ultimaPrep.saborNombre ?? "Sin sabor"}
                  {ultimaPrep.lote ? ` · Lote ${ultimaPrep.lote}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Todavía sin registrar en Preparación.</p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (tanque.condicion !== "LISTO") {
    return (
      <Card className="overflow-hidden border-border shadow-sm">
        <CardContent className="flex gap-4 p-4">
          <div className="flex h-40 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <span className="text-[10px] text-muted-foreground">
              {tanque.condicion === "SUCIO" ? "Sucio" : "Vacío"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Container className="size-4 text-muted-foreground" />
              Tanque {tanque.numeroTanque}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {tanque.condicion === "SUCIO" ? "Sucio — pendiente de limpieza." : "Vacío."}
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
      <CardContent className="flex gap-4 p-4">
        <div className="relative h-40 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-700"
            style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
          >
            <div className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%]" style={{ backgroundColor: color }} />
            <div
              className="liquid-wave-2 absolute -top-1 h-2.5 w-[170%] rounded-[50%]"
              style={{ backgroundColor: color, opacity: 0.55 }}
            />
          </div>
          {[25, 50, 75].map((m) => (
            <div key={m} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${m}%` }} />
          ))}
          <span className="num absolute inset-x-0 bottom-1 text-center text-[10px] font-semibold text-foreground/80">
            {pct.toFixed(0)}%
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Container className="size-4 text-muted-foreground" />
              Tanque {tanque.numeroTanque}
            </p>
            <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-background" style={{ backgroundColor: color }}>
              {tanque.saborNombre ?? "Sabor"}
            </span>
          </div>

          <p className="num mt-2 text-2xl font-semibold">{volumen.toLocaleString("es-CO")} L</p>
          <p className="text-xs text-muted-foreground">
            Capacidad máxima {TANK_CAPACITY.toLocaleString("es-CO")} L{tanque.lote ? ` · Lote ${tanque.lote}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function MetaCard({
  turno,
  meta,
  horario,
  lineas,
}: {
  turno: TurnoActivo
  meta: ReturnType<typeof calcularMeta>
  horario: { inicio: string; fin: string } | undefined
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
}) {
  const horas = horasTranscurridasTurno(turno)
  const pct = meta.pctCumplimiento

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4 text-primary" />
            Meta del Turno
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Cajas esperadas (velocidad elegida × horas transcurridas) vs. envases buenos contados.
            </span>
            <Badge variant="muted">{nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {meta.totalEsperadas === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna línea en uso este turno (parada) — no hay meta que calcular.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6 xl:flex-nowrap">
              <div className="flex shrink-0 items-baseline gap-3">
                <p className="num text-5xl font-semibold tracking-tight">{pct !== null ? `${pct}%` : "—"}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="num font-semibold text-foreground">{meta.totalReales.toLocaleString("es-CO")}</span> de{" "}
                  {meta.totalEsperadas.toLocaleString("es-CO")} cajas
                </p>
              </div>

              <div className="h-3 min-w-[140px] flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700",
                    pct === null ? "bg-muted-foreground" : pct >= 90 ? "bg-success" : pct >= 70 ? "bg-warning" : "bg-danger",
                  )}
                  style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                />
              </div>

              <div className="flex shrink-0 flex-wrap gap-5 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <MetaStat icon={Boxes} label={`Esperadas · ${horas.toFixed(1)} h`} value={meta.totalEsperadas.toLocaleString("es-CO")} />
                <MetaStat icon={PackageCheck} label="Reales" value={meta.totalReales.toLocaleString("es-CO")} />
                <MetaStat
                  icon={Droplets}
                  label="Litros"
                  value={turno.productoTerminado.reduce((a, p) => a + p.litrosProducidos, 0).toLocaleString("es-CO")}
                />
                <MetaStat icon={Clock} label="Horario" value={horario ? `${horario.inicio}–${horario.fin}` : "—"} />
              </div>
            </div>

            {meta.porLinea.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                {meta.porLinea.map((m) => (
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
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MetaStat({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="num text-lg font-semibold leading-none">{value}</p>
    </div>
  )
}

function MermaSection({
  turno,
  merma,
  velocidades,
  lineas,
}: {
  turno: TurnoActivo
  merma: ReturnType<typeof mermaResumenTurno>
  velocidades: ReturnType<typeof useCatalogosLive>["velocidades"]
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
}) {
  const lineasActivas = turno.lineas.filter((l) => l.activa)

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <MermaHeadlineCard
        titulo="Merma del Turno"
        descripcion="Envases de la llenadora vs. Producto Terminado"
        icon={ScanLine}
        pct={merma.pct}
      />

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-primary" />
            Por Línea
          </CardTitle>
          <CardDescription>Velocidad elegida vs. máxima disponible.</CardDescription>
        </CardHeader>
        <CardContent>
          {lineasActivas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna línea en uso.</p>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </section>
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

function MermaHeadlineCard({
  titulo,
  descripcion,
  icon: Icon,
  pct,
}: {
  titulo: string
  descripcion: string
  icon: typeof ScanLine
  pct: number | null
}) {
  const nivel = pct === null ? null : nivelMerma(pct)
  const StatusIcon = nivel === "danger" ? AlertTriangle : nivel === "warn" ? Gauge : CheckCircle2
  const color = nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : "text-success"

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" />
          {titulo}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        {pct === null ? (
          <p className="text-sm text-muted-foreground">Sin registros todavía.</p>
        ) : (
          <div className="flex items-center gap-3">
            <StatusIcon className={cn("size-7", color, nivel === "danger" && "alert-pulse")} />
            <div>
              <p className={cn("num text-3xl font-semibold", color)}>{pct.toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground">
                {nivel === "danger" ? "Fuera de tolerancia" : nivel === "warn" ? "Vigilar línea" : "Normal"}
              </p>
            </div>
            <Badge variant={badgeVariantPorNivel[nivel!]} className="ml-auto">
              Límite {MERMA_MAX.toFixed(1)}%
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
