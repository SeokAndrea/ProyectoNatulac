import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MensajeError } from "@/components/MensajeError"
import { useAccion } from "@/lib/useAccion"

/**
 * Observación del mes de una presentación o producto. La escriben el jefe o
 * la analista. No muestra autor ni fecha (dueña, 2026-10-14); la auditoría
 * los guarda igual.
 */
export function Observacion({
  texto,
  nombreMes,
  placeholder,
  puedeEditar,
  onGuardar,
}: {
  texto: string | undefined
  nombreMes: string
  placeholder: string
  puedeEditar: boolean
  onGuardar: (texto: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState("")
  const { enviando, error, ejecutar } = useAccion()

  async function guardar() {
    if (await ejecutar(() => onGuardar(borrador))) setEditando(false)
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg bg-card p-2">
        <Textarea value={borrador} onChange={(e) => setBorrador(e.target.value)} maxLength={400} placeholder={placeholder} className="min-h-16 text-sm" autoFocus />
        <MensajeError error={error} />
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setEditando(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={enviando} className="bg-[var(--c)] text-[var(--c-cab)] hover:opacity-90">
            Guardar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-14 flex-1 flex-col gap-1.5 rounded-lg bg-card p-2">
      {texto ? <p className="flex-1 whitespace-pre-wrap text-sm">{texto}</p> : <p className="flex-1 text-xs italic text-foreground">Sin observaciones para {nombreMes}.</p>}
      {puedeEditar && (
        <Button
          size="sm"
          variant="outline"
          className="self-end"
          onClick={() => {
            setBorrador(texto ?? "")
            setEditando(true)
          }}
        >
          {texto ? "Editar" : "Escribir"}
        </Button>
      )}
    </div>
  )
}
