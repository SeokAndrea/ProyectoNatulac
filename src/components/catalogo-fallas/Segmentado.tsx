import { cn } from "@/lib/utils"

/**
 * Elegir una opción entre pocas (clase de la falla, tipo de equipo). Botones
 * pegados con esquinas casi rectas; la elegida va en tinta pizarra.
 */
export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  deshabilitado,
}: {
  etiqueta: string
  opciones: { valor: T; texto: string }[]
  valor: T
  onCambiar: (v: T) => void
  deshabilitado?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex w-full min-w-0 rounded-lg border border-input p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          disabled={deshabilitado}
          onClick={() => onCambiar(o.valor)}
          className={cn(
            "min-w-0 flex-auto truncate rounded-md px-1.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 pointer-coarse:py-2.5",
            valor === o.valor ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}
