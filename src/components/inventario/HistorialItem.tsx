import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import type { AreaInventario, InventarioApi, ItemInventario, MovimientoInventario } from "@/lib/inventario"
import { cn } from "@/lib/utils"
import { cantidadConUnidad, fechaHoraCorta, NOMBRE_MOMENTO, textoDiferencia } from "./calculosInventario"

/** Últimos 7 días de un item: sus conteos y (pulpa) cada preparación que descontó. */
export function HistorialItem({
  api,
  usuario,
  area,
  item,
}: {
  api: InventarioApi
  usuario: string
  area: AreaInventario | null
  item: ItemInventario
}) {
  const [movimientos, setMovimientos] = useState<MovimientoInventario[] | null>(null)

  useEffect(() => {
    let vivo = true
    api.historial(usuario, item, area).then((m) => {
      if (vivo) setMovimientos(m)
    })
    return () => {
      vivo = false
    }
  }, [api, usuario, item, area])

  if (movimientos === null) {
    return (
      <div className="flex justify-center py-3 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }
  if (movimientos.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">Sin movimientos en los últimos 7 días.</p>
  }
  return (
    <ul className="flex flex-col divide-y divide-border/60 text-xs">
      {movimientos.map((m, i) => (
        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
          <span className="text-muted-foreground">{fechaHoraCorta(m.en)}</span>
          {m.movimiento === "CONSUMO" ? (
            <span className="flex-1 text-foreground">
              Preparación: −{cantidadConUnidad(m.cantidad, item.unidad)}
              {m.detalle ? <span className="text-muted-foreground"> · {m.detalle}</span> : null}
            </span>
          ) : (
            <span className="flex-1 font-medium text-foreground">
              Inventario de la {m.momento ? NOMBRE_MOMENTO[m.momento] : "—"}: {cantidadConUnidad(m.cantidad, item.unidad)}
              {m.diferencia !== null && (
                <span className={cn("font-normal", m.diferencia === 0 ? "text-success" : "text-warning")}> · {textoDiferencia(m.diferencia, item.unidad)}</span>
              )}
            </span>
          )}
          <span className="text-muted-foreground">{m.usuarioNombre ?? "—"}</span>
        </li>
      ))}
    </ul>
  )
}
