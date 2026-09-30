import { useState } from "react"
import { Input } from "@/components/ui/input"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { equiposDeLinea, tiposDeLinea, type EquipoParada } from "@/lib/paradasEquipos"
import { agruparTipos } from "@/lib/paradasGrupos"
import { codigoPlanilla, fmtDuracion, TIPO_POR_CLASIFICAR, type TipoParada } from "@/lib/paradas"

/** Sin tildes ni mayúsculas: "logistica" encuentra "Logística". */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * Buscador del catálogo de paradas (Registrar Paradas). Solo ofrece lo que
 * aplica a la línea (y a la presentación que corre, si hay corrida). Acepta
 * varias palabras en cualquier orden ("cambio sabor", "a3f mordaza") y no
 * distingue tildes ni mayúsculas. No deja escribir un tipo nuevo.
 */
export function BuscadorTipoParada({
  lineaCodigo,
  area,
  equipos,
  presentacionMl,
  permitir,
  onElegir,
}: {
  lineaCodigo: string
  area?: string | null
  equipos: EquipoParada[]
  presentacionMl?: number | null
  /** Qué tipos se ofrecen. "Parada por clasificar" nunca se ofrece: la crea Líneas. */
  permitir?: (tipo: TipoParada) => boolean
  onElegir: (tipo: TipoParada | null) => void
}) {
  const [texto, setTexto] = useState("")
  const [abierto, setAbierto] = useState(false)
  const [elegido, setElegido] = useState<TipoParada | null>(null)
  const [equipoFiltro, setEquipoFiltro] = useState("")

  const catalogo = tiposDeLinea(
    useTiposActivos().filter((t) => t.codigo !== TIPO_POR_CLASIFICAR && (permitir ? permitir(t) : true)),
    equipos,
    area,
    lineaCodigo,
    presentacionMl,
  )
  const equiposLinea = equiposDeLinea(equipos, area, lineaCodigo, presentacionMl).filter((e) =>
    catalogo.some((t) => t.equipoCodigo === e.codigo),
  )
  const nombreEquipo = (t: TipoParada) => equipos.find((e) => e.codigo === t.equipoCodigo)?.nombre ?? null
  const palabras = normalizar(texto.trim()).split(/\s+/).filter(Boolean)
  const sugerencias = catalogo.filter((t) => {
    if (equipoFiltro && (equipoFiltro === "__SIN" ? t.equipoCodigo : t.equipoCodigo !== equipoFiltro)) return false
    const donde = normalizar(`${t.nombre} ${nombreEquipo(t) ?? ""} ${codigoPlanilla(t, lineaCodigo, area)}`)
    return palabras.every((p) => donde.includes(p))
  })

  return (
    <div className="relative flex flex-col gap-1.5">
      {equiposLinea.length > 0 && (
        <select
          aria-label="Filtrar por equipo"
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          value={equipoFiltro}
          onChange={(e) => setEquipoFiltro(e.target.value)}
        >
          <option value="">Todos los equipos y tipos</option>
          <option value="__SIN">Programadas, externas, operacionales y ocioso</option>
          {equiposLinea.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.nombre}
            </option>
          ))}
        </select>
      )}
      <Input
        placeholder="Busca por nombre, equipo o código"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          if (elegido) {
            setElegido(null)
            onElegir(null)
          }
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="h-9"
      />
      {abierto && (texto.trim() !== "" || equipoFiltro !== "") && (
        <ul className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card shadow-md">
          {sugerencias.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ningún tipo del catálogo coincide.</li>
          ) : (
            agruparTipos(sugerencias, equipos).flatMap((g) => [
              <li
                key={g.clave}
                className="sticky top-0 bg-muted px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {g.titulo}
              </li>,
              ...g.tipos.map((t) => (
                <li key={t.codigo}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setTexto((nombreEquipo(t) ? nombreEquipo(t) + " · " : "") + t.nombre)
                      setElegido(t)
                      setAbierto(false)
                      onElegir(t)
                    }}
                  >
                    <span className="min-w-0 truncate">
                      {nombreEquipo(t) ? <span className="text-muted-foreground">{nombreEquipo(t)} · </span> : null}
                      {t.nombre}
                      {t.tiempoGuiaMin != null && (
                        <span className="ml-2 text-xs text-muted-foreground">guía {fmtDuracion(t.tiempoGuiaMin)}</span>
                      )}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {codigoPlanilla(t, lineaCodigo, area) || "—"}
                    </span>
                  </button>
                </li>
              )),
            ])
          )}
        </ul>
      )}
      {!elegido && texto.trim() !== "" && !abierto && (
        <p className="text-xs text-warning-foreground">Elige un tipo de la lista: no se puede escribir uno nuevo.</p>
      )}
    </div>
  )
}
