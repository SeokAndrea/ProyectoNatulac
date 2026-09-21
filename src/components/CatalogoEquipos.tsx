import { useMemo, useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCatalogoParadas } from "@/lib/paradasCatalogo"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AREAS_EQUIPOS,
  cambiarActivoEquipo,
  codigoDesdeNombreEquipo,
  guardarEquipo,
  LINEAS_EQUIPOS,
  nombreLinea,
  parsearPresentaciones,
  useEquiposParadas,
  useErrorEquipos,
  type EquipoParada,
  type LineaDeEquipo,
} from "@/lib/paradasEquipos"

/*
 * Catálogo de EQUIPOS de las paradas mecánicas — alta, edición y
 * (des)activación, con sus subsistemas y las líneas donde existe cada uno.
 * El filtro por línea muestra solo los equipos de esa línea (por área: la
 * Línea 1 de Aséptico y la de Vacío son distintas). Un equipo nunca se
 * borra: se desactiva. Solo SUPERADMINISTRADOR; cada cambio queda en Auditoría.
 */

const PAGINA = "Catálogo de Paradas → Equipos"

const selectClase =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

const nombreArea = (codigo: string) => AREAS_EQUIPOS.find((a) => a.codigo === codigo)?.nombre ?? codigo
const etiquetaLinea = (l: LineaDeEquipo) =>
  `${nombreArea(l.area)} · ${nombreLinea(l.linea)}${l.presentaciones && l.presentaciones.length > 0 ? ` (${l.presentaciones.join(", ")} ml)` : ""}`
const claveLinea = (l: LineaDeEquipo) => `${l.area}|${l.linea}`

