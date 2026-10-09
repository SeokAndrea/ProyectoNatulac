import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { PERMISOS, type Permiso } from "@/lib/permisos"
import { guardarPermisosExtra, type PersonalRegistrado } from "@/lib/personal"

/** Fila desplegable para dar o quitar permisos extra a una persona (además de los de su rol). */
export function EditorPermisosExtra({
  persona,
  usuarioSesion,
  pagina,
  extras,
  permisosRol,
  onCerrar,
  onGuardado,
}: {
  persona: PersonalRegistrado
  usuarioSesion: string
  pagina: string
  extras: Permiso[]
  permisosRol: Permiso[]
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [seleccion, setSeleccion] = useState<Set<Permiso>>(() => new Set(extras))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disponibles = PERMISOS.filter((p) => !permisosRol.includes(p.codigo))

  function alternar(p: Permiso, marcado: boolean) {
    setSeleccion((prev) => {
      const nuevo = new Set(prev)
      if (marcado) nuevo.add(p)
      else nuevo.delete(p)
      return nuevo
    })
  }

  async function guardar() {
    setEnviando(true)
    setError(null)
    const r = await guardarPermisosExtra(usuarioSesion, persona.id, [...seleccion], pagina)
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    onGuardado()
  }

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td colSpan={7} className="py-2">
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2.5">
          <span className="text-xs text-muted-foreground">
            Permisos extra para <span className="font-medium text-foreground">{persona.nombre}</span>, además de los de su
            rol:
          </span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {disponibles.map((p) => (
              <label key={p.codigo} className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={seleccion.has(p.codigo)} onCheckedChange={(v) => alternar(p.codigo, v === true)} disabled={enviando} />
                {p.nombre}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={guardar} disabled={enviando}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </td>
    </tr>
  )
}
