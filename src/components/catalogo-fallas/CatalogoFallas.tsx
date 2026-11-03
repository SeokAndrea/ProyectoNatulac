import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { armarGrupos, equiposSinSubsistemas, type GrupoTabla } from "@/lib/catalogoFallas/tabla"
import { useCatalogoFallas } from "@/lib/catalogoFallas/useCatalogoFallas"
import { DialogoNivel, type NivelAEditar } from "./DialogoNivel"
import { FormAgregar } from "./FormAgregar"
import { TablaFallas } from "./TablaFallas"
import { selectClase } from "./estilos"
import { NUEVO } from "./nivelNuevo"

type Inicio = { equipoId: string; sistemaId: string; subsistemaId: string }

/**
 * Pestaña «Fallas de equipos» del Catálogo de Paradas (migración
 * 20261113490000), como tabla: arriba el formulario para agregar (queda en el
 * mismo subsistema: escribir y Enter, como en Excel) y abajo una franja por
 * subsistema con sus fallas. Quien tiene CATALOGO_PARADAS (o la dueña) agrega
 * y edita; el resto solo mira.
 */
export function CatalogoFallas({ usuario, editable }: { usuario: string; editable: boolean }) {
  const { catalogo, cargando, error, recargar } = useCatalogoFallas()
  const [busqueda, setBusqueda] = useState("")
  const [equipoId, setEquipoId] = useState("")
  // Filtros en cascada: Equipo → Sistema → Subsistema (cada uno depende del anterior).
  const [sistemaId, setSistemaId] = useState("")
  const [subsistemaId, setSubsistemaId] = useState("")
  const [verInactivos, setVerInactivos] = useState(false)
  const [nivelAEditar, setNivelAEditar] = useState<NivelAEditar | null>(null)
  // Dónde está parado el formulario; la clave lo vuelve a montar al tocar el «+» de una franja.
  const [formulario, setFormulario] = useState<{ inicio: Inicio | null; clave: number }>({ inicio: null, clave: 0 })

  const grupos = useMemo(() => armarGrupos(catalogo, { busqueda, equipoId, sistemaId, subsistemaId, verInactivos }), [catalogo, busqueda, equipoId, sistemaId, subsistemaId, verInactivos])
  const sistemasDelEquipo = useMemo(() => catalogo.sistemas.filter((x) => x.equipoId === equipoId && (verInactivos || x.activo)), [catalogo.sistemas, equipoId, verInactivos])
  const subsistemasDelSistema = useMemo(() => catalogo.subsistemas.filter((x) => x.sistemaId === sistemaId && (verInactivos || x.activo)), [catalogo.subsistemas, sistemaId, verInactivos])
  const sinSubsistemas = useMemo(() => equiposSinSubsistemas(catalogo), [catalogo])
  const fallasVisibles = grupos.reduce((n, g) => n + g.fallas.length, 0)

  const primerLugar = (): Inicio => {
    const g = armarGrupos(catalogo, { busqueda: "", equipoId: "", verInactivos: false }).find((x) => !x.subsistema.reservada)
    return g ? { equipoId: g.equipo.id, sistemaId: g.sistema.id, subsistemaId: g.subsistema.id } : { equipoId: NUEVO, sistemaId: NUEVO, subsistemaId: NUEVO }
  }

  function agregarEn(g: GrupoTabla) {
    setFormulario((f) => ({ inicio: { equipoId: g.equipo.id, sistemaId: g.sistema.id, subsistemaId: g.subsistema.id }, clave: f.clave + 1 }))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="flex flex-col gap-4">
      {editable && !cargando && (
        <section aria-labelledby="cf-titulo-agregar" className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 id="cf-titulo-agregar" className="font-semibold text-foreground">
            Agregar
          </h2>
          <FormAgregar
            key={formulario.clave}
            catalogo={catalogo}
            usuario={usuario}
            inicial={formulario.inicio ?? primerLugar()}
            enfocar={formulario.clave > 0}
            onAgregado={recargar}
          />
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Buscar en el catálogo" placeholder="Buscar falla, subsistema o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-8" />
        </div>
        <select
          aria-label="Equipo"
          className={`${selectClase} sm:w-56`}
          value={equipoId}
          onChange={(e) => {
            setEquipoId(e.target.value)
            setSistemaId("")
            setSubsistemaId("")
          }}
        >
          <option value="">Todos los equipos</option>
          {catalogo.equipos
            .filter((e) => verInactivos || e.activo)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
        </select>
        <select
          aria-label="Sistema"
          className={`${selectClase} sm:w-56`}
          value={sistemaId}
          disabled={!equipoId}
          onChange={(e) => {
            setSistemaId(e.target.value)
            setSubsistemaId("")
          }}
        >
          <option value="">{equipoId ? "Todos los sistemas" : "Sistema (elige un equipo)"}</option>
          {sistemasDelEquipo.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Subsistema" className={`${selectClase} sm:w-56`} value={subsistemaId} disabled={!sistemaId} onChange={(e) => setSubsistemaId(e.target.value)}>
          <option value="">{sistemaId ? "Todos los subsistemas" : "Subsistema (elige un sistema)"}</option>
          {subsistemasDelSistema.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="num">
          {fallasVisibles} {fallasVisibles === 1 ? "falla" : "fallas"}
        </span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar inactivas
        </label>
      </div>

      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-foreground">{error}</p>}
      {sinSubsistemas.length > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          Sin subsistemas todavía: {sinSubsistemas.map((e) => e.nombre).join(", ")}. Agrégales uno arriba con «+ Nuevo».
        </p>
      )}
      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : grupos.length === 0 ? (
        <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
          {busqueda.trim() ? `Nada coincide con «${busqueda.trim()}».` : "Todavía no hay fallas. Empieza arriba, en «Agregar»."}
        </p>
      ) : (
        <TablaFallas grupos={grupos} editable={editable} usuario={usuario} onEditarNivel={setNivelAEditar} onAgregarEn={agregarEn} onGuardado={recargar} />
      )}

      <DialogoNivel catalogo={catalogo} editar={nivelAEditar} usuario={usuario} onCerrar={() => setNivelAEditar(null)} onGuardado={recargar} />
    </div>
  )
}
