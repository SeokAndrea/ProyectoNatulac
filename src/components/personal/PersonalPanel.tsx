import { useEffect, useMemo, useState } from "react"
import { Loader2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AREAS, ROLES, type RolCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"
import type { Permiso } from "@/lib/permisos"
import { listarDuenos, listarPermisosExtra, listarPersonal, permisosPorRol, type PersonalRegistrado } from "@/lib/personal"
import { FilaPersonal } from "./FilaPersonal"
import { FILTROS_INICIALES, hayFiltrosActivos, type Filtros } from "./filtros"
import { FiltrosPersonal } from "./FiltrosPersonal"
import { FormularioNuevoPersonal } from "./FormularioNuevoPersonal"
import type { AreaOpcion, RolOpcion } from "./SelectoresPuesto"

/*
 * Gestión de personal: pestaña "Personal" de "Edición de Datos" y página
 * "Personal" (permiso PERSONAL_GESTIONAR, ej. Jefe de Producción).
 *
 * El permiso real vive en Postgres, no aquí (ver
 * supabase/migrations/20261078090000_roles_y_permisos.sql: cada
 * función recibe quién hace el pedido y decide si le está permitido).
 * Solo un Super Administrador da el rol Super Administrador, toca a otro
 * Super Administrador o da permisos extra; el resto ve su propia área.
 */
export function PersonalPanel({ pagina }: { pagina: string }) {
  const { session } = useAuth()
  const [personal, setPersonal] = useState<PersonalRegistrado[]>([])
  const [cargando, setCargando] = useState(true)
  const [agregando, setAgregando] = useState(false)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES)

  const esSuperAdmin = session?.rol === "SUPERADMINISTRADOR"
  const areasDisponibles: readonly AreaOpcion[] = esSuperAdmin ? AREAS : AREAS.filter((a) => a.codigo === session?.area)
  // El rol Super Administrador solo lo da el dueño.
  const esDueno = session?.esDueno ?? false
  const rolesDisponibles: readonly RolOpcion[] = esDueno ? ROLES : ROLES.filter((r) => r.codigo !== "SUPERADMINISTRADOR")

  // Permisos extra por persona y el paquete de cada rol (para no ofrecer como extra lo que el rol ya trae).
  const [extras, setExtras] = useState<Map<string, Permiso[]>>(new Map())
  const [porRol, setPorRol] = useState<Partial<Record<RolCodigo, Permiso[]>>>({})
  const [duenos, setDuenos] = useState<Set<string>>(new Set())

  async function recargar(usuario: string) {
    const [lista, extrasActuales, paquetes, duenosActuales] = await Promise.all([
      listarPersonal(usuario),
      listarPermisosExtra(usuario),
      permisosPorRol(),
      listarDuenos(usuario),
    ])
    setDuenos(duenosActuales)
    setPersonal(lista)
    setExtras(extrasActuales)
    setPorRol(paquetes)
    setCargando(false)
  }

  useEffect(() => {
    if (session) recargar(session.username)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  /*
   * listar_personal() le trae al SUPERADMINISTRADOR el personal de
   * TODAS las áreas de una — incluida PRUEBAS (el usuario fijo
   * "pruebas", sandbox), que no tiene nada que ver con la planta real.
   * Mismo criterio que estado_planta_actual / estadisticas_produccion /
   * listar_turnos_historial: PRUEBAS queda afuera salvo que se la pida a
   * propósito con el filtro de área.
   */
  const personalVisible = useMemo(() => {
    if (!esSuperAdmin || filtros.area === "PRUEBAS") return personal
    return personal.filter((p) => p.area !== "PRUEBAS")
  }, [personal, esSuperAdmin, filtros.area])

  const personalFiltrado = useMemo(() => {
    const q = filtros.busqueda.trim().toLowerCase()
    return personalVisible.filter((p) => {
      if (filtros.area !== "TODAS" && p.area !== filtros.area) return false
      if (filtros.rol !== "TODOS" && p.rol !== filtros.rol) return false
      if (filtros.cargo === "SIN_CARGO" && p.cargo !== null) return false
      if (filtros.cargo !== "TODOS" && filtros.cargo !== "SIN_CARGO" && p.cargo !== filtros.cargo) return false
      if (filtros.estado === "ACTIVOS" && !p.activo) return false
      if (filtros.estado === "INACTIVOS" && p.activo) return false
      if (q && !`${p.nombre} ${p.usuario} ${p.cedula ?? ""}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [personalVisible, filtros])

  if (!session || cargando) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const usuarioSesion = session.username
  const total = personalVisible.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal</CardTitle>
        <CardDescription>
          {hayFiltrosActivos(filtros)
            ? `${personalFiltrado.length} de ${total} persona${total === 1 ? "" : "s"}`
            : `${total} persona${total === 1 ? "" : "s"} registrada${total === 1 ? "" : "s"}`}
        </CardDescription>
        <p className="text-xs text-muted-foreground">
          El <span className="font-medium text-foreground">rol</span> define qué puede hacer cada persona. El{" "}
          <span className="font-medium text-foreground">cargo</span> es solo el título que se muestra.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {total > 0 && <FiltrosPersonal filtros={filtros} onCambio={setFiltros} areas={areasDisponibles} roles={rolesDisponibles} />}

        {total > 0 &&
          (personalFiltrado.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Nombre</th>
                    <th className="py-1.5 pr-3 font-medium">Usuario</th>
                    <th className="py-1.5 pr-3 font-medium">Cédula</th>
                    <th className="py-1.5 pr-3 font-medium">Área</th>
                    <th className="py-1.5 pr-3 font-medium">Rol (permisos)</th>
                    <th className="py-1.5 pr-3 font-medium">Cargo (título)</th>
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
                      extras={extras.get(p.id) ?? []}
                      permisosRol={porRol[p.rol] ?? []}
                      puedeDarExtras={esSuperAdmin}
                      esDuenoFila={duenos.has(p.id)}
                      puedeTocar={
                        duenos.has(p.id)
                          ? p.usuario === usuarioSesion.toLowerCase()
                          : p.rol !== "SUPERADMINISTRADOR" || esDueno
                      }
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
