import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Resultado = { ok: true } | { ok: false; error: string }

/**
 * Tope del CHECK `recepcion_tanques_volumen_l_check` (migración 20261008).
 * Se valida acá para dar un mensaje claro en vez del error crudo de la base.
 */
const MAX_L = 30000

/**
 * Campo compartido de "Medir tanque" — el supervisor tipea los litros
 * reales y se llama a `medir_tanque` (relectura física: corrige
 * `volumen_l` del lote y del tanque, deja el delta en
 * `preparaciones_ajuste`, NO toca `volumen_inicial_l`; si mide 0 y
 * ninguna corrida activa usa el lote, lo cierra).
 *
 * Lo usan el botón "Medir tanque" de Preparación (EstadoPlantaTabs) y el
 * prompt post-cierre de Producto Terminado. La acción real la pasa el
 * llamador en `onMedir` (normalmente `medirTanque` de usePreparacion).
 */
export function MedirTanqueInline({
  numeroTanque,
  volumenActual,
  onMedir,
  onListo,
  onCancelar,
  guardarTexto = "Guardar medición",
  descripcion,
  notaCero = "Si ninguna línea está usando el tanque, el lote se cierra y el tanque queda Sucio.",
}: {
  numeroTanque: number
  /** Lo que el sistema cree que tiene ahora — prefill y referencia. */
  volumenActual: number | null
  onMedir: (litros: number) => Promise<Resultado>
  /** Se llama cuando la medición se guardó bien. */
  onListo?: () => void
  onCancelar?: () => void
  guardarTexto?: string
  /** Texto de arriba. Por defecto: "Litros reales… no mueve el punto de partida de la merma". */
  descripcion?: string
  /** Aviso cuando el valor es 0. `null` = no mostrar ninguno. */
  notaCero?: string | null
}) {
  const [valor, setValor] = useState(volumenActual != null ? String(volumenActual) : "")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(valor)
  const valido = valor.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= MAX_L
  const esCero = valido && n === 0

  async function guardar() {
    if (!valido || enviando) return
    setEnviando(true)
    setError(null)
    const r = await onMedir(n)
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    onListo?.()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-foreground">
        {descripcion ??
          `Litros reales en el Tanque ${numeroTanque}. Corrige el volumen del lote — no mueve el punto de partida de la merma.`}
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={MAX_L}
          className="h-8 w-28"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">L</span>
      </div>
      {esCero && notaCero && <p className="text-[11px] text-warning">{notaCero}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!valido || enviando} onClick={guardar}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {guardarTexto}
        </Button>
        {onCancelar && (
          <Button size="sm" variant="ghost" disabled={enviando} onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
