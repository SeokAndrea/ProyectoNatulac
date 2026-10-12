import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { LataPixel } from "@/components/pixel/LataPixel"
import type { Resultado, TanqueRecepcion } from "@/lib/preparacion/tipos"
import { useAccion } from "@/lib/useAccion"

const litros = (n: number) => n.toLocaleString("es-CO")

/**
 * "Entregar a Vacío" (lote de Vacío) o "Salida a Vacío" (parte de un lote
 * de Aséptico): Vacío se lleva litros del tanque, por partes. Si se lleva
 * todo, el lote se cierra y el tanque queda Con Restos 0 L.
 */
export function FormEntregarVacio({
  tanque,
  onEntregar,
  onListo,
  onCancelar,
}: {
  tanque: TanqueRecepcion
  /** litros null = se lleva todo. */
  onEntregar: (litros: number | null) => Promise<Resultado>
  onListo: () => void
  onCancelar: () => void
}) {
  const hay = tanque.volumenL ?? 0
  const [valor, setValor] = useState("")
  const { enviando, error, ejecutar } = useAccion()

  const n = Number(valor)
  const valido = valor.trim() !== "" && Number.isFinite(n) && n > 0 && n <= hay
  const todo = valido && n === hay

  async function entregar() {
    if (!valido) return
    if (await ejecutar(() => onEntregar(todo ? null : n))) onListo()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-vacio/50 p-3">
      <p className="text-xs font-semibold text-vacio">
        {tanque.paraVacio ? "Entregar a Vacío" : "Salida a Vacío"} · Tanque {tanque.numeroTanque}
      </p>
      {!tanque.paraVacio && (
        <p className="text-xs text-muted-foreground">
          Vacío se lleva una parte de este lote de Aséptico. Se registra como un desvase: no es merma.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={hay}
          placeholder="Litros"
          className="h-8 w-28"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">L</span>
        <Button size="sm" variant="outline" type="button" onClick={() => setValor(String(hay))}>
          Se lleva todo ({litros(hay)} L)
        </Button>
      </div>
      {valor.trim() !== "" && n > hay && (
        <p className="text-xs text-destructive" role="alert">
          El tanque tiene {litros(hay)} L. Si tiene más, primero Medir tanque.
        </p>
      )}
      {valido && (
        <p className="text-xs text-muted-foreground">
          {todo ? "Se lleva todo: el tanque queda Con Restos 0 L." : `Quedan ${litros(hay - n)} L en el tanque.`}
        </p>
      )}
      <MensajeError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!valido || enviando} onClick={entregar}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <LataPixel saborNombre={tanque.saborNombre} />}
          {tanque.paraVacio ? "Entregar" : "Registrar salida"}
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
