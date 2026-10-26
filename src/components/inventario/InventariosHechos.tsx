import { CheckCircle2, Circle } from "lucide-react"
import type { InventarioHecho, Momento } from "@/lib/inventario"
import { fechaPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"
import { NOMBRE_MOMENTO } from "./calculosInventario"

/** Hoy: si ya se hizo el inventario de la mañana y el de la tarde, a qué hora y quién. */
export function InventariosHechos({ inventarios }: { inventarios: InventarioHecho[] }) {
  const hoy = fechaPlanta()
  const deHoy = (m: Momento) => inventarios.find((i) => i.momento === m && fechaPlanta(new Date(i.en)) === hoy) ?? null

  return (
    <div className="flex flex-wrap gap-2">
      {(["MANANA", "TARDE"] as const).map((m) => {
        const inv = deHoy(m)
        return (
          <div
            key={m}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
              inv ? "border-success/40 bg-success-soft text-success-foreground" : "border-border text-muted-foreground",
            )}
          >
            {inv ? <CheckCircle2 className="size-3.5 shrink-0" /> : <Circle className="size-3.5 shrink-0" />}
            <span>
              Hoy, inventario de la {NOMBRE_MOMENTO[m]}:{" "}
              {inv ? (
                <>
                  <span className="font-semibold">{horaCortaPlanta(inv.en, inv.en)}</span> · {inv.usuarioNombre ?? "—"}
                  {inv.faltantes > 0 ? ` · ${inv.faltantes} con faltante` : ""}
                </>
              ) : (
                "pendiente"
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
