import { useContext, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MensajeError } from "@/components/MensajeError"
import { useAccion } from "@/lib/useAccion"
import { useTextoAjustado } from "@/components/indicadores/useTextoAjustado"
import { Presentando } from "@/components/indicadores/usePresentacion"

/**
 * Observación del mes de una presentación o producto. La escriben el jefe o
 * la analista. No muestra autor ni fecha (dueña, 2026-10-14); la auditoría
 * los guarda igual. Sin texto no se muestra (ni su título), salvo el botón
 * «Escribir» para quien puede editar; al presentar, nunca hay botones
 * (dueña, 2026-10-15).
 */
export function Observacion({
  texto,
  placeholder,
  puedeEditar,
  onGuardar,
  titulo,
}: {
  texto: string | undefined
  placeholder: string
  puedeEditar: boolean
  onGuardar: (texto: string) => Promise<{ ok: true } | { ok: false; error: string }>
  /** El título «OBSERVACIONES»: se esconde junto con la observación vacía. */
  titulo?: ReactNode
}) {
  const presentando = useContext(Presentando)
  const editable = puedeEditar && !presentando
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState("")
  const { enviando, error, ejecutar } = useAccion()
  const ajuste = useTextoAjustado(texto)

  async function guardar() {
    if (await ejecutar(() => onGuardar(borrador))) setEditando(false)
  }

  if (!texto && !editable) return null

  if (editando) {
    return (
      <>
        {titulo}
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
      </>
    )
  }

  const botonEditar = editable && (
    <Button
      size="sm"
      variant="outline"
      className="self-end"
      onClick={() => {
        setBorrador(texto ?? "")
        setEditando(true)
      }}
    >
      {texto ? "Editar" : "Escribir observación"}
    </Button>
  )

  if (!texto) return botonEditar

  return (
    <>
      {titulo}
      {/* Ocupa lo que necesite (lo demás de la tarjeta se achica) y la letra se ajusta para que entre entera (useTextoAjustado). */}
      <div className="flex min-h-14 flex-[1_0_auto] flex-col gap-1.5 rounded-lg bg-card p-2">
        <p ref={ajuste.ref} className="flex-1 leading-snug whitespace-pre-wrap" style={{ fontSize: ajuste.tamano }}>
          {texto}
        </p>
        {botonEditar}
      </div>
    </>
  )
}
