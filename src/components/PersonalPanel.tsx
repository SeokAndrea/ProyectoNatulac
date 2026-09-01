import { useEffect, useMemo, useState } from "react"
import { Ban, Check, KeyRound, Loader2, Pencil, RotateCcw, Search, Trash2, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { AREAS, CARGOS, ROLES, nombrePorCodigo, type AreaCodigo, type CargoCodigo, type RolCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"
import {
  agregarPersonal,
  desactivarPersonal,
  editarPersonal,
  eliminarPersonal,
  listarPersonal,
  reactivarPersonal,
  restablecerPassword,
  type PersonalRegistrado,
} from "@/lib/personal"

type OpcionCatalogo = { codigo: string; nombre: string }

/** Sentinel del <Select> de "Área de origen" para "sin reemplazo" (el value no puede ser cadena vacía). */
const SIN_AREA_ORIGEN = "__ninguna__"
/** Sentinel del <Select> de "Cargo" para "sin cargo". */
const SIN_CARGO = "__ninguno__"

/*
 * Gestión de personal, compartida entre "Edición de Datos" (Jorge,
 * SUPERADMINISTRADOR — ve y edita el personal de TODAS las áreas) y
 * "Personal" (ADMINISTRADOR_AREA — solo ve y edita el de su propia
 * área, y no puede asignar el rol SUPERADMINISTRADOR).
 *
 * El filtro real vive en Postgres, no acá (ver
 * supabase/migrations/20260828090000_personal_por_area.sql: cada
 * función recibe quién hace el pedido y Postgres decide qué le está
 * permitido ver/tocar). Acá solo se ajustan las OPCIONES visibles
 * (área fija, sin SUPERADMINISTRADOR) para que un administrador de
 * área no vea opciones que el servidor de todos modos le va a
 * rechazar.
 */
export function PersonalPanel({ pagina }: { pagina: string }) {
  const { session } = useAuth()
  const [personal, setPersonal] = useState<PersonalRegistrado[]>([])
  const [cargando, setCargando] = useState(true)
  const [agregando, setAgregando] = useState(false)

  const esSuperAdmin = session?.rol === "SUPERADMINISTRADOR"
  const areasDisponibles: OpcionCatalogo[] = esSuperAdmin ? [...AREAS] : AREAS.filter((a) => a.codigo === session?.area)
  const rolesDisponibles: OpcionCatalogo[] = esSuperAdmin ? [...ROLES] : ROLES.filter((r) => r.codigo !== "SUPERADMINISTRADOR")

  /*
   * Filtros: solo del lado del cliente, sobre lo que ya devolvió
   * listarPersonal() — el filtro de acceso real (quién puede VER a
   * quién) sigue siendo cosa de Postgres, esto es nada más para no
   * tener que desplazarse por una lista larga.
   */
  const [busqueda, setBusqueda] = useState("")
  const [filtroArea, setFiltroArea] = useState<AreaCodigo | "TODAS">("TODAS")
  const [filtroRol, setFiltroRol] = useState<RolCodigo | "TODOS">("TODOS")
  const [filtroCargo, setFiltroCargo] = useState<CargoCodigo | "TODOS" | "SIN_CARGO">("TODOS")
  const [filtroEstado, setFiltroEstado] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS")

  async function recargar(usuario: string) {
    const lista = await listarPersonal(usuario)
    setPersonal(lista)
    setCargando(false)
  }

  useEffect(() => {
    if (session) recargar(session.username)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  const personalFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return personal.filter((p) => {
      if (filtroArea !== "TODAS" && p.area !== filtroArea) return false
      if (filtroRol !== "TODOS" && p.rol !== filtroRol) return false
      if (filtroCargo === "SIN_CARGO" && p.cargo !== null) return false
      if (filtroCargo !== "TODOS" && filtroCargo !== "SIN_CARGO" && p.cargo !== filtroCargo) return false
      if (filtroEstado === "ACTIVOS" && !p.activo) return false
      if (filtroEstado === "INACTIVOS" && p.activo) return false
      if (q && !`${p.nombre} ${p.usuario} ${p.cedula ?? ""}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [personal, busqueda, filtroArea, filtroRol, filtroCargo, filtroEstado])

  const hayFiltrosActivos =
    busqueda.trim() !== "" ||
    filtroArea !== "TODAS" ||
    filtroRol !== "TODOS" ||
    filtroCargo !== "TODOS" ||
    filtroEstado !== "TODOS"

  if (!session || cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const usuarioSesion = session.username

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal</CardTitle>
        <CardDescription>
          {hayFiltrosActivos
            ? `${personalFiltrado.length} de ${personal.length} persona${personal.length === 1 ? "" : "s"}`
            : `${personal.length} persona${personal.length === 1 ? "" : "s"} registrada${personal.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {personal.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, usuario o cédula"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="h-8 pl-8"
              />
            </div>
            {areasDisponibles.length > 1 && (
              <Select value={filtroArea} onValueChange={(v) => setFiltroArea(v as AreaCodigo | "TODAS")}>
                <SelectTrigger className="h-8 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas las áreas</SelectItem>
                  {areasDisponibles.map((a) => (
                    <SelectItem key={a.codigo} value={a.codigo}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filtroRol} onValueChange={(v) => setFiltroRol(v as RolCodigo | "TODOS")}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los roles</SelectItem>
                {rolesDisponibles.map((r) => (
                  <SelectItem key={r.codigo} value={r.codigo}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroCargo} onValueChange={(v) => setFiltroCargo(v as typeof filtroCargo)}>
              <SelectTrigger className="h-8 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los cargos</SelectItem>
                {CARGOS.map((c) => (
                  <SelectItem key={c.codigo} value={c.codigo}>
                    {c.nombre}
                  </SelectItem>
                ))}
                <SelectItem value="SIN_CARGO">Sin cargo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as typeof filtroEstado)}>
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="ACTIVOS">Activos</SelectItem>
                <SelectItem value="INACTIVOS">Inactivos</SelectItem>
              </SelectContent>
            </Select>
            {hayFiltrosActivos && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBusqueda("")
                  setFiltroArea("TODAS")
                  setFiltroRol("TODOS")
                  setFiltroCargo("TODOS")
                  setFiltroEstado("TODOS")
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        )}

        {personal.length > 0 &&
          (personalFiltrado.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Nombre</th>
                    <th className="py-1.5 pr-3 font-medium">Usuario</th>
                    <th className="py-1.5 pr-3 font-medium">Cédula</th>
                    <th className="py-1.5 pr-3 font-medium">Área</th>
                    <th className="py-1.5 pr-3 font-medium">Rol</th>
                    <th className="py-1.5 pr-3 font-medium">Cargo</th>
                    <th className="py-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {personalFiltrado.map((p) => (
                    <FilaPersonal
                      key={p.id}
                      persona={p}
                      usuarioSesion={usuarioSesion}
                      pagina={pagina}
                      areasDisponibles={areasDisponibles}
                      rolesDisponibles={rolesDisponibles}
                      onCambio={() => recargar(usuarioSesion)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Nadie coincide con esos filtros.</p>
          ))}

        {agregando ? (
          <FormularioNuevoPersonal
            usuarioSesion={usuarioSesion}
            pagina={pagina}
            areasDisponibles={areasDisponibles}
            rolesDisponibles={rolesDisponibles}
            areaFija={esSuperAdmin ? null : (session.area ?? null)}
            onCancelar={() => setAgregando(false)}
            onAgregado={() => {
              setAgregando(false)
              recargar(usuarioSesion)
            }}
          />
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAgregando(true)}>
            <UserPlus className="size-3.5" />
            Agregar personal
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function FilaPersonal({
  persona,
  usuarioSesion,
  pagina,
  areasDisponibles,
  rolesDisponibles,
  onCambio,
}: {
  persona: PersonalRegistrado
  usuarioSesion: string
  pagina: string
  areasDisponibles: OpcionCatalogo[]
  rolesDisponibles: OpcionCatalogo[]
  onCambio: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [restableciendo, setRestableciendo] = useState(false)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)
  const [nombre, setNombre] = useState(persona.nombre)
  const [cedula, setCedula] = useState(persona.cedula ?? "")
  const [area, setArea] = useState<AreaCodigo | "">(persona.area ?? "")
  const [areaOrigen, setAreaOrigen] = useState<AreaCodigo | "">(persona.areaOrigen ?? "")
  const [rol, setRol] = useState<RolCodigo>(persona.rol)
  const [cargo, setCargo] = useState<CargoCodigo | "">(persona.cargo ?? "")
  const [passwordNueva, setPasswordNueva] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)
  const [tieneRegistros, setTieneRegistros] = useState(false)
  const [enviando, setEnviando] = useState(false)

  function cancelarEdicion() {
    setEditando(false)
    setNombre(persona.nombre)
    setCedula(persona.cedula ?? "")
    setArea(persona.area ?? "")
    setAreaOrigen(persona.areaOrigen ?? "")
    setRol(persona.rol)
    setCargo(persona.cargo ?? "")
    setError(null)
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
    setEditando(false)
    onCambio()
  }

  async function guardarPassword() {
    if (!passwordNueva.trim()) return
    setEnviando(true)
    const ok = await restablecerPassword(usuarioSesion, persona.id, passwordNueva, pagina)
    setEnviando(false)
    if (!ok) {
      setError("No se pudo restablecer la contraseña. Intenta de nuevo.")
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
            <Select value={area} onValueChange={(v) => setArea(v as AreaCodigo)}>
              <SelectTrigger className="h-7 w-full">
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                {areasDisponibles.map((a) => (
                  <SelectItem key={a.codigo} value={a.codigo}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Área de origen: solo informativa (reemplazos temporales entre áreas) — por eso ofrece TODAS las áreas, no solo areasDisponibles. */}
            <Select
              value={areaOrigen || SIN_AREA_ORIGEN}
              onValueChange={(v) => setAreaOrigen(v === SIN_AREA_ORIGEN ? "" : (v as AreaCodigo))}
            >
              <SelectTrigger className="h-6 w-full text-[11px] text-muted-foreground">
                <SelectValue placeholder="Área de origen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_AREA_ORIGEN}>Sin área de origen</SelectItem>
                {AREAS.map((a) => (
                  <SelectItem key={a.codigo} value={a.codigo}>
                    De {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </td>
        <td className="py-1.5 pr-3">
          <Select value={rol} onValueChange={(v) => setRol(v as RolCodigo)}>
            <SelectTrigger className="h-7 w-full">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              {rolesDisponibles.map((r) => (
                <SelectItem key={r.codigo} value={r.codigo}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="py-1.5 pr-3">
          <Select value={cargo || SIN_CARGO} onValueChange={(v) => setCargo(v === SIN_CARGO ? "" : (v as CargoCodigo))}>
            <SelectTrigger className="h-7 w-full">
              <SelectValue placeholder="Cargo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_CARGO}>Sin cargo</SelectItem>
              {CARGOS.map((c) => (
                <SelectItem key={c.codigo} value={c.codigo}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={guardar} disabled={enviando || !nombre.trim() || area === ""}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={cancelarEdicion} disabled={enviando}>
              <X className="size-3.5" />
            </Button>
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </td>
      </tr>
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
        <td className="py-1.5 pr-3 text-muted-foreground">{nombrePorCodigo(ROLES, persona.rol)}</td>
        <td className="py-1.5 pr-3 text-muted-foreground">
          {persona.cargo ? nombrePorCodigo(CARGOS, persona.cargo) : "—"}
        </td>
        <td className="py-1.5">
          <div className="flex items-center justify-end gap-1.5">
            {!persona.activo && <Badge variant="outline">Inactivo</Badge>}
            {persona.activo ? (
              <>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditando(true)} aria-label="Editar">
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setRestableciendo((v) => !v)}
                  aria-label="Restablecer contraseña"
                >
                  <KeyRound className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Desactivar">
                  {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={toggleActivo} disabled={enviando} aria-label="Reactivar">
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmandoEliminar((v) => !v)}
              aria-label="Eliminar"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
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
                  setError(null)
                }}
                disabled={enviando}
              >
                Cancelar
              </Button>
              {error && <p className="w-full text-xs text-destructive">{error}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function FormularioNuevoPersonal({
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
  areasDisponibles: OpcionCatalogo[]
  rolesDisponibles: OpcionCatalogo[]
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

  const valido =
    nombre.trim() !== "" && cedula.trim() !== "" && usuario.trim() !== "" && password.trim() !== "" && area !== "" && rol !== ""

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
        <Input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-8"
        />
        <Select value={area} onValueChange={(v) => setArea(v as AreaCodigo)} disabled={areasDisponibles.length <= 1}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            {areasDisponibles.map((a) => (
              <SelectItem key={a.codigo} value={a.codigo}>
                {a.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rol} onValueChange={(v) => setRol(v as RolCodigo)}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            {rolesDisponibles.map((r) => (
              <SelectItem key={r.codigo} value={r.codigo}>
                {r.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Cargo: rótulo visual del puesto, no afecta permisos. Opcional. */}
        <Select value={cargo || SIN_CARGO} onValueChange={(v) => setCargo(v === SIN_CARGO ? "" : (v as CargoCodigo))}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Cargo (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_CARGO}>Sin cargo</SelectItem>
            {CARGOS.map((c) => (
              <SelectItem key={c.codigo} value={c.codigo}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Solo para reemplazos temporales entre áreas — de dónde es la persona en realidad. Opcional. */}
        <Select
          value={areaOrigen || SIN_AREA_ORIGEN}
          onValueChange={(v) => setAreaOrigen(v === SIN_AREA_ORIGEN ? "" : (v as AreaCodigo))}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Área de origen (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_AREA_ORIGEN}>Sin área de origen</SelectItem>
            {AREAS.map((a) => (
              <SelectItem key={a.codigo} value={a.codigo}>
                De {a.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
