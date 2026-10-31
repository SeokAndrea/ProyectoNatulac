import { useCatalogosLive } from "@/lib/catalogosLive"
import { cn } from "@/lib/utils"

/** Las líneas donde está un equipo de línea: un botón por línea, se prende y se apaga. */
export function SelectorLineas({ elegidas, onCambiar, deshabilitado }: { elegidas: string[]; onCambiar: (ids: string[]) => void; deshabilitado?: boolean }) {
  const { lineasTodas } = useCatalogosLive()
  const activas = lineasTodas.filter((l) => l.activo)
  const alternar = (id: string) => onCambiar(elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id])

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">Líneas donde está</span>
      <div className="flex flex-wrap gap-1.5">
        {activas.map((l) => {
          const prendida = elegidas.includes(l.id)
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={prendida}
              disabled={deshabilitado}
              onClick={() => alternar(l.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 pointer-coarse:py-2",
                prendida ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-muted",
              )}
            >
              {l.nombre}
            </button>
          )
        })}
      </div>
    </div>
  )
}
