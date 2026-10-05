import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import type { AreaInventario, FilaInventario, InventarioApi, MovimientoInventario } from "@/lib/inventario"
import { cn } from "@/lib/utils"
import { cantidadConUnidad, fechaHoraCorta, textoDiferencia } from "./calculosInventario"

/** Últimos 7 días de un sabor: conteos (con su diferencia) y cada preparación que descontó. */
export function HistorialSabor({
  api,
  usuario,
  area,
  fila,
}: {
  api: InventarioApi
  usuario: string
  area: AreaInventario | null
  fila: FilaInventario
}) {
  const [movimientos, setMovimientos] = useState<MovimientoInventario[] | null>(null)

  useEffect(() => {
    let vivo = true
    api.historial(usuario, fila.saborId, area).then((m) => {
      if (vivo) setMovimientos(m)
    })
    return () => {
      vivo = false
    }
  }, [api, usuario, fila.saborId, area])

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
          {m.tipo === "CONSUMO" ? (
            <span className="flex-1 text-foreground">
              Preparación: −{cantidadConUnidad(m.cantidad, fila.unidad)}
              {m.detalle ? <span className="text-muted-foreground"> · {m.detalle}</span> : null}
            </span>
          ) : (
            <span className="flex-1 font-medium text-foreground">
              Conteo: {cantidadConUnidad(m.cantidad, fila.unidad)}
              {m.llego ? <span className="font-normal text-muted-foreground"> · llegaron {m.llego}</span> : null}
              {m.diferencia !== null && (
                <span className={cn("font-normal", m.diferencia === 0 ? "text-success" : "text-warning")}> · {textoDiferencia(m.diferencia, fila.unidad)}</span>
              )}
              {m.sistema === null && <span className="font-normal text-muted-foreground"> · conteo inicial</span>}
            </span>
          )}
          <span className="text-muted-foreground">{m.usuarioNombre ?? "—"}</span>
        </li>
      ))}
    </ul>
  )
}
