import { fmtDuracion, nombreLineaParada, type GrupoTipo } from "@/lib/paradas"
import { cn } from "@/lib/utils"
import { colorLinea } from "./colores"

/** Los minutos en horas cuando pasan de 60 («24 h 10 min»), para leerlos de lejos. */
const texto = (item: GrupoTipo, metrica: "veces" | "minutos") => (metrica === "minutos" ? fmtDuracion(Math.round(item.minutos)) : `${item.veces}×`)

/** Todos los Top del panel muestran 3 renglones, aunque falten datos: las tarjetas quedan parejas (dueña, 2026-10-31). */
export const FILAS_TOP = 3

/**
 * Ranking corto con su barrita. El color de la barra: el de la línea de cada
 * fila (`porLinea`), uno fijo (`color`, ej. el de la columna de la línea) o
 * el del texto alrededor. `conAmbas`: al lado de la medida principal va la
 * otra («38 min · 3×»). Siempre FILAS_TOP renglones; los que faltan, «—».
 */
export function RankList({
  items,
  metrica,
  compacto = false,
  conAmbas = false,
  color,
  porLinea = false,
}: {
  items: GrupoTipo[]
  metrica: "veces" | "minutos"
  compacto?: boolean
  conAmbas?: boolean
  color?: string
  porLinea?: boolean
}) {
  const max = Math.max(1, ...items.map((i) => i[metrica]))
  const filas = items.slice(0, FILAS_TOP)
  const vacias = FILAS_TOP - filas.length
  return (
    <ol className={compacto ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      {filas.map((item, index) => (
        <li key={item.codigo}>
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="num w-4 text-muted-foreground">{index + 1}</span>
            <span
              className="min-w-0 flex-1 truncate font-medium text-foreground"
              title={item.lineaCodigo ? `${item.nombre} (${nombreLineaParada(item.lineaCodigo)})` : item.nombre}
            >
              {item.nombre}
              {item.lineaCodigo && <span className="font-normal text-muted-foreground"> ({nombreLineaParada(item.lineaCodigo)})</span>}
            </span>
            <span className="num font-semibold text-foreground">
              {texto(item, metrica)}
              {conAmbas && <span className="font-normal text-muted-foreground"> · {texto(item, metrica === "minutos" ? "veces" : "minutos")}</span>}
            </span>
          </div>
          <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-current"
              style={{ width: `${Math.max(8, (item[metrica] / max) * 100)}%`, background: porLinea && item.lineaCodigo ? colorLinea(item.lineaCodigo) : color }}
            />
          </div>
        </li>
      ))}
      {Array.from({ length: vacias }, (_, i) => (
        <li key={`vacia-${i}`} aria-hidden>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="num w-4">{filas.length + i + 1}</span>
            <span>—</span>
          </div>
          <div className="ml-6 h-1.5 rounded-full bg-muted" />
        </li>
      ))}
    </ol>
  )
}

export function RankCard({
  titulo,
  tono,
  items,
  metrica,
  porLinea = false,
}: {
  titulo: string
  tono: "info" | "danger"
  items: GrupoTipo[]
  metrica: "veces" | "minutos"
  porLinea?: boolean
}) {
  return (
    <section className={cn("rounded-xl border border-t-4 bg-card p-4 shadow-sm", tono === "info" ? "border-t-info text-info" : "border-t-danger text-danger")}>
      <h2 className="mb-4 text-sm font-semibold text-card-foreground">{titulo}</h2>
      <div className={tono === "info" ? "text-info" : "text-danger"}>
        <RankList items={items} metrica={metrica} porLinea={porLinea} />
      </div>
    </section>
  )
}
