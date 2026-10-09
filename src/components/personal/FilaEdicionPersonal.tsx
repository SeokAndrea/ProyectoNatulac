import { useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cargoValeEnArea, rolPermitidoEnArea, type AreaCodigo, type CargoCodigo, type RolCodigo } from "@/lib/catalogos"
import { editarPersonal, type PersonalRegistrado } from "@/lib/personal"
import { SelectArea, SelectAreaOrigen, SelectCargo, SelectRol, type AreaOpcion, type RolOpcion } from "./SelectoresPuesto"

/** Fila de la tabla en modo edición. Cancelar la desmonta: los campos vuelven solos a lo guardado. */
export function FilaEdicionPersonal({
  persona,
  usuarioSesion,
  pagina,
  areasDisponibles,
  rolesDisponibles,
  onCancelar,
  onGuardado,
}: {
  persona: PersonalRegistrado
  usuarioSesion: string
  pagina: string
  areasDisponibles: readonly AreaOpcion[]
  rolesDisponibles: readonly RolOpcion[]
  onCancelar: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(persona.nombre)
  const [cedula, setCedula] = useState(persona.cedula ?? "")
  const [area, setArea] = useState<AreaCodigo | "">(persona.area ?? "")
  const [areaOrigen, setAreaOrigen] = useState<AreaCodigo | "">(persona.areaOrigen ?? "")
  const [rol, setRol] = useState<RolCodigo>(persona.rol)
  const [cargo, setCargo] = useState<CargoCodigo | "">(persona.cargo ?? "")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Solo los roles que van en el área elegida (el área Calidad solo lleva roles de Calidad).
  const rolesDelArea = rolesDisponibles.filter((r) => rolPermitidoEnArea(r.codigo, area))

  function cambiarArea(nueva: AreaCodigo) {
    setArea(nueva)
    if (!rolPermitidoEnArea(rol, nueva)) {
      const primero = rolesDisponibles.find((r) => rolPermitidoEnArea(r.codigo, nueva))
      if (primero) setRol(primero.codigo as RolCodigo)
    }
    if (!cargoValeEnArea(cargo, nueva)) setCargo("")
  }

  async function guardar() {
    if (!nombre.trim() || area === "") return
    setEnviando(true)
    setError(null)
    const resultado = await editarPersonal(
      usuarioSesion,
      {
        id: persona.id,
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        area,
        areaOrigen: areaOrigen === "" ? null : areaOrigen,
        rol,
        cargo: cargo === "" ? null : cargo,
      },
      pagina,
    )
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onGuardado()
  }

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-1.5 pr-3">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-7" />
      </td>
      <td className="py-1.5 pr-3 text-muted-foreground">@{persona.usuario}</td>
      <td className="py-1.5 pr-3">
        <Input value={cedula} onChange={(e) => setCedula(e.target.value)} className="h-7 w-28" />
      </td>
      <td className="py-1.5 pr-3">
        <div className="flex flex-col gap-1">
          <SelectArea value={area} onChange={cambiarArea} areas={areasDisponibles} className="h-7 w-full" />
          <SelectAreaOrigen value={areaOrigen} onChange={setAreaOrigen} className="h-6 w-full text-[11px] text-muted-foreground" />
        </div>
      </td>
      <td className="py-1.5 pr-3">
        <SelectRol value={rol} onChange={setRol} roles={rolesDelArea} className="h-7 w-full" />
      </td>
      <td className="py-1.5 pr-3">
        <SelectCargo value={cargo} onChange={setCargo} area={area} className="h-7 w-full" />
      </td>
      <td className="py-1.5">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={guardar} disabled={enviando || !nombre.trim() || area === ""}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onCancelar} disabled={enviando}>
            <X className="size-3.5" />
          </Button>
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  )
}
