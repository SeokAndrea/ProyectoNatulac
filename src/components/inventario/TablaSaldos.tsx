import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { AreaInventario, FilaInventario, InventarioApi } from "@/lib/inventario"
import { cn } from "@/lib/utils"
import { cantidadConUnidad, fechaHoraCorta, textoDiferencia } from "./calculosInventario"
import { HistorialSabor } from "./HistorialSabor"

/** Saldo de cada sabor: cuánto debería haber, cuándo se contó y cuánto consumieron las preparaciones desde entonces. Un clic abre su historial. */
export function TablaSaldos({
  api,
  usuario,
  area,
  filas,
}: {
  api: InventarioApi
  usuario: string
  area: AreaInventario | null
  filas: FilaInventario[]
}) {
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Sabor</th>
            <th className="px-3 py-2 text-right font-semibold">Debería haber</th>
            <th className="px-3 py-2 font-semibold">Último conteo</th>
            <th className="px-3 py-2 text-right font-semibold">Usado desde entonces</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const esteAbierto = abierto === f.saborId
            return (
              <Fragment key={f.saborId}>
                <tr
                  className={cn("cursor-pointer border-b border-border/60 hover:bg-muted/40", esteAbierto && "bg-muted/30")}
                  onClick={() => setAbierto(esteAbierto ? null : f.saborId)}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {esteAbierto ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                      {f.saborNombre}
                    </span>
                    <span className="pl-5 text-xs text-muted-foreground">{f.unidad}</span>
                  </td>
                  <td className="num px-3 py-2 text-right text-base font-bold">
                    {f.saldo !== null ? f.saldo.toLocaleString("es-CO") : <span className="text-sm font-normal text-muted-foreground">Sin conteo</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.ultimoEn ? (
                      <>
                        <span className="text-foreground">{fechaHoraCorta(f.ultimoEn)}</span>
                        <span className="text-muted-foreground"> · {f.ultimoPor ?? "—"}</span>
                        {f.ultimaDiferencia !== null && f.ultimaDiferencia !== 0 && (
                          <span className="block text-warning">{textoDiferencia(f.ultimaDiferencia, f.unidad)}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="num px-3 py-2 text-right text-xs text-muted-foreground">
                    {f.consumido ? `${cantidadConUnidad(f.consumido, f.unidad)} · ${f.preparaciones} prep.` : "—"}
                  </td>
                </tr>
                {esteAbierto && (
                  <tr className="border-b border-border/60 bg-muted/20">
                    <td colSpan={4} className="px-4 py-2">
                      <HistorialSabor api={api} usuario={usuario} area={area} fila={f} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
