import { PauseCircle } from "lucide-react"
import { TextoDesplazable } from "@/components/TextoDesplazable"
import type { LineaLive } from "@/lib/catalogosLive"
import { duracionMin, type Parada } from "@/lib/paradas"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"
import { formatDuracion, paradaMasLargaDe } from "./calculosPanel"
import { PanelCard } from "./PanelCard"

/** Tarjeta "Parada con mayor duración": la parada individual más larga del turno (Módulo Paradas). */
export function ParadaMasLarga({
  paradas,
  completas,
  lineas,
  ahora,
}: {
  paradas: Parada[]
  /** Las mismas paradas sin recortar al turno, por id: de ahí sale el «Total» al pasar el cursor. */
  completas?: Map<string, Parada>
  lineas: LineaLive[]
  ahora: Date
}) {
  // paradas ya trae el tramo de este turno: ese es el que se compara y se muestra.
  const parada = paradaMasLargaDe(paradas, ahora)
  const total = parada && completas?.has(parada.id) ? duracionMin(completas.get(parada.id)!, ahora) : null
  const tramo = parada ? duracionMin(parada, ahora) : 0
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
            {/* La descripción que escribió quien la registró (máx. LARGO_NOTA_PARADA). */}
            {parada.nota && <TextoDesplazable texto={parada.nota} className="text-xs text-foreground" />}
          </div>
          <span
            className="num shrink-0 text-lg font-bold text-warning-foreground"
            title={total !== null && total !== tramo ? `Total ${total} min` : undefined}
          >
            {formatDuracion(tramo)}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin paradas registradas para este turno.</p>
      )}
    </PanelCard>
  )
}
