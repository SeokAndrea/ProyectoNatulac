import { useEffect, useState } from "react"
import { BarChart3, Clock, Dices, Loader2, Package, PinIcon, Search, TrendingDown, UserRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive, type LineaLive } from "@/lib/catalogosLive"
import { LIMITE_MERMA } from "@/lib/turno"
import { cn } from "@/lib/utils"
import { generarDatosPrueba } from "@/lib/datosPrueba"
import {
  horasTurno,
  mermaRealPct,
  mermaTeoricaPct,
  obtenerEstadisticas,
  promedio,
  type FilaEstadistica,
} from "@/lib/estadisticas"

const LIMITE_MERMA_PCT = LIMITE_MERMA * 100

function haceDias(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/*
 * Primera versión del dashboard descrito en
 * resumen-diseno-dashboard-natulac.md, construida sobre lo que ya
 * existe (turnos cerrados, contadores, producto_terminado) — sin el
 * modelo de "corridas" ni catálogo de paradas, todavía sin construir.
 * "Meta" también queda pendiente (depende de tiempo real disponible,
 * que a su vez depende de paradas).
 *
 * Dos vistas con los mismos datos: "Dashboard de Planta" (todas las
 * áreas/supervisores) y "Mis Estadísticas" (filtrado al supervisor
 * logueado — solo tiene sentido para el rol SUPERVISOR, los demás
 * roles no tienen turnos propios).
 */
export default function MisEstadisticas() {
  const { session } = useAuth()
  const { lineas, velocidades, presentaciones } = useCatalogosLive()
  const [filas, setFilas] = useState<FilaEstadistica[]>([])
  const [cargando, setCargando] = useState(true)
  const [fechaDesde, setFechaDesde] = useState(() => haceDias(30))
  const [fechaHasta, setFechaHasta] = useState("")
  const [turnosPorSupervisor, setTurnosPorSupervisor] = useState("8")
  const [generando, setGenerando] = useState(false)
  const [progreso, setProgreso] = useState<string | null>(null)
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null)

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

  const misFilas = filas.filter((f) => f.supervisorUsuario === session?.username)

  async function handleGenerar() {
    if (!session) return
    setGenerando(true)
    setErrorGenerar(null)
    const resultado = await generarDatosPrueba(
      session.username,
      velocidades,
      presentaciones,
      Math.max(1, Number(turnosPorSupervisor) || 1),
      setProgreso,
    )
    setGenerando(false)
    setProgreso(null)
    if (!resultado.ok) {
      setErrorGenerar(resultado.error)
      return
    }
    buscar()
  }

  return (
    <AppShell title="Mis Estadísticas" description="Rendimiento y métricas de planta">
      <div className="flex flex-col gap-6">
        {session?.rol === "SUPERADMINISTRADOR" && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Generar datos de prueba</CardTitle>
              <CardDescription>
                Crea turnos cerrados completos (Recepción, Contadores, Producto Terminado) para 3 supervisores de
                prueba, repartidos en los últimos 30 días — solo para probar el dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="turnos-por-supervisor">Turnos por supervisor</Label>
                <Input
                  id="turnos-por-supervisor"
                  type="number"
                  min={1}
                  max={30}
                  value={turnosPorSupervisor}
                  onChange={(e) => setTurnosPorSupervisor(e.target.value)}
                  className="w-32"
                  disabled={generando}
                />
              </div>
              <Button variant="outline" onClick={handleGenerar} disabled={generando}>
                {generando ? <Loader2 className="size-4 animate-spin" /> : <Dices className="size-4" />}
                Generar
              </Button>
              {progreso && <p className="text-xs text-muted-foreground">{progreso}</p>}
              {errorGenerar && (
                <p className="w-full text-xs text-destructive" role="alert">
                  {errorGenerar}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ee-desde">Desde</Label>
              <Input
                id="ee-desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ee-hasta">Hasta</Label>
              <Input
                id="ee-hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-40"
              />
            </div>
            <Button size="sm" onClick={buscar} disabled={cargando}>
              {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              Buscar
            </Button>
            <p className="text-xs text-muted-foreground">Incluye turnos en curso — se actualiza a medida que se carga data.</p>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PinIcon className="size-4 text-primary" />
              Dashboard de Planta
            </CardTitle>
            <CardDescription>Todas las áreas y supervisores, en el rango de fechas elegido.</CardDescription>
          </CardHeader>
          <CardContent>
            <PanelEstadisticas
              filas={filas}
              lineas={lineas}
              cargando={cargando}
              vacioDescripcion="No hay turnos en ese rango de fechas."
            />
          </CardContent>
        </Card>

        {session?.rol === "SUPERVISOR" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-muted-foreground" />
                Mis Estadísticas
              </CardTitle>
              <CardDescription>Solo tus turnos, en el rango de fechas elegido.</CardDescription>
            </CardHeader>
            <CardContent>
              <PanelEstadisticas
                filas={misFilas}
                lineas={lineas}
                cargando={cargando}
                vacioDescripcion="No tienes turnos en ese rango de fechas."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

function PanelEstadisticas({
  filas,
  lineas,
  cargando,
  vacioDescripcion,
}: {
  filas: FilaEstadistica[]
  lineas: LineaLive[]
  cargando: boolean
  vacioDescripcion: string
}) {
  if (cargando) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (filas.length === 0) {
    return <EmptyState icon={BarChart3} title="Sin datos" description={vacioDescripcion} />
  }

  const mermaTeoricaProm = promedio(filas.map(mermaTeoricaPct))
  const mermaRealProm = promedio(filas.map(mermaRealPct))
  const horasTotales = filas.reduce((acc, f) => acc + (horasTurno(f) ?? 0), 0)
  const litrosTotales = filas.reduce((acc, f) => acc + f.litrosProducidos, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EstadisticaTile
          icon={TrendingDown}
          label="Merma teórica (prom.)"
          valor={mermaTeoricaProm !== null ? `${mermaTeoricaProm}%` : "—"}
          alerta={mermaTeoricaProm !== null && mermaTeoricaProm > LIMITE_MERMA_PCT}
        />
        <EstadisticaTile
          icon={TrendingDown}
          label="Merma real (prom.)"
          valor={mermaRealProm !== null ? `${mermaRealProm}%` : "—"}
          alerta={mermaRealProm !== null && mermaRealProm > LIMITE_MERMA_PCT}
        />
        <EstadisticaTile icon={Clock} label="Horas de producción" valor={`${Math.round(horasTotales)} h`} />
        <EstadisticaTile icon={Package} label="Litros producidos" valor={litrosTotales.toLocaleString("es-CO")} />
      </div>

      <GraficoMermaPorLinea filas={filas} lineas={lineas} />
    </div>
  )
}

function EstadisticaTile({
  icon: Icon,
  label,
  valor,
  alerta,
}: {
  icon: LucideIcon
  label: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div className={cn("rounded-lg border p-3", alerta ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className={cn("mt-1 text-2xl font-semibold", alerta ? "text-destructive" : "text-foreground")}>{valor}</p>
    </div>
  )
}

/**
 * Merma teórica vs real por línea. Un solo eje (0–máximo %), dos
 * series categóricas (teórica / real, siempre el mismo color cada
 * una) con leyenda y etiqueta directa del valor en cada barra.
 */
function GraficoMermaPorLinea({ filas, lineas }: { filas: FilaEstadistica[]; lineas: LineaLive[] }) {
  const porLinea = lineas
    .map((l) => {
      const filasLinea = filas.filter((f) => f.linea === l.codigo)
      return {
        linea: l.nombre,
        teorica: promedio(filasLinea.map(mermaTeoricaPct)),
        real: promedio(filasLinea.map(mermaRealPct)),
      }
    })
    .filter((d) => d.teorica !== null || d.real !== null)

  if (porLinea.length === 0) return null

  const maxValor = Math.max(LIMITE_MERMA_PCT, ...porLinea.flatMap((d) => [d.teorica ?? 0, d.real ?? 0]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-chart-1" />
          Merma teórica
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-chart-2" />
          Merma real
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {porLinea.map((d) => (
          <div key={d.linea} className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">{d.linea}</p>
            <BarraComparativa valor={d.teorica} max={maxValor} className="bg-chart-1" />
            <BarraComparativa valor={d.real} max={maxValor} className="bg-chart-2" />
          </div>
        ))}
      </div>
    </div>
  )
}

function BarraComparativa({ valor, max, className }: { valor: number | null; max: number; className: string }) {
  const pct = valor === null ? 0 : Math.max(0, Math.min(100, (valor / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-medium text-foreground">{valor === null ? "—" : `${valor}%`}</span>
    </div>
  )
}
