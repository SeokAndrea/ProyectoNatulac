import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { guardarPuesto, NIVELES, type Nivel, type PuestoEstructura } from "@/lib/estructura"
import { useAccion } from "@/lib/useAccion"
import { Campo, PanelLateral } from "./PanelLateral"

/**
 * Puesto nuevo (puesto null) o existente: nombre, nivel y activo. El área no se cambia:
 * al editar se manda tal cual la devolvió la base (la base la compara sin normalizar).
 */
export function FormPuesto({
  puesto,
  areaCodigo,
  nombreArea,
  usuario,
  pagina,
  onCerrar,
  onGuardado,
}: {
  puesto: PuestoEstructura | null
  areaCodigo: string
  nombreArea: string
  usuario: string
  pagina: string
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(puesto?.nombre ?? "")
  const [nivel, setNivel] = useState<string>(puesto?.nivel ? String(puesto.nivel) : "")
  const [activo, setActivo] = useState(puesto?.activo ?? true)
  const { enviando, error, setError, ejecutar } = useAccion()

  async function guardar() {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) return setError("Escribe el nombre del puesto.")
    if (!nivel) return setError("Elige el nivel.")
    const ok = await ejecutar(() =>
      guardarPuesto(
        usuario,
        { id: puesto?.id ?? null, areaCodigo: puesto ? puesto.areaCodigo : areaCodigo, nombre: nombreLimpio, nivel: Number(nivel) as Nivel, activo },
        pagina,
      ),
    )
    if (ok) onGuardado()
  }

  return (
    <PanelLateral etiqueta={puesto ? `Editar puesto · ${nombreArea}` : `Nuevo puesto · ${nombreArea}`} titulo={puesto ? puesto.nombre : "Nuevo puesto"} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4 px-5 py-4">
        <Campo etiqueta="Nombre" id="fp-nombre">
          <Input id="fp-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11 text-base" />
        </Campo>
        <Campo etiqueta="Nivel" id="fp-nivel">
          <Select value={nivel} onValueChange={setNivel}>
            <SelectTrigger id="fp-nivel" aria-label="Nivel" className="h-11 w-full text-base">
              <SelectValue placeholder="Elige el nivel" />
            </SelectTrigger>
            <SelectContent>
              {NIVELES.map((n) => (
                <SelectItem key={n.nivel} value={String(n.nivel)}>
                  {n.nivel} · {n.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-foreground">Cada puesto solo gestiona a los de un nivel más bajo en su misma área.</p>
        </Campo>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground">
          <Checkbox aria-label="Activo" checked={activo} onCheckedChange={(v) => setActivo(v === true)} />
          Activo
        </label>
        {puesto && puesto.personas > 0 && (
          <p className="text-sm text-foreground">
            Tiene {puesto.personas} {puesto.personas === 1 ? "persona" : "personas"}: no se puede borrar, solo desactivar.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button className="h-11 flex-1" onClick={guardar} disabled={enviando}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
          <Button variant="outline" className="h-11" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </div>
    </PanelLateral>
  )
}
