import { fmtDuracion, nombreLineaParada } from "@/lib/paradas"
import { colorLinea } from "./colores"

/** Corto, para que quepa arriba de la columna: «5 min» o «1,2 h». */
const tiempoCorto = (min: number) => (min < 60 ? `${Math.round(min)} min` : `${(min / 60).toFixed(1).replace(".", ",")} h`)

interface Linea {
  linea: string
  veces: number
  minutos: number
}

/**
 * ¿Qué línea falla más? Las fallas no programadas de las 3 líneas en dos
 * gráficos de columnas lado a lado (una medida cada uno, nunca dos escalas
 * juntas): Frecuencia y Tiempo. Cada línea con su color y siempre en su lugar
 * (L1, L2, L3): la altura dice cuál es mayor (dueña, 2026-10-31: verticales,
 * para que no se vea todo igual).
 */
export function BarrasLineas({ lineas }: { lineas: Linea[] }) {
  const vacio = lineas.every((l) => l.veces === 0)
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-card-foreground">¿Qué línea falla más?</h2>
      {vacio ? (
        <p className="text-xs text-muted-foreground">Sin fallas no programadas.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Columnas titulo="Frecuencia" lineas={lineas} valor={(l) => l.veces} texto={(l) => `${l.veces}×`} detalle={(l) => `${l.veces} fallas`} />
          <Columnas titulo="Tiempo" lineas={lineas} valor={(l) => l.minutos} texto={(l) => tiempoCorto(l.minutos)} detalle={(l) => fmtDuracion(Math.round(l.minutos))} />
        </div>
      )}
    </section>
  )
}

function Columnas({
  titulo,
  lineas,
  valor,
  texto,
  detalle,
}: {
  titulo: string
  lineas: Linea[]
  valor: (l: Linea) => number
  /** Arriba de la columna, corto. */
  texto: (l: Linea) => string
  /** Al pasar el mouse y para lectores de pantalla, completo. */
  detalle: (l: Linea) => string
}) {
  const max = Math.max(1, ...lineas.map(valor))
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1.5">
      <figcaption className="text-xs font-bold text-muted-foreground uppercase">{titulo}</figcaption>
      <div className="flex h-28 items-end gap-2 border-b border-border" role="img" aria-label={`${titulo}: ${lineas.map((l) => `${nombreLineaParada(l.linea)} ${detalle(l)}`).join(", ")}`}>
        {lineas.map((l) => (
          <div key={l.linea} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${nombreLineaParada(l.linea)}: ${detalle(l)}`}>
            <span className="num text-center text-xs leading-tight font-semibold whitespace-nowrap text-foreground">{texto(l)}</span>
            <span className="w-full rounded-t-[4px]" style={{ height: `${Math.max(2, (valor(l) / max) * 100)}%`, maxHeight: "calc(100% - 1.25rem)", background: colorLinea(l.linea) }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {lineas.map((l) => (
          <span key={l.linea} className="num flex-1 text-center text-xs text-muted-foreground">
            L{l.linea.replace(/\D/g, "")}
          </span>
        ))}
      </div>
    </figure>
  )
}