export function CatalogoEquipos({ usuario }: { usuario: string }) {
  const equipos = useEquiposParadas()
  const tipos = useCatalogoParadas()
  const fallasDe = (codigo: string) => tipos.filter((t) => t.equipoCodigo === codigo).length
  const errorCarga = useErrorEquipos()
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [lineaFiltro, setLineaFiltro] = useState("")
  const [verInactivos, setVerInactivos] = useState(true)
  const [edicion, setEdicion] = useState<{ equipo: EquipoParada; original?: string } | null>(null)

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return equipos.filter(
      (e) =>
        (verInactivos || e.activo) &&
        (!lineaFiltro || e.lineas.some((l) => claveLinea(l) === lineaFiltro)) &&
        (!q || e.nombre.toLowerCase().includes(q)),
    )
  }, [equipos, busqueda, lineaFiltro, verInactivos])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar equipo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="h-9 w-full sm:w-64"
        />
        <select className={selectClase + " sm:w-56"} value={lineaFiltro} onChange={(e) => setLineaFiltro(e.target.value)}>
          <option value="">Todas las líneas</option>
          {AREAS_EQUIPOS.flatMap((a) =>
            LINEAS_EQUIPOS.map((l) => (
              <option key={a.codigo + l} value={a.codigo + "|" + l}>
                {a.nombre} · {nombreLinea(l)}
              </option>
            )),
          )}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setEdicion({ equipo: { codigo: "", nombre: "", activo: true, lineas: [] } })}>
            <Plus className="size-4" /> Nuevo equipo
          </Button>
        </div>
      </div>

      {(errorCarga || errorAccion) && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-foreground">
          {errorAccion ?? errorCarga}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {filas.length} de {equipos.length} equipos. El supervisor solo ve las fallas de los equipos asignados a su línea.
        Un equipo sin líneas no aparece en ninguna. Las fallas de cada equipo se editan en la pestaña «Tipos de parada».
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Equipo</th>
              <th className="px-3 py-2 text-right font-medium">Fallas</th>
              <th className="px-3 py-2 font-medium">Líneas</th>
              <th className="px-3 py-2 font-medium">Activo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((e) => (
              <tr key={e.codigo} className={"border-t border-border " + (e.activo ? "" : "text-muted-foreground opacity-60")}>
                <td className="px-3 py-2">{e.nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fallasDe(e.codigo)}</td>
                <td className="px-3 py-2">
                  {e.lineas.length === 0 ? (
                    <span className="text-xs text-warning-foreground">Sin líneas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {e.lineas.map((l) => (
                        <span key={claveLinea(l)} className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
                          {etiquetaLinea(l)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={e.activo}
                    onChange={async (ev) => setErrorAccion(await cambiarActivoEquipo(usuario, e.codigo, ev.target.checked, PAGINA))}
                    aria-label={"Activo: " + e.nombre}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEdicion({ equipo: { ...e }, original: e.codigo })}>
                    <Pencil className="size-4" /> Editar
                  </Button>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No hay equipos que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {edicion && <EditorEquipo usuario={usuario} inicial={edicion.equipo} original={edicion.original} onCerrar={() => setEdicion(null)} />}
    </div>
  )
}

function EditorEquipo({
  usuario,
  inicial,
  original,
  onCerrar,
}: {
  usuario: string
  inicial: EquipoParada
  original?: string
  onCerrar: () => void
}) {
  const esNuevo = original === undefined
  const [nombre, setNombre] = useState(inicial.nombre)
  const [codigo, setCodigo] = useState(inicial.codigo)
  const [lineas, setLineas] = useState<Set<string>>(new Set(inicial.lineas.map(claveLinea)))
  // Presentaciones (ml) por línea, ej. "330": el equipo existe en esa línea solo con ellas. Vacío = todas.
  const [presentaciones, setPresentaciones] = useState<Record<string, string>>(() =>
    Object.fromEntries(inicial.lineas.map((l) => [claveLinea(l), (l.presentaciones ?? []).join(", ")])),
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  function alternar(clave: string) {
    setLineas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(clave)) nuevo.delete(clave)
      else nuevo.add(clave)
      return nuevo
    })
  }

  async function guardar() {
    if (!nombre.trim()) return setError("El nombre es obligatorio.")
    setError(null)
    setGuardando(true)
    const errorServidor = await guardarEquipo(
      usuario,
      {
        codigo: esNuevo ? codigo.trim() || codigoDesdeNombreEquipo(nombre) : inicial.codigo,
        nombre: nombre.trim(),
        lineas: [...lineas].map((c) => {
          const [area, linea] = c.split("|")
          return { area, linea, presentaciones: parsearPresentaciones(presentaciones[c] ?? "") }
        }),
      },
      original,
      PAGINA,
    )
    setGuardando(false)
    if (errorServidor) return setError(errorServidor)
    onCerrar()
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esNuevo ? "Nuevo equipo" : "Editar equipo"}</DialogTitle>
          <DialogDescription>Marca en qué líneas existe. El supervisor solo verá las fallas de los equipos de su línea.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="eq-nombre">Nombre</Label>
            <Input id="eq-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          {esNuevo && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="eq-codigo">Código interno</Label>
              <Input
                id="eq-codigo"
                placeholder={codigoDesdeNombreEquipo(nombre) || "Se genera del nombre"}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
              />
              <p className="text-xs text-muted-foreground">No se puede cambiar después de crearlo.</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Líneas donde existe (y con qué presentaciones, en ml)</Label>
            {AREAS_EQUIPOS.map((a) => (
              <div key={a.codigo} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-16 text-sm font-medium text-foreground">{a.nombre}</span>
                {LINEAS_EQUIPOS.map((l) => (
                  <span key={l} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <input type="checkbox" checked={lineas.has(a.codigo + "|" + l)} onChange={() => alternar(a.codigo + "|" + l)} />
                    {nombreLinea(l)}
                    {lineas.has(a.codigo + "|" + l) && (
                      <Input
                        className="h-7 w-24"
                        inputMode="numeric"
                        placeholder="ml (todas)"
                        value={presentaciones[a.codigo + "|" + l] ?? ""}
                        onChange={(e) => setPresentaciones((prev) => ({ ...prev, [a.codigo + "|" + l]: e.target.value }))}
                      />
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-danger-foreground">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
