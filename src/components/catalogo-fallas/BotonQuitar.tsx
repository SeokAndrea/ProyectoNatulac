import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MensajeError } from "@/components/MensajeError"
import { quitarCatalogo, sePuedeQuitar, usoCatalogo, type NivelQuitable, type UsoCatalogo } from "@/lib/catalogoFallas/api"
import { useAccion } from "@/lib/useAccion"

const QUE: Record<NivelQuitable, string> = { EQUIPO: "el equipo", SISTEMA: "el sistema", SUBSISTEMA: "el subsistema", FALLA: "la falla" }

/** Qué se va a quitar, en una frase, para la segunda confirmación. */
export function textoDeQuitar(nivel: NivelQuitable, uso: Pick<UsoCatalogo, "nombre" | "fallas">): string {
  const fallas = nivel === "FALLA" ? "" : uso.fallas === 0 ? " (no tiene fallas)" : ` y sus ${uso.fallas} ${uso.fallas === 1 ? "falla" : "fallas"}`
  return `Se quita ${QUE[nivel]} «${uso.nombre}»${fallas}. Nunca se usó. No se puede deshacer; queda en la auditoría.`
}

/**
 * «Quitar» de verdad (migración 20261114890000), solo para lo que nunca se usó:
 * 0 paradas y 0 solicitudes de intervención, contando las fallas que cuelgan de
 * él. Si ya se usó, se dice y solo queda Desactivar. Pide una segunda
 * confirmación con lo que se va. Sin la migración no hay respuesta y no se muestra.
 */
export function BotonQuitar({ nivel, id, usuario, onQuitado }: { nivel: NivelQuitable; id: string; usuario: string; onQuitado: () => void | Promise<void> }) {
  const [uso, setUso] = useState<UsoCatalogo | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const { enviando, error, ejecutar } = useAccion()

  useEffect(() => {
    let vigente = true
    void usoCatalogo(nivel, id).then((r) => {
      if (vigente && r.ok) setUso(r.valor)
    })
    return () => {
      vigente = false
    }
  }, [nivel, id])

  if (!uso || uso.reservada) return null

  if (!sePuedeQuitar(uso)) {
    return (
      <p className="text-xs text-muted-foreground">
        Ya se usó ({uso.paradas} {uso.paradas === 1 ? "parada" : "paradas"}
        {uso.sif > 0 ? `, ${uso.sif} ${uso.sif === 1 ? "solicitud" : "solicitudes"} de intervención` : ""}): no se puede quitar, solo desactivar.
      </p>
    )
  }

  async function quitar() {
    if (await ejecutar(() => quitarCatalogo(usuario, nivel, id))) await onQuitado()
  }

  if (!confirmando) {
    return (
      <div>
        <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => setConfirmando(true)}>
          <Trash2 /> Quitar
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-danger-soft px-3 py-2">
      <p className="text-sm text-danger-foreground">{textoDeQuitar(nivel, uso)}</p>
      <div className="flex gap-2">
        <Button type="button" variant="destructive" size="sm" disabled={enviando} onClick={() => void quitar()}>
          Sí, quitar
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={enviando} onClick={() => setConfirmando(false)}>
          No
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
