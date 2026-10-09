import { useState } from "react"
import { Loader2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cargoValeEnArea, rolPermitidoEnArea, type AreaCodigo, type CargoCodigo, type RolCodigo } from "@/lib/catalogos"
import { agregarPersonal } from "@/lib/personal"
import { SelectArea, SelectAreaOrigen, SelectCargo, SelectRol, type AreaOpcion, type RolOpcion } from "./SelectoresPuesto"

/** Alta de una persona: datos, área, rol (permisos), cargo (título) y, si cubre otra área, su área de origen. */
export function FormularioNuevoPersonal({
  usuarioSesion,
  pagina,
  areasDisponibles,
  rolesDisponibles,
  areaFija,
  onCancelar,
  onAgregado,
}: {
  usuarioSesion: string
  pagina: string
  areasDisponibles: readonly AreaOpcion[]
  rolesDisponibles: readonly RolOpcion[]
  areaFija: AreaCodigo | null
  onCancelar: () => void
  onAgregado: () => void
}) {
  const [nombre, setNombre] = useState("")
  const [cedula, setCedula] = useState("")
  const [usuario, setUsuario] = useState("")
  const [password, setPassword] = useState("")
  const [area, setArea] = useState<AreaCodigo | "">(areaFija ?? "")
  const [areaOrigen, setAreaOrigen] = useState<AreaCodigo | "">("")
  const [rol, setRol] = useState<RolCodigo | "">("")
  const [cargo, setCargo] = useState<CargoCodigo | "">("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Solo los roles que van en el área elegida (el área Calidad solo lleva roles de Calidad).
  const rolesDelArea = rolesDisponibles.filter((r) => rolPermitidoEnArea(r.codigo, area))

  const valido =
    nombre.trim() !== "" && cedula.trim() !== "" && usuario.trim() !== "" && password.trim() !== "" && area !== "" && rol !== ""

  function cambiarArea(nueva: AreaCodigo) {
    setArea(nueva)
    if (rol !== "" && !rolPermitidoEnArea(rol, nueva)) setRol("")
    if (!cargoValeEnArea(cargo, nueva)) setCargo("")
  }

  async function agregar() {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const resultado = await agregarPersonal(
      usuarioSesion,
      {
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        usuario: usuario.trim(),
        password,
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
    onAgregado()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8" />
        <Input placeholder="Cédula" value={cedula} onChange={(e) => setCedula(e.target.value)} className="h-8" />
        <Input placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} className="h-8" />
        <Input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="h-8" />
        <SelectArea value={area} onChange={cambiarArea} areas={areasDisponibles} disabled={areasDisponibles.length <= 1} className="h-8 w-full" />
        <SelectRol value={rol} onChange={setRol} roles={rolesDelArea} className="h-8 w-full" />
        <SelectCargo value={cargo} onChange={setCargo} area={area} className="h-8 w-full" />
        <SelectAreaOrigen value={areaOrigen} onChange={setAreaOrigen} placeholder="Área de origen (opcional)" className="h-8 w-full" />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={agregar} disabled={enviando || !valido}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
          Agregar
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
