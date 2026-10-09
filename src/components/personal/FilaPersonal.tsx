import { useState } from "react"
import { Ban, KeyRound, Loader2, Pencil, RotateCcw, ShieldPlus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AREAS, CARGOS, ROLES, nombrePorCodigo } from "@/lib/catalogos"
import { PERMISOS, type Permiso } from "@/lib/permisos"
import { desactivarPersonal, eliminarPersonal, reactivarPersonal, restablecerPassword, type PersonalRegistrado } from "@/lib/personal"
import { cn } from "@/lib/utils"
import { EditorPermisosExtra } from "./EditorPermisosExtra"
import { FilaEdicionPersonal } from "./FilaEdicionPersonal"
import type { AreaOpcion, RolOpcion } from "./SelectoresPuesto"

/** Una persona de la tabla: sus datos y las acciones (editar, contraseña, permisos extra, desactivar, eliminar). */
export function FilaPersonal({
  persona,
  usuarioSesion,
  pagina,
  areasDisponibles,
  rolesDisponibles,
  extras,
  permisosRol,
  puedeDarExtras,
  esDuenoFila,
  puedeTocar,
  onCambio,
}: {
  persona: PersonalRegistrado
  usuarioSesion: string
  pagina: string
  areasDisponibles: readonly AreaOpcion[]
  rolesDisponibles: readonly RolOpcion[]
  /** Permisos extra que ya tiene, además de los de su rol. */
  extras: Permiso[]
  /** Permisos que trae su rol por defecto. */
  permisosRol: Permiso[]
  /** Solo un Super Administrador da permisos extra. */
  puedeDarExtras: boolean
  /** Esta persona es el dueño. */
  esDuenoFila: boolean
  /** Al dueño solo lo toca él mismo; a un Super Administrador, solo el dueño. */
  puedeTocar: boolean
  onCambio: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [editandoPermisos, setEditandoPermisos] = useState(false)
  const [restableciendo, setRestableciendo] = useState(false)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)
  const [passwordNueva, setPasswordNueva] = useState("")
  const [errorPassword, setErrorPassword] = useState<string | null>(null)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)
  const [tieneRegistros, setTieneRegistros] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function guardarPassword() {
    if (!passwordNueva.trim()) return
    setEnviando(true)
    const ok = await restablecerPassword(usuarioSesion, persona.id, passwordNueva, pagina)
    setEnviando(false)
    if (!ok) {
      setErrorPassword("No se pudo restablecer la contraseña. Intenta de nuevo.")
      return
    }
    setRestableciendo(false)
    setPasswordNueva("")
  }

  async function toggleActivo() {
    setEnviando(true)
    if (persona.activo) {
      await desactivarPersonal(usuarioSesion, persona.id, pagina)
    } else {
      await reactivarPersonal(usuarioSesion, persona.id, pagina)
    }
    setEnviando(false)
    onCambio()
  }

  async function eliminar(forzar = false) {
    setEnviando(true)
    setErrorEliminar(null)
    const resultado = await eliminarPersonal(usuarioSesion, persona.id, forzar, pagina)
    setEnviando(false)
    if (!resultado.ok) {
      setErrorEliminar(resultado.error)
      setTieneRegistros(resultado.tieneRegistros ?? false)
      return
    }
    onCambio()
  }

  if (editando) {
    return (
      <FilaEdicionPersonal
        persona={persona}
        usuarioSesion={usuarioSesion}
        pagina={pagina}
        areasDisponibles={areasDisponibles}
        rolesDisponibles={rolesDisponibles}
        onCancelar={() => setEditando(false)}
        onGuardado={() => {
          setEditando(false)
          onCambio()
        }}
      />
    )
  }

  return (
    <>
      <tr className="border-b border-border/50 last:border-0">
        <td className={cn("py-1.5 pr-3", !persona.activo && "text-muted-foreground line-through")}>{persona.nombre}</td>
        <td className="py-1.5 pr-3 text-muted-foreground">@{persona.usuario}</td>
        <td className="py-1.5 pr-3 text-muted-foreground">{persona.cedula ?? "—"}</td>
        <td className="py-1.5 pr-3 text-muted-foreground">
          {persona.area ? nombrePorCodigo(AREAS, persona.area) : "Todas"}
          {persona.areaOrigen && persona.areaOrigen !== persona.area && (
            <span className="mt-0.5 block text-[11px] text-primary">De {nombrePorCodigo(AREAS, persona.areaOrigen)}</span>
          )}
        </td>
        <td className="py-1.5 pr-3 text-muted-foreground">
          {nombrePorCodigo(ROLES, persona.rol)}
          {esDuenoFila && (
            <Badge variant="outline" className="ml-1.5">
              Dueño
            </Badge>
          )}
          {extras.length > 0 && (
            <span className="mt-0.5 block text-[11px] text-primary">
              + {extras.map((p) => nombrePorCodigo(PERMISOS, p)).join(", ")}
            </span>
          )}
        </td>
        <td className="py-1.5 pr-3 text-muted-foreground">{persona.cargo ? nombrePorCodigo(CARGOS, persona.cargo) : "—"}</td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-1.5">
            {!persona.activo && <Badge variant="outline">Inactivo</Badge>}
            {!puedeTocar ? null : persona.activo ? (
              <>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditando(true)} aria-label="Editar">
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setRestableciendo((v) => !v)} aria-label="Restablecer contraseña">
                  <KeyRound className="size-3.5" />
                </Button>
                {puedeDarExtras && persona.rol !== "SUPERADMINISTRADOR" && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditandoPermisos((v) => !v)} aria-label="Permisos extra">
                    <ShieldPlus className="size-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Desactivar">
                  {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Reactivar">
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              </Button>
            )}
            {puedeTocar && !esDuenoFila && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmandoEliminar((v) => !v)}
                aria-label="Eliminar"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </td>
      </tr>
      {confirmandoEliminar && (
        <tr className="border-b border-border/50 last:border-0">
          <td colSpan={7} className="py-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-2.5">
              <span className="text-xs text-foreground">
                ¿Eliminar a <span className="font-medium">{persona.nombre}</span> definitivamente? No se puede deshacer.
              </span>
              <Button variant="destructive" size="sm" onClick={() => eliminar()} disabled={enviando}>
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Sí, eliminar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmandoEliminar(false)
                  setErrorEliminar(null)
                  setTieneRegistros(false)
                }}
                disabled={enviando}
              >
                Cancelar
              </Button>
              {errorEliminar && (
                <div className="flex w-full flex-wrap items-center gap-2">
                  <p className="text-xs text-destructive">{errorEliminar}</p>
                  {tieneRegistros && (
                    <Button variant="destructive" size="sm" onClick={() => eliminar(true)} disabled={enviando}>
                      {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      Eliminar de todas formas (borra también sus turnos)
                    </Button>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
      {editandoPermisos && (
        <EditorPermisosExtra
          persona={persona}
          usuarioSesion={usuarioSesion}
          pagina={pagina}
          extras={extras}
          permisosRol={permisosRol}
          onCerrar={() => setEditandoPermisos(false)}
          onGuardado={() => {
            setEditandoPermisos(false)
            onCambio()
          }}
        />
      )}
      {restableciendo && (
        <tr className="border-b border-border/50 last:border-0">
          <td colSpan={7} className="py-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-2.5">
              <span className="text-xs text-muted-foreground">Nueva contraseña para @{persona.usuario}:</span>
              <Input
                type="password"
                placeholder="••••••••"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                className="h-7 w-40"
              />
              <Button size="sm" onClick={guardarPassword} disabled={enviando || !passwordNueva.trim()}>
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                Guardar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRestableciendo(false)
                  setPasswordNueva("")
                  setErrorPassword(null)
                }}
                disabled={enviando}
              >
                Cancelar
              </Button>
              {errorPassword && <p className="w-full text-xs text-destructive">{errorPassword}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
