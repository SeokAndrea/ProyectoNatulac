import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { guardarArea, type AreaEstructura } from "@/lib/estructura"
import { useAccion } from "@/lib/useAccion"
import { Campo, PanelLateral } from "./PanelLateral"

/** «Cámara Fría» → CAMARA_FRIA. La base solo admite letras sin tilde, números y guion bajo. */
export function codigoDeArea(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/** Área nueva (area null) o existente: nombre, tipo y activa. El código no se cambia. */
export function FormArea({
  area,
  usuario,
  pagina,
  onCerrar,
  onGuardada,
}: {
  area: AreaEstructura | null
  usuario: string
  pagina: string
  onCerrar: () => void
  onGuardada: (codigo: string) => void
}) {
  const [nombre, setNombre] = useState(area?.nombre ?? "")
  const [tipo, setTipo] = useState<"PRODUCCION" | "APOYO" | "">(area?.tipo ?? "")
  const [activo, setActivo] = useState(area?.activo ?? true)
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false)
  const { enviando, error, setError, ejecutar } = useAccion()
  // Desactivar un área que tiene gente: se avisa antes (las personas siguen en ella).
  const personas = area?.personas ?? 0
  const desactivaConGente = !!area && area.activo && !activo && personas > 0

  async function guardar() {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) return setError("Escribe el nombre del área.")
    if (!tipo) return setError("Elige el tipo del área.")
    const codigo = area?.codigo ?? codigoDeArea(nombreLimpio)
    if (!codigo) return setError("El nombre debe tener letras o números.")
    if (desactivaConGente && !confirmarDesactivar) {
      setConfirmarDesactivar(true)
      return
    }
    const ok = await ejecutar(() => guardarArea(usuario, { codigo, nombre: nombreLimpio, tipo, activo }, pagina))
    if (ok) onGuardada(codigo)
  }

  return (
    <PanelLateral etiqueta={area ? "Editar área" : "Nueva área"} titulo={area ? area.nombre : "Nueva área"} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4 px-5 py-4">
        <Campo etiqueta="Nombre" id="fa-nombre">
          <Input id="fa-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11 text-base" />
        </Campo>
        <Campo etiqueta="Tipo" id="fa-tipo">
          <Select value={tipo} onValueChange={(v) => setTipo(v as "PRODUCCION" | "APOYO")}>
            <SelectTrigger id="fa-tipo" aria-label="Tipo" className="h-11 w-full text-base">
              <SelectValue placeholder="Elige el tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRODUCCION">Producción</SelectItem>
              <SelectItem value="APOYO">Apoyo</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-foreground">Un área de apoyo no cuenta como producción: no abre turnos ni carga líneas.</p>
        </Campo>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground">
          <Checkbox aria-label="Activa" checked={activo} onCheckedChange={(v) => { setActivo(v === true); setConfirmarDesactivar(false) }} />
          Activa
        </label>
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {confirmarDesactivar && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
            Esta área tiene {personas} {personas === 1 ? "persona" : "personas"}. Siguen en ella aunque la desactives. ¿Desactivarla igual?
          </p>
        )}
        <div className="flex gap-2">
          <Button className="h-11 flex-1" variant={confirmarDesactivar ? "destructive" : "default"} onClick={guardar} disabled={enviando}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            {confirmarDesactivar ? "Sí, desactivar" : "Guardar"}
          </Button>
          <Button variant="outline" className="h-11" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </div>
    </PanelLateral>
  )
}
