import { useState } from "react"
import { Check, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { registrarInventario, type AreaInventario, type FilaInventario } from "@/lib/inventario"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import {
  BORRADOR_VACIO,
  conteosParaGuardar,
  diferenciaDe,
  errorDeFila,
  esperado,
  textoDiferencia,
  type BorradorFila,
} from "./calculosInventario"

/**
 * Inventario diario (mañana y tarde): por cada sabor, lo que llegó y lo
 * que se contó. "Coincide" pone lo que espera el sistema. Solo se
 * guardan las filas con conteo escrito; las vacías quedan como estaban.
 */
export function FormInventarioDiario({
  usuario,
  area,
  filas,
  onGuardado,
  onCancelar,
}: {
  usuario: string
  area: AreaInventario | null
  filas: FilaInventario[]
  onGuardado: () => void
  onCancelar: () => void
}) {
  const [borradores, setBorradores] = useState<Record<string, BorradorFila>>({})
  const { enviando, error, ejecutar } = useAccion()
  const conteos = conteosParaGuardar(filas, borradores)
  const hayErrores = filas.some((f) => borradores[f.saborId] && errorDeFila(borradores[f.saborId]) !== null)

  function cambiar(saborId: string, campo: keyof BorradorFila, valor: string) {
    setBorradores((b) => ({ ...b, [saborId]: { ...(b[saborId] ?? BORRADOR_VACIO), [campo]: valor } }))
  }

  async function guardar() {
    if (conteos.length === 0 || hayErrores) return
    if (await ejecutar(() => registrarInventario(usuario, conteos, area))) onGuardado()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Sabor</th>
              <th className="px-3 py-2 text-right font-semibold">Sistema dice</th>
              <th className="px-3 py-2 font-semibold">Llegó</th>
              <th className="px-3 py-2 font-semibold">Contado</th>
              <th className="px-3 py-2 font-semibold">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const b = borradores[f.saborId] ?? BORRADOR_VACIO
              const esp = esperado(f, b)
              const dif = diferenciaDe(f, b)
              const err = errorDeFila(b)
              return (
                <tr key={f.saborId} className="border-b border-border/60 last:border-b-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-foreground">{f.saborNombre}</span>
                    <span className="block text-xs text-muted-foreground">{f.unidad}</span>
                  </td>
                  <td className="num px-3 py-2 text-right">
                    {f.saldo !== null ? f.saldo.toLocaleString("es-CO") : <span className="text-xs text-muted-foreground">Primer conteo</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="h-8 w-20"
                      placeholder="0"
                      aria-label={`Llegó de ${f.saborNombre}`}
                      value={b.llego}
                      onChange={(e) => cambiar(f.saborId, "llego", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className="h-8 w-20"
                        aria-label={`Contado de ${f.saborNombre}`}
                        value={b.contado}
                        onChange={(e) => cambiar(f.saborId, "contado", e.target.value)}
                      />
                      {esp !== null && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          aria-label={`Coincide ${f.saborNombre}`}
                          onClick={() => cambiar(f.saborId, "contado", String(esp))}
                        >
                          <Check className="size-3.5" />
                          Coincide
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {err ? (
                      <span className="text-destructive">{err}</span>
                    ) : dif !== null ? (
                      <span className={cn("font-medium", dif === 0 ? "text-success" : "text-warning")}>{textoDiferencia(dif, f.unidad)}</span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <MensajeError error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={guardar} disabled={conteos.length === 0 || hayErrores || enviando}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar inventario ({conteos.length})
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <span className="text-xs text-muted-foreground">Solo se guardan los sabores con conteo escrito.</span>
      </div>
    </div>
  )
}
