import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fallasDeNivel } from "@/lib/catalogoFallas/tabla"
import type { CatalogoFallas, NivelCatalogo } from "@/lib/catalogoFallas/tipos"
import { EditorNivel, type ItemNivel } from "./EditorNivel"

export interface NivelAEditar {
  nivel: NivelCatalogo
  id: string
}

const TITULO: Record<NivelCatalogo, string> = { EQUIPO: "Editar equipo", SISTEMA: "Editar sistema", SUBSISTEMA: "Editar subsistema" }

/** Hermanos (para que el sufijo no se repita) y datos del nivel que se edita. */
function datosNivel(c: CatalogoFallas, n: NivelAEditar): { item: ItemNivel; hermanos: { id: string; sufijo: string }[] } | null {
  if (n.nivel === "EQUIPO") {
    const item = c.equipos.find((e) => e.id === n.id)
    return item ? { item, hermanos: c.equipos } : null
  }
  if (n.nivel === "SISTEMA") {
    const item = c.sistemas.find((s) => s.id === n.id)
    return item ? { item, hermanos: c.sistemas.filter((s) => s.equipoId === item.equipoId) } : null
  }
  const item = c.subsistemas.find((u) => u.id === n.id)
  return item ? { item, hermanos: c.subsistemas.filter((u) => u.sistemaId === item.sistemaId) } : null
}

/** Editar el nombre y el sufijo de un equipo, sistema o subsistema, en un diálogo. */
export function DialogoNivel({
  catalogo,
  editar,
  usuario,
  onCerrar,
  onGuardado,
}: {
  catalogo: CatalogoFallas
  editar: NivelAEditar | null
  usuario: string
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const datos = editar ? datosNivel(catalogo, editar) : null
  return (
    <Dialog open={!!datos} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        {editar && datos && (
          <>
            <DialogHeader>
              <DialogTitle>{TITULO[editar.nivel]}</DialogTitle>
              <DialogDescription>El sufijo cambia el código de todas sus fallas, también en las paradas ya registradas.</DialogDescription>
            </DialogHeader>
            <EditorNivel
              key={editar.id}
              nivel={editar.nivel}
              item={datos.item}
              ocupados={datos.hermanos.filter((h) => h.id !== editar.id).map((h) => h.sufijo)}
              fallasAfectadas={fallasDeNivel(catalogo, editar.nivel, editar.id)}
              usuario={usuario}
              onListo={async (guardado) => {
                if (guardado) await onGuardado()
                onCerrar()
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
