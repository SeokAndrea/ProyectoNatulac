import { Link } from "react-router-dom"
import { AlertTriangle, Workflow } from "lucide-react"
import { CintaEstadoLinea, type EstadoCinta } from "@/components/CintaEstadoLinea"
import { colorTextoPorNivel, nivelMerma, type NivelMerma } from "@/lib/estadisticas"
import { cn } from "@/lib/utils"
import { formatDuracion, type EstadoLinea, type FilaLineaCompacta } from "./calculosPanel"
import { PanelCard } from "./PanelCard"

const ESTADO_LINEA_INFO: Record<EstadoLinea, { label: string; dot: string; ring: string }> = {
  activa: { label: "Activa", dot: "bg-success", ring: "bg-success" },
  parada: { label: "Parada", dot: "bg-warning", ring: "bg-warning" },
  esperando_cierre: { label: "Esperando cierre", dot: "bg-danger", ring: "bg-danger" },
  cambio_presentacion: { label: "Cambio de Presentación", dot: "bg-warning", ring: "bg-warning" },
  cip: { label: "En CIP", dot: "bg-warning", ring: "bg-warning" },
  sin_programacion: { label: "Sin programación", dot: "bg-info", ring: "bg-info" },
  detenida: { label: "Parada", dot: "bg-danger", ring: "bg-danger" },
  libre: { label: "Libre", dot: "bg-muted-foreground", ring: "bg-muted-foreground" },
}

/**
 * Cinta pixel art chiquita a la derecha del nombre de la línea (misma que
 * Líneas — ver CintaEstadoLinea). En los estados sin escena (libre, sin
 * programación, cambio de presentación, esperando cierre) no se dibuja
 * nada: queda solo el texto.
 */
const CINTA_POR_ESTADO: Partial<Record<EstadoLinea, EstadoCinta>> = {
  activa: "corriendo",
  parada: "parada",
  detenida: "detenida",
  cip: "cip",
}

/** Tarjeta "Líneas activas": una fila por línea con estado, producción, eficiencia, paradas y merma. Para el supervisor, cada fila lleva a Preparación. */
export function SeccionLineas({ filas, conLinks }: { filas: FilaLineaCompacta[]; conLinks: boolean }) {
  const activas = filas.filter((l) => l.estado === "activa").length
  return (
    <PanelCard className="rise-in" icon={Workflow} titulo="Líneas activas" meta={`${activas}/${filas.length} en marcha`}>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta área todavía no tiene líneas cargadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="linea-fila-grid border-b border-border px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Línea</span>
              <span className="text-right">Cajas producidas</span>
              <span className="text-right">Merma</span>
              <span className="text-right">Tiempo de parada</span>
              <span className="text-right">Eficiencia</span>
              <span className="text-right">Litros producidos</span>
            </div>
            {filas.map((f) =>
              conLinks ? (
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
  )
}

/** Fila compacta de "Líneas activas": estado + producción + merma en una sola línea. */
function LineaFilaCompacta({ fila }: { fila: FilaLineaCompacta }) {
  const info = ESTADO_LINEA_INFO[fila.estado]
  const nivelEficiencia: NivelMerma | null =
    fila.eficienciaPct === null ? null : fila.eficienciaPct >= 90 ? "ok" : fila.eficienciaPct >= 60 ? "warn" : "danger"
  const nivelMermaFila = fila.mermaPct === null ? null : nivelMerma(fila.mermaPct)
  const colorPor = colorTextoPorNivel

  return (
    <div className="linea-fila-grid border-b border-border/60 px-2 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-muted/40">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex size-2.5 shrink-0 items-center justify-center">
          {fila.estado === "activa" && <span className={cn("dot-ring absolute size-2.5 rounded-full", info.ring)} />}
          <span className={cn("relative size-2.5 rounded-full", info.dot)} />
        </span>
        <div className="min-w-0 flex-1">
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
        <MiniCinta fila={fila} alertaMerma={nivelMermaFila === "danger"} />
      </div>
      <p className="num text-right font-semibold text-foreground">{fila.cajas.toLocaleString("es-CO")}</p>
      <p className={cn("num text-right font-semibold", colorPor(nivelMermaFila))}>
        {fila.mermaPct !== null ? `${fila.mermaPct.toFixed(2)}%` : "—"}
      </p>
      <p className={cn("num text-right font-semibold", fila.minutosParada !== null ? "text-warning" : "italic text-muted-foreground/60")}>
        {fila.minutosParada !== null ? formatDuracion(fila.minutosParada) : "—"}
      </p>
      <p className={cn("num text-right font-semibold", colorPor(nivelEficiencia))}>
        {fila.eficienciaPct !== null ? `${fila.eficienciaPct}%` : "—"}
      </p>
      <p className="num text-right font-semibold text-foreground">{fila.litros.toLocaleString("es-CO")} L</p>
    </div>
  )
}

function MiniCinta({ fila, alertaMerma }: { fila: FilaLineaCompacta; alertaMerma: boolean }) {
  const estado = CINTA_POR_ESTADO[fila.estado]
  if (!estado) return null
  return (
    <CintaEstadoLinea
      estado={estado}
      saborNombre={fila.corrida?.saborNombre}
      presentacion={fila.corrida?.presentacion}
      alertaMerma={alertaMerma}
      className="w-36 shrink-0"
    />
  )
}
