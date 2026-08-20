import { Badge } from "@/components/ui/badge"
import { LINEAS, nombrePorCodigo } from "@/lib/catalogos"
import type { ContadorRegistro } from "@/lib/turno"

/**
 * Lista de contadores (envases llenadora/buenos/desechados) cargados
 * en el turno. La usan Producto Terminado (mientras se van cargando)
 * y el Acta de Fin de Turno (con los totales, para el cierre).
 */
export function ListaContadores({
  contadores,
  mostrarTotales = false,
}: {
  contadores: ContadorRegistro[]
  mostrarTotales?: boolean
}) {
  const totales = contadores.reduce(
    (acc, c) => ({
      llenadora: acc.llenadora + c.envasesLlenadora,
      buenos: acc.buenos + c.envasesBuenos,
      desechados: acc.desechados + c.envasesDesechados,
    }),
    { llenadora: 0, buenos: 0, desechados: 0 },
  )
  const mermaTotalPct = totales.llenadora === 0 ? 0 : Math.round((totales.desechados / totales.llenadora) * 10000) / 100

  return (
    <div className="flex flex-col gap-2">
      {contadores.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <div>
            <p className="font-medium text-foreground">{nombrePorCodigo(LINEAS, c.linea)}</p>
            <p className="text-muted-foreground">
              {c.envasesLlenadora} llenadora · {c.envasesBuenos} buenos · {c.envasesDesechados} desechados
            </p>
            {c.requiereJustificacion && c.justificacion && (
              <p className="mt-1 text-xs text-muted-foreground italic">"{c.justificacion}"</p>
            )}
          </div>
          <Badge variant={c.requiereJustificacion ? "destructive" : "secondary"}>{c.mermaPct}%</Badge>
        </div>
      ))}

      {mostrarTotales && contadores.length > 0 && (
        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-foreground">Total del turno</p>
            <p className="text-muted-foreground">
              {totales.llenadora} llenadora · {totales.buenos} buenos · {totales.desechados} desechados
            </p>
          </div>
          <Badge variant={mermaTotalPct > 3 ? "destructive" : "secondary"}>{mermaTotalPct}%</Badge>
        </div>
      )}
    </div>
  )
}
