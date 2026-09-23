import { Fragment, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { CatalogoEquipos } from "@/components/CatalogoEquipos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth"
import { AREAS_EQUIPOS, LINEAS_EQUIPOS, nombreLinea, parsearPresentaciones, useEquiposParadas } from "@/lib/paradasEquipos"
import { agruparTipos } from "@/lib/paradasGrupos"
import {
  CLASES_PARADA,
  codigoPlanilla,
  fmtDuracion,
  NOMBRE_CLASE,
  NOMBRE_FAMILIA,
  type ClaseParada,
  type FamiliaParada,
} from "@/lib/paradas"
import {
  cambiarActivo,
  guardarTipo,
  useCatalogoParadas,
  useErrorCatalogo,
  validarTipo,
  type TipoParadaEditable,
} from "@/lib/paradasCatalogo"

/*
 * Catálogo de Paradas — alta, edición y (des)activación de los tipos que
 * ofrece el Registro de Paradas. Un tipo nunca se borra: se desactiva, para
 * no dejar huérfanas las paradas ya registradas con él.
 * Vive en la tabla `paradas_tipos` (src/lib/paradasCatalogo.ts); solo
 * SUPERADMINISTRADOR edita y cada cambio queda en Auditoría.
 */

const PAGINA = "Catálogo de Paradas"

// Familias viejas que la migración 20261064 fundió en Suministro (S) y Equipo de Proceso (EP): ya no se ofrecen.
const FAMILIAS_FUNDIDAS = new Set<FamiliaParada>(["SUMINISTRO_VAPOR", "ESTERILIZACION", "PREPARACION"])
const FAMILIAS = (Object.keys(NOMBRE_FAMILIA) as FamiliaParada[]).filter((f) => !FAMILIAS_FUNDIDAS.has(f))

const selectClase =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/** Primera línea donde existe el tipo (LINEA_1 si existe en todas). */
const primeraLinea = (t: TipoParadaEditable) => t.lineas?.slice().sort((a, b) => a.linea.localeCompare(b.linea))[0]?.linea ?? "LINEA_1"

const vacio = (): TipoParadaEditable => ({
  codigo: "",
  nombre: "",
  clase: "NO_PROGRAMADA",
  familia: "OPERACIONAL",
  tiempoGuiaMin: null,
  prefijoPlanilla: "",
  secuenciaPlanilla: null,
  activo: true,
})

/** 'Cambio de Lote' → 'CAMBIO_DE_LOTE' */
const codigoDesdeNombre = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

export default function CatalogoParadas() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""
  const catalogo = useCatalogoParadas()
  const errorCatalogo = useErrorCatalogo()
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const equipos = useEquiposParadas()
  const nombreEquipo = (codigo?: string | null) => equipos.find((e) => e.codigo === codigo)?.nombre ?? null
  const [claseFiltro, setClaseFiltro] = useState<ClaseParada | "">("")
  const [familiaFiltro, setFamiliaFiltro] = useState<FamiliaParada | "">("")
  const [equipoFiltro, setEquipoFiltro] = useState("")
  const [verInactivos, setVerInactivos] = useState(false)
  const [edicion, setEdicion] = useState<{ tipo: TipoParadaEditable; original?: string } | null>(null)
  const [pestana, setPestana] = useState<"TIPOS" | "EQUIPOS">("TIPOS")
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return catalogo.filter(
      (t) =>
        (verInactivos || t.activo) &&
        (!claseFiltro || t.clase === claseFiltro) &&
        (!familiaFiltro || t.familia === familiaFiltro) &&
        (!equipoFiltro || t.equipoCodigo === equipoFiltro) &&
        (!q ||
          t.nombre.toLowerCase().includes(q) ||
          (nombreEquipo(t.equipoCodigo) ?? "").toLowerCase().includes(q) ||
          codigoPlanilla(t, "LINEA_1").toLowerCase().includes(q)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo, equipos, busqueda, claseFiltro, familiaFiltro, equipoFiltro, verInactivos])

  // Por familia (Programada, Suministro, Equipo de Proceso…) y un grupo por equipo de línea. Con una búsqueda o filtro activo se abren todos.
  const grupos = useMemo(() => agruparTipos(filas, equipos), [filas, equipos])
  const hayFiltro = busqueda.trim() !== "" || claseFiltro !== "" || familiaFiltro !== "" || equipoFiltro !== ""
  const cerradosEfectivos = hayFiltro ? new Set<string>() : cerrados
  function alternarGrupo(clave: string) {
    setCerrados((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(clave)) nuevo.delete(clave)
      else nuevo.add(clave)
      return nuevo
    })
  }

  return (
    <AppShell title="Catálogo de Paradas" description="Tipos de parada y equipos que ofrece el Registro">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex gap-1.5">
          <Button size="sm" variant={pestana === "TIPOS" ? "default" : "outline"} onClick={() => setPestana("TIPOS")}>
            Tipos de parada
          </Button>
          <Button size="sm" variant={pestana === "EQUIPOS" ? "default" : "outline"} onClick={() => setPestana("EQUIPOS")}>
            Equipos (mecánicas)
          </Button>
        </div>

        {pestana === "EQUIPOS" ? (
          <CatalogoEquipos usuario={usuario} />
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nombre o código…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="h-9 w-full sm:w-64"
          />
          <select
            className={`${selectClase} sm:w-44`}
            value={claseFiltro}
            onChange={(e) => setClaseFiltro(e.target.value as ClaseParada | "")}
          >
            <option value="">Todas las clases</option>
            {CLASES_PARADA.map((c) => (
              <option key={c} value={c}>
                {NOMBRE_CLASE[c]}
              </option>
            ))}
          </select>
          <select
            className={`${selectClase} sm:w-52`}
            value={familiaFiltro}
            onChange={(e) => setFamiliaFiltro(e.target.value as FamiliaParada | "")}
          >
            <option value="">Todas las familias</option>
            {FAMILIAS.map((f) => (
              <option key={f} value={f}>
                {NOMBRE_FAMILIA[f]}
              </option>
            ))}
          </select>
          <select className={`${selectClase} sm:w-48`} value={equipoFiltro} onChange={(e) => setEquipoFiltro(e.target.value)}>
            <option value="">Todos los equipos</option>
            {equipos.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Mostrar inactivos
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setEdicion({ tipo: vacio() })}>
              <Plus className="size-4" /> Nuevo tipo
            </Button>
          </div>
        </div>

        {(errorCatalogo || errorAccion) && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-foreground">
            {errorAccion ?? errorCatalogo}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {filas.length} de {catalogo.length} tipos. Solo las paradas Programadas tienen tiempo guía; se hereda a cada
          parada al registrarla y cambiarlo no modifica las ya guardadas. El código mostrado es el de la Línea 1: en las
          otras líneas solo cambia el número (los que no llevan «L» son iguales en todas). Si un tipo existe solo en algunas líneas, se muestra su código en la primera de ellas.
        </p>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Clase</th>
                <th className="px-3 py-2 font-medium">Familia</th>
                <th className="px-3 py-2 font-medium">Equipo</th>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 text-right font-medium">Tiempo guía</th>
                <th className="px-3 py-2 font-medium">Activo</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const cerrado = cerradosEfectivos.has(g.clave)
                return (
                  <Fragment key={g.clave}>
                    <tr className="border-t border-border bg-muted/40">
                      <td colSpan={8} className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => alternarGrupo(g.clave)}
                          className="flex w-full items-center gap-1.5 text-left text-xs font-semibold tracking-wide text-foreground uppercase"
                        >
                          {cerrado ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          {g.titulo}
                          <span className="font-normal text-muted-foreground normal-case">· {g.tipos.length}</span>
                        </button>
                      </td>
                    </tr>
                    {!cerrado &&
                      g.tipos.map((t) => (
                        <tr key={t.codigo} className={`border-t border-border ${t.activo ? "" : "text-muted-foreground opacity-60"}`}>
                          <td className="px-3 py-2">
                            {t.nombre}
                            {t.lineas && t.lineas.length > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                solo {[...new Set(t.lineas.map((l) => "L" + l.linea.replace(/^LINEA_T?/, "")))].join(" · ")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{NOMBRE_CLASE[t.clase]}</td>
                          <td className="px-3 py-2">{NOMBRE_FAMILIA[t.familia]}</td>
                          <td className="px-3 py-2">{nombreEquipo(t.equipoCodigo) ?? "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {t.prefijoPlanilla ? codigoPlanilla(t, primeraLinea(t), "ASEPTICO") : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {t.clase === "PROGRAMADA" && t.tiempoGuiaMin != null ? fmtDuracion(t.tiempoGuiaMin) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={t.activo}
                              onChange={async (e) => setErrorAccion(await cambiarActivo(usuario, t.codigo, e.target.checked, PAGINA))}
                              aria-label={`Activo: ${t.nombre}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button variant="ghost" size="sm" onClick={() => setEdicion({ tipo: { ...t }, original: t.codigo })}>
                              <Pencil className="size-4" /> Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No hay tipos que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>

      {edicion && <EditorTipo usuario={usuario} inicial={edicion.tipo} original={edicion.original} onCerrar={() => setEdicion(null)} />}

    </AppShell>
  )
}

function EditorTipo({
  usuario,
  inicial,
  original,
  onCerrar,
}: {
  usuario: string
  inicial: TipoParadaEditable
  original?: string
  onCerrar: () => void
}) {
  const equipos = useEquiposParadas()
  const [t, setT] = useState(inicial)
  const [guiaTexto, setGuiaTexto] = useState(inicial.tiempoGuiaMin != null ? String(inicial.tiempoGuiaMin) : "")
  // Líneas donde existe el tipo: clave "AREA|LINEA" → secuencia del código en esa línea ("" = la normal). Sin ninguna = todas.
  const [lineasSel, setLineasSel] = useState<Record<string, string>>(() =>
    Object.fromEntries((inicial.lineas ?? []).map((l) => [l.area + "|" + l.linea, l.secuencia != null ? String(l.secuencia) : ""])),
  )
  // Presentaciones (ml) por línea: el tipo existe en esa línea solo con ellas. Vacío = todas.
  const [presSel, setPresSel] = useState<Record<string, string>>(() =>
    Object.fromEntries((inicial.lineas ?? []).map((l) => [l.area + "|" + l.linea, (l.presentaciones ?? []).join(", ")])),
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const esNuevo = original === undefined

  const set = <K extends keyof TipoParadaEditable>(k: K, v: TipoParadaEditable[K]) => setT((x) => ({ ...x, [k]: v }))

  async function guardar() {
    const guia = guiaTexto.trim() === "" ? null : Number(guiaTexto.replace(",", "."))
    const tipo: TipoParadaEditable = {
      ...t,
      nombre: t.nombre.trim(),
      codigo: esNuevo ? t.codigo.trim() || codigoDesdeNombre(t.nombre) : t.codigo,
      prefijoPlanilla: t.prefijoPlanilla.trim().toUpperCase(),
      tiempoGuiaMin: t.familia === "PROGRAMADA" ? guia : null,
      equipoCodigo: t.equipoCodigo || null,
      lineas: Object.entries(lineasSel).map(([k, s]) => {
        const [area, linea] = k.split("|")
        const n = parseInt(s, 10)
        return { area, linea, secuencia: Number.isFinite(n) ? n : null, presentaciones: parsearPresentaciones(presSel[k] ?? "") }
      }),
      // la clase sale de la familia: Programada y Ocioso tienen la suya; el resto es No programada
      clase: t.familia === "PROGRAMADA" ? "PROGRAMADA" : t.familia === "OCIOSO" ? "OCIOSO" : "NO_PROGRAMADA",
    }
    const msg = validarTipo(tipo, original)
    if (msg) return setError(msg)
    setGuardando(true)
    const errorServidor = await guardarTipo(usuario, tipo, original, PAGINA)
    setGuardando(false)
    if (errorServidor) return setError(errorServidor)
    onCerrar()
  }

  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esNuevo ? "Nuevo tipo de parada" : "Editar tipo de parada"}</DialogTitle>
          <DialogDescription>
            Nombre, familia, equipo y código de planilla. La clase se deduce de la familia. Solo las Programadas llevan tiempo guía; «Tiempo ocioso» no lleva código.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="cp-nombre">Nombre</Label>
            <Input id="cp-nombre" value={t.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cp-familia">Familia</Label>
            <select
              id="cp-familia"
              className={selectClase}
              value={t.familia}
              onChange={(e) => set("familia", e.target.value as FamiliaParada)}
            >
              {FAMILIAS.map((f) => (
                <option key={f} value={f}>
                  {NOMBRE_FAMILIA[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="cp-equipo">Equipo (opcional)</Label>
            <select
              id="cp-equipo"
              className={selectClase}
              value={t.equipoCodigo ?? ""}
              onChange={(e) => set("equipoCodigo", e.target.value || null)}
            >
              <option value="">Ninguno</option>
              {equipos.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.nombre}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">La falla solo aparece en las líneas donde existe el equipo.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {t.familia === "PROGRAMADA" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="cp-guia">Tiempo guía (min)</Label>
                <Input
                  id="cp-guia"
                  inputMode="decimal"
                  placeholder="Sin guía"
                  value={guiaTexto}
                  onChange={(e) => setGuiaTexto(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor="cp-prefijo">Prefijo de planilla{t.familia === "OCIOSO" ? " (opcional)" : ""}</Label>
              <Input
                id="cp-prefijo"
                placeholder="Ej. PP, LNPE"
                value={t.prefijoPlanilla}
                onChange={(e) => set("prefijoPlanilla", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cp-sec">Secuencia</Label>
              <Input
                id="cp-sec"
                inputMode="numeric"
                placeholder="Ninguna"
                value={t.secuenciaPlanilla ?? ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  set("secuenciaPlanilla", Number.isFinite(n) ? n : null)
                }}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={t.codigoConLinea !== false}
              onChange={(e) => set("codigoConLinea", e.target.checked)}
            />
            El código lleva el número de línea (L1, L2, L3)
          </label>

          <div className="flex flex-col gap-1.5">
            <Label>Solo en estas líneas (sin marcar = todas)</Label>
            {AREAS_EQUIPOS.map((a) => (
              <div key={a.codigo} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-16 text-sm font-medium text-foreground">{a.nombre}</span>
                {LINEAS_EQUIPOS.map((l) => {
                  const k = a.codigo + "|" + l
                  const activa = k in lineasSel
                  return (
                    <span key={k} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={activa}
                        onChange={() =>
                          setLineasSel((prev) => {
                            const nuevo = { ...prev }
                            if (k in nuevo) delete nuevo[k]
                            else nuevo[k] = ""
                            return nuevo
                          })
                        }
                      />
                      {nombreLinea(l)}
                      {activa && (
                        <>
                          <Input
                            className="h-7 w-16"
                            inputMode="numeric"
                            placeholder="N.º"
                            value={lineasSel[k]}
                            onChange={(e) => setLineasSel((prev) => ({ ...prev, [k]: e.target.value }))}
                          />
                          <Input
                            className="h-7 w-24"
                            inputMode="numeric"
                            placeholder="ml (todas)"
                            value={presSel[k] ?? ""}
                            onChange={(e) => setPresSel((prev) => ({ ...prev, [k]: e.target.value }))}
                          />
                        </>
                      )}
                    </span>
                  )
                })}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              El N.º es la secuencia del código en esa línea, si difiere de la normal (por ejemplo OPL2-3 en vez de OPL1-2). Las presentaciones (ml) limitan el tipo a lo que corre en esa línea; vacío = todas.
            </p>
          </div>

          {esNuevo && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="cp-codigo">Código interno</Label>
              <Input
                id="cp-codigo"
                placeholder={codigoDesdeNombre(t.nombre) || "Se genera del nombre"}
                value={t.codigo}
                onChange={(e) => set("codigo", e.target.value.toUpperCase().replace(/\s+/g, "_"))}
              />
              <p className="text-xs text-muted-foreground">No se puede cambiar después de crearlo.</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Código de planilla resultante (Línea 1):{" "}
            <span className="font-mono">
              {t.prefijoPlanilla.trim() ? codigoPlanilla({ ...t, prefijoPlanilla: t.prefijoPlanilla.trim().toUpperCase() }, "LINEA_1") : "—"}
            </span>
          </p>

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
