import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { buscarFallas, fallasDeLinea, type OpcionFalla } from "@/lib/catalogoFallas/paradas"
import { useCatalogoFallas } from "@/lib/catalogoFallas/useCatalogoFallas"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { esFamiliaDeEquipo } from "@/lib/otrasParadas"
import { codigoPlanilla, fmtDuracion, TIPO_FALLA_SIN_ESPECIFICAR, TIPO_POR_CLASIFICAR, type TipoParada } from "@/lib/paradas"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { tiposDeLinea, useEquiposParadas } from "@/lib/paradasEquipos"
import { tienePalabras } from "@/lib/texto"
import { selectClase } from "./estilos"

/** Lo que se eligió: una falla de equipo del catálogo modular, o una de las otras paradas (PP, LNPE, OP…). */
export type Eleccion = { falla: OpcionFalla; tipo?: undefined } | { tipo: TipoParada; falla?: undefined }

const OTRAS = "__otras"
const ESPECIALES = new Set([TIPO_POR_CLASIFICAR, TIPO_FALLA_SIN_ESPECIFICAR, "FALLA_EQUIPO"])

/**
 * Buscador de paradas con el catálogo nuevo (switch encendido): una sola caja
 * encuentra las fallas de los equipos de la línea (y de servicios) y las otras
 * paradas. Los chips filtran por equipo de un toque. La lista va dentro de la
 * tarjeta (en el teléfono no tapa nada). `soloFallas`: Mantenimiento.
 */
export function BuscadorParada({
  lineaCodigo,
  area,
  presentacionMl = null,
  soloFallas = false,
  permitirTipo,
  onElegir,
}: {
  lineaCodigo: string
  area: "ASEPTICO" | "PRUEBAS"
  presentacionMl?: number | null
  soloFallas?: boolean
  permitirTipo?: (t: TipoParada) => boolean
  onElegir: (e: Eleccion | null) => void
}) {
  const { catalogo, cargando } = useCatalogoFallas()
  const { lineasTodas } = useCatalogosLive()
  const tiposActivos = useTiposActivos()
  const equiposViejos = useEquiposParadas()
  const [texto, setTexto] = useState("")
  const [filtro, setFiltro] = useState("")
  const [elegido, setElegido] = useState<Eleccion | null>(null)

  const lineaId = lineasTodas.find((l) => l.codigo === lineaCodigo)?.id ?? null
  const opciones = useMemo(() => fallasDeLinea(catalogo, lineaId), [catalogo, lineaId])
  const equipos = useMemo(() => [...new Map(opciones.map((o) => [o.equipo.id, o.equipo])).values()], [opciones])
  const otras = useMemo(
    () =>
      soloFallas
        ? []
        : tiposDeLinea(
            tiposActivos.filter((t) => !esFamiliaDeEquipo(t.familia) && !ESPECIALES.has(t.codigo) && (!permitirTipo || permitirTipo(t))),
            equiposViejos,
            area,
            lineaCodigo,
            presentacionMl,
          ),
    [soloFallas, tiposActivos, permitirTipo, equiposViejos, area, lineaCodigo, presentacionMl],
  )

  const hayFiltro = texto.trim() !== "" || filtro !== ""
  const fallas = !hayFiltro || filtro === OTRAS ? [] : buscarFallas(opciones, texto, filtro)
  const tipos = !hayFiltro || (filtro && filtro !== OTRAS) ? [] : otras.filter((t) => tienePalabras(`${t.nombre} ${codigoPlanilla(t, lineaCodigo, area)}`, texto))

  function elegir(e: Eleccion | null) {
    setElegido(e)
    onElegir(e)
  }

  if (elegido) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary bg-card px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{elegido.falla ? elegido.falla.falla.nombre : elegido.tipo.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {elegido.falla ? `${elegido.falla.subsistema.nombre} · ${elegido.falla.equipo.nombre}` : "Otra parada"}
            {" · "}
            <span className="num">{elegido.falla ? elegido.falla.falla.codigo : codigoPlanilla(elegido.tipo, lineaCodigo, area)}</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => elegir(null)}>
          Cambiar
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {(equipos.length > 0 || otras.length > 0) && (
        <select aria-label="Equipo" className={selectClase} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos los equipos</option>
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
          {otras.length > 0 && <option value={OTRAS}>Otras paradas (no son de equipo)</option>}
        </select>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label={soloFallas ? "Buscar la falla" : "Buscar la falla o la parada"}
          placeholder={soloFallas ? "Busca la falla: presión, cámara…" : "Busca la falla o la parada"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="bg-card pl-8"
        />
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando el catálogo…</p>
      ) : !hayFiltro ? (
        <p className="text-xs text-muted-foreground">
          {opciones.length === 0 ? "Esta línea todavía no tiene fallas en el catálogo nuevo." : "Escribe la falla, o elige el equipo para ver todas sus fallas."}
        </p>
      ) : fallas.length === 0 && tipos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada coincide. Prueba con otra palabra.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card">
          {fallas.length > 0 && <Grupo titulo="Fallas de equipo" />}
          {fallas.map((o) => (
            <Fila key={o.falla.id} titulo={o.falla.nombre} detalle={`${o.subsistema.nombre} · ${o.equipo.nombre}`} codigo={o.falla.codigo} onClick={() => elegir({ falla: o })} />
          ))}
          {tipos.length > 0 && <Grupo titulo="Otras paradas" />}
          {tipos.map((t) => (
            <Fila
              key={t.codigo}
              titulo={t.nombre}
              detalle={t.tiempoGuiaMin != null ? `Guía ${fmtDuracion(t.tiempoGuiaMin)}` : null}
              codigo={codigoPlanilla(t, lineaCodigo, area)}
              onClick={() => elegir({ tipo: t })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Grupo({ titulo }: { titulo: string }) {
  return <p className="sticky top-0 border-b border-border bg-muted px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</p>
}

function Fila({ titulo, detalle, codigo, onClick }: { titulo: string; detalle: string | null; codigo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted pointer-coarse:py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-foreground">{titulo}</span>
        {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
      </span>
      <span className="num shrink-0 text-xs text-muted-foreground">{codigo}</span>
    </button>
  )
}
