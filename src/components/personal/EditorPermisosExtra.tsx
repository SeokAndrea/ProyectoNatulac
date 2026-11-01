import { Checkbox } from "@/components/ui/checkbox"
import { PERMISOS, type Permiso } from "@/lib/permisos"

/**
 * Casillas de permisos extra de una persona (además de los de su puesto).
 * Solo se ofrecen los permisos que tiene quien edita; lo que ya trae la
 * persona y quien edita no tiene se ve marcado y bloqueado.
 */
export function EditorPermisosExtra({
  ofrecibles,
  seleccion,
  bloqueados = [],
  deshabilitado,
  onCambiar,
}: {
  ofrecibles: Permiso[]
  seleccion: Set<Permiso>
  bloqueados?: Permiso[]
  deshabilitado?: boolean
  onCambiar: (permiso: Permiso, marcado: boolean) => void
}) {
  const visibles = PERMISOS.filter((p) => ofrecibles.includes(p.codigo) || bloqueados.includes(p.codigo))
  if (visibles.length === 0) return <p className="text-sm text-foreground">No hay permisos extra que puedas dar.</p>
  return (
    <div role="group" aria-label="Permisos extra" className="grid gap-2 sm:grid-cols-2">
      {visibles.map((p) => {
        const bloqueado = deshabilitado || (!ofrecibles.includes(p.codigo) && bloqueados.includes(p.codigo))
        return (
          <label key={p.codigo} className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              aria-label={p.nombre}
              checked={seleccion.has(p.codigo)}
              disabled={bloqueado}
              onCheckedChange={(v) => onCambiar(p.codigo, v === true)}
              className="mt-0.5"
            />
            {p.nombre}
          </label>
        )
      })}
    </div>
  )
}
