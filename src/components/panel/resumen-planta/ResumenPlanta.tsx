import { useEffect, useState } from "react"
import { AlertTriangle, BarChart3, Clock, Droplets, Gauge, Loader2, Search, type LucideIcon } from "lucide-react"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AreaCodigo } from "@/lib/catalogos"
import { horasTurno, mermaAgregada, nivelMerma, obtenerEstadisticas, type FilaEstadistica } from "@/lib/estadisticas"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"
import { MatrizGrupoSupervisor } from "./MatrizGrupoSupervisor"
import { TablaPorGrupo, TablaPorSupervisor } from "./TablasResumen"

/**
 * "Resumen de planta" (al final del Panel) es lo que antes vivía en Mis
 * Estadísticas: KPIs, matriz grupo × supervisor, y tablas por grupo y por
 * supervisor sobre un rango de fechas — independiente del turno elegido
 * arriba.
 */
export function ResumenPlanta({ areaCodigo }: { areaCodigo: AreaCodigo | null }) {
  const [fechaDesde, setFechaDesde] = useState(() => restarDias(fechaPlanta(), 30))
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
        <span className="text-xs text-muted-foreground">Incluye turnos en curso{areaCodigo ? "" : " — todas las áreas (sin Pruebas)"}.</span>
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

function EstadisticaTile({ icon: Icon, label, valor }: { icon: LucideIcon; label: string; valor: string }) {
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
        nivel === "danger" ? "border-danger/35 bg-danger-soft" : nivel === "warn" ? "border-warning/35 bg-warning-soft" : "border-border bg-background/60",
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
