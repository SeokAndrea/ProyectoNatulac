import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Sabor } from "@/lib/sabores"
import type { CondicionTanque, DatosCambiarTanque, TanqueRecepcion } from "@/lib/turno"

type Resultado = { ok: true } | { ok: false; error: string }

/** Los lotes son 4 dígitos (0001, 0002...) — si escriben solo el número (ej. "3"), se completa con ceros a la izquierda. */
function normalizarLote(valor: string): string {
  const recortado = valor.trim()
  return /^\d+$/.test(recortado) ? recortado.padStart(4, "0") : recortado
}

/**
 * Formulario para cambiar la condición de un tanque — compartido
 * entre Preparación (donde se abre/cierra con un botón "Cambiar
 * estado") y el paso 2 de Comenzar Turno (donde se muestra siempre
 * abierto, para revisar/confirmar los 3 tanques al arrancar el
 * turno). La lógica es la misma en los dos lados: es estado continuo,
 * cambiarlo acá es lo mismo que cambiarlo en Preparación.
 */
export function TanqueEditForm({
  tanque,
  sabores,
  onGuardar,
  onCancelar,
  guardarTexto = "Guardar",
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  onGuardar: (datos: DatosCambiarTanque) => Promise<Resultado>
  onCancelar?: () => void
  guardarTexto?: string
}) {
  const [condicion, setCondicion] = useState<CondicionTanque>(tanque.condicion)
  const [saborId, setSaborId] = useState(tanque.saborId ?? "")
  const [volumenL, setVolumenL] = useState(tanque.volumenL !== null ? String(tanque.volumenL) : "")
  const [lote, setLote] = useState(tanque.lote ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const volumenValido =
    condicion !== "LISTO" ||
    (saborId !== "" && volumenL !== "" && Number(volumenL) > 0 && Number(volumenL) <= 20000 && lote.trim() !== "")

  async function guardar() {
    if (!volumenValido) return
    setGuardando(true)
    setError(null)
    const resultado = await onGuardar({
      numeroTanque: tanque.numeroTanque,
      condicion,
      saborId: condicion === "LISTO" ? saborId : null,
      volumenL: condicion === "LISTO" ? Number(volumenL) : null,
      lote: condicion === "LISTO" ? normalizarLote(lote) : null,
    })
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <Select value={condicion} onValueChange={(v) => setCondicion(v as CondicionTanque)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="LISTO">Listo (liberado)</SelectItem>
          <SelectItem value="EN_PREPARACION">En Preparación (no liberado)</SelectItem>
          <SelectItem value="SUCIO">Sucio</SelectItem>
          <SelectItem value="VACIO">Vacío</SelectItem>
        </SelectContent>
      </Select>

      {condicion === "LISTO" && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={saborId} onValueChange={setSaborId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sabor" />
            </SelectTrigger>
            <SelectContent>
              {sabores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre} ({s.familiaNombre})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            max={20000}
            placeholder="Volumen (L)"
            value={volumenL}
            onChange={(e) => setVolumenL(e.target.value)}
          />
          <Input className="col-span-2" placeholder="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={!volumenValido || guardando} onClick={guardar}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {guardarTexto}
        </Button>
        {onCancelar && (
          <Button size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
