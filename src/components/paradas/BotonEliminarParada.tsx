import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MensajeError } from "@/components/MensajeError"
import { duracionMin, eliminarParada, fmtDuracion, nombreLineaParada, type Parada } from "@/lib/paradas"
import { useAccion } from "@/lib/useAccion"

/** '2026-11-02T14:05:00' → '02/11 14:05'. */
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`

/** Lo que se pierde al eliminar, en una frase, para la segunda confirmación. */
export function textoDeEliminar(p: Pick<Parada, "lineaCodigo" | "tipoNombre" | "inicio" | "fin">, minutos: number): string {
  const hasta = p.fin ? corta(p.fin) : "en curso"
  return `Se elimina la parada «${p.tipoNombre}» de la ${nombreLineaParada(p.lineaCodigo)} (${corta(p.inicio)} → ${hasta}, ${fmtDuracion(minutos)}). No se puede deshacer; queda en la auditoría.`
}

/**
 * «Eliminar parada» con segunda confirmación. Solo para quien tiene el permiso
 * PARADAS_ELIMINAR (la dueña, o a quien se lo des en Personal); el servidor lo
 * vuelve a exigir y no deja borrar la que tiene detenida una línea ahora mismo
 * ni una de una jornada ya validada.
 */
export function BotonEliminarParada({ parada, usuario, pagina, onEliminada }: { parada: Parada; usuario: string; pagina: string; onEliminada: () => void }) {
  const [confirmando, setConfirmando] = useState(false)
  const { enviando, error, ejecutar } = useAccion()

  async function eliminar() {
    if (await ejecutar(() => eliminarParada(usuario, parada.id, pagina))) onEliminada()
  }

  if (!confirmando) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmando(true)}>
        <Trash2 /> Eliminar parada
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-danger-soft px-3 py-2">
      <p className="text-sm text-danger-foreground">{textoDeEliminar(parada, duracionMin(parada, new Date()))}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={enviando} onClick={() => void eliminar()}>
          Sí, eliminar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={enviando} onClick={() => setConfirmando(false)}>
          No
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
