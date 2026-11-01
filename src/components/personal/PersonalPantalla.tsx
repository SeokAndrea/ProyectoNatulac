import { useCallback, useEffect, useMemo, useState } from "react"
import { LayoutGrid, Plus, Search, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { listarEstructura, type Estructura } from "@/lib/estructura"
import { puede } from "@/lib/permisos"
import { PERMISOS, type Permiso } from "@/lib/permisos"
import { listarPermisosExtra, listarPersonal, listarPuestosAsignables, type PersonalRegistrado, type PuestoAsignable } from "@/lib/personal"
import { cn } from "@/lib/utils"
import { MenuAreas, type ItemMenuArea } from "./MenuAreas"
import { OrganigramaArea } from "./OrganigramaArea"
import { PanelPersona } from "./PanelPersona"
import { TablaPersonal } from "./TablaPersonal"

const SIN_AREA = "__sin_area__"

/** Sin tildes ni mayúsculas, para buscar «perez» y encontrar «Pérez». */
const plano = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * Personal (maqueta B): menú de áreas a la izquierda (solo con
 * ESTRUCTURA_GESTIONAR), organigrama por nivel al centro y el panel de la
 * persona a la derecha. Sin ese permiso se ve solo el área de la sesión.
 * Quién se puede editar lo decide la base (`gestionable`).
 */
export function PersonalPantalla({ pagina }: { pagina: string }) {
  const { session } = useAuth()
  const { areas } = useCatalogosLive()
  const usuario = session?.username ?? ""
  const conMenu = puede(session, "ESTRUCTURA_GESTIONAR")

  const [personal, setPersonal] = useState<PersonalRegistrado[] | null>(null)
  const [asignables, setAsignables] = useState<PuestoAsignable[]>([])
  const [estructura, setEstructura] = useState<Estructura | null>(null)
  const [extras, setExtras] = useState<Map<string, Permiso[]>>(new Map())
  const [area, setArea] = useState<string | null>(session?.area ?? null)
  /** Persona abierta en el panel: su id, "nueva" o null. */
  const [abierta, setAbierta] = useState<string | null>(null)
  const [vista, setVista] = useState<"organigrama" | "tabla">("organigrama")
  const [busqueda, setBusqueda] = useState("")

  const cargar = useCallback(async () => {
    if (!usuario) return
    const [p, a, e, x] = await Promise.all([listarPersonal(usuario), listarPuestosAsignables(usuario), listarEstructura(usuario), listarPermisosExtra(usuario)])
    setPersonal(p)
    setAsignables(a)
    setEstructura(e)
    setExtras(x)
  }, [usuario])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la base
    void cargar()
  }, [cargar])

  const nombreArea = useCallback((codigo: string | null) => (codigo ? (areas.find((a) => a.codigo === codigo)?.nombre ?? codigo) : "Sin área"), [areas])

  const items = useMemo<ItemMenuArea[]>(() => {
    const lista = personal ?? []
    const delMenu: ItemMenuArea[] = areas.map((a) => ({ codigo: a.codigo, nombre: a.nombre, activo: a.activo, personas: lista.filter((p) => p.areaCodigo === a.codigo).length }))
    const sinArea = lista.filter((p) => p.areaCodigo === null).length
    if (sinArea > 0) delMenu.push({ codigo: SIN_AREA, nombre: "Sin área", activo: true, personas: sinArea })
    return delMenu
  }, [areas, personal])

  // Área que se muestra: la elegida; si no hay, la de la sesión o la primera con gente.
  const areaActual = area ?? items.find((i) => i.personas > 0)?.codigo ?? items[0]?.codigo ?? null
  const delArea = useMemo(() => {
    const lista = personal ?? []
    // Sin menú y sin área fija (no debería pasar): se muestra todo lo que la base entrega.
    if (!conMenu && !session?.area) return lista
    const codigo = conMenu ? areaActual : session?.area
    return lista.filter((p) => (codigo === SIN_AREA ? p.areaCodigo === null : p.areaCodigo === codigo))
  }, [personal, conMenu, areaActual, session?.area])

  const resaltadas = useMemo(() => {
    const q = plano(busqueda.trim())
    if (!q) return new Set<string>()
    return new Set(delArea.filter((p) => [p.nombre, p.usuario, p.cedula ?? ""].some((t) => plano(t).includes(q))).map((p) => p.id))
  }, [busqueda, delArea])

  const ofrecibles = useMemo<Permiso[]>(() => (session?.rol === "SUPERADMINISTRADOR" ? PERMISOS.map((p) => p.codigo) : (session?.permisos ?? [])), [session])

  const persona = abierta && abierta !== "nueva" ? (delArea.find((p) => p.id === abierta) ?? null) : null
  const panelAbierto = abierta === "nueva" || persona !== null
  const areaTitulo = conMenu ? nombreArea(areaActual === SIN_AREA ? null : areaActual) : nombreArea(session?.area ?? null)

  async function despuesDeCambio() {
    setAbierta(null)
    await cargar()
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {conMenu && (
        <MenuAreas
          areas={items}
          actual={areaActual ?? ""}
          onElegir={(codigo) => {
            setArea(codigo)
            setAbierta(null)
            setBusqueda("")
          }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            <h2 className="text-xl font-semibold text-foreground">{areaTitulo}</h2>
            <p className="text-sm text-foreground">{personal ? `${delArea.length} ${delArea.length === 1 ? "persona" : "personas"}` : "Cargando…"}</p>
          </div>
          <label className="flex h-10 min-w-56 items-center gap-2 rounded-lg border border-input bg-background px-3 pointer-coarse:h-11">
            <Search className="size-4 text-foreground" />
            <input
              type="search"
              aria-label="Buscar persona"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, usuario o cédula"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <Button variant="outline" onClick={() => setVista(vista === "tabla" ? "organigrama" : "tabla")}>
            {vista === "tabla" ? <LayoutGrid className="size-4" /> : <Table2 className="size-4" />}
            {vista === "tabla" ? "Organigrama" : "Tabla"}
          </Button>
          {asignables.length > 0 && (
            <Button onClick={() => setAbierta("nueva")} className={cn(abierta === "nueva" && "ring-2 ring-ring")}>
              <Plus className="size-4" />
              Persona
            </Button>
          )}
        </div>

        {personal === null ? null : vista === "tabla" ? (
          <TablaPersonal personas={delArea} elegida={abierta} resaltadas={resaltadas} onElegir={setAbierta} />
        ) : (
          <OrganigramaArea personas={delArea} elegida={abierta} resaltadas={resaltadas} onElegir={setAbierta} />
        )}
      </div>

      {panelAbierto && (
        <PanelPersona
          key={abierta}
          persona={persona}
          usuarioSesion={usuario}
          pagina={pagina}
          asignables={asignables}
          puestos={estructura?.puestos ?? null}
          ofrecibles={ofrecibles}
          extrasActuales={persona ? (extras.get(persona.id) ?? []) : []}
          puedeEliminar={conMenu}
          nombreArea={areaTitulo}
          onCerrar={() => setAbierta(null)}
          onCambio={despuesDeCambio}
        />
      )}
    </div>
  )
}
