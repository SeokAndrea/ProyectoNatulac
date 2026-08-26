import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TanqueEditForm } from "@/components/TanqueEditForm"
import type { Sabor } from "@/lib/sabores"
import type { DatosCambiarTanque, TanqueRecepcion } from "@/lib/turno"

type Resultado = { ok: true } | { ok: false; error: string }

const TEXTO: Record<"INICIO" | "FIN", { aviso: string; guardarTexto: string }> = {
  INICIO: { aviso: "así quedó del turno anterior — confirma o edita.", guardarTexto: "Guardar estado" },
  FIN: { aviso: "confirma el estado final antes de cerrar el turno.", guardarTexto: "Guardar estado final" },
}

/**
 * Paso de revisión de INICIO/FIN por tanque — ver
 * supabase/migrations/20260924090000_confirmacion_estado_tanques.sql.
 * No renderiza nada si ese tanque ya está confirmado para ese momento
 * del turno (compartido entre Preparación y Finalizar Turno).
 */
export function ConfirmarEstadoTanque({
  tanque,
  sabores,
  momento,
  onConfirmar,
  onGuardarEdicion,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  momento: "INICIO" | "FIN"
  onConfirmar: () => Promise<Resultado>
  onGuardarEdicion: (datos: DatosCambiarTanque) => Promise<Resultado>
}) {
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const yaConfirmado = momento === "INICIO" ? tanque.confirmadoInicioEn : tanque.confirmadoFinEn
  if (yaConfirmado) return null

  const { aviso, guardarTexto } = TEXTO[momento]

  async function confirmar() {
    setConfirmando(true)
    setError(null)
    const resultado = await onConfirmar()
    setConfirmando(false)
    if (!resultado.ok) setError(resultado.error)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
      <p className="text-sm text-foreground">
        Tanque {tanque.numeroTanque}: {aviso}
      </p>

      {editando ? (
        <TanqueEditForm
          tanque={tanque}
          sabores={sabores}
          guardarTexto={guardarTexto}
          onGuardar={onGuardarEdicion}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={confirmando} onClick={confirmar}>
            {confirmando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Confirmar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
            Editar
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
