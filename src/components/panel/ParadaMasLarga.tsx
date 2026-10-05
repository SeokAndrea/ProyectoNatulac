import { PauseCircle } from "lucide-react"
import type { LineaLive } from "@/lib/catalogosLive"
import { duracionMin, type Parada } from "@/lib/paradas"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"
import { formatDuracion, paradaMasLargaDe } from "./calculosPanel"
import { PanelCard } from "./PanelCard"

/** Tarjeta "Parada con mayor duración": la parada individual más larga del turno (Módulo Paradas). */
export function ParadaMasLarga({ paradas, lineas, ahora }: { paradas: Parada[]; lineas: LineaLive[]; ahora: Date }) {
  const parada = paradaMasLargaDe(paradas, ahora)
  return (
    <PanelCard icon={PauseCircle} titulo="Parada con mayor duración" meta={paradas.length > 0 ? `${paradas.length} paradas` : undefined}>
      {parada ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {lineas.find((l) => "LINEA_" + l.codigo.replace(/^LINEA_T?/, "") === parada.lineaCodigo)?.nombre ?? parada.lineaCodigo}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {codigoDeParadaLive(parada) ? codigoDeParadaLive(parada) + " · " : ""}
              {parada.tipoNombre}
            </p>
          </div>
          <span className="num shrink-0 text-lg font-bold text-warning">{formatDuracion(duracionMin(parada, ahora))}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin paradas registradas para este turno.</p>
      )}
    </PanelCard>
  )
}
