import { cn } from "@/lib/utils"

export interface ItemMenuSeccion {
  id: string
  titulo: string
  /** Registros activos (null mientras carga; undefined = sin número). */
  cantidad?: number | null
}

/** Secciones de Edición de Datos: columna a la izquierda en PC, fila deslizable arriba en el teléfono. */
export function MenuSecciones({
  grupos,
  actual,
  onElegir,
}: {
  grupos: { titulo: string; items: ItemMenuSeccion[] }[]
  actual: string
  onElegir: (id: string) => void
}) {
  return (
    <nav aria-label="Secciones" className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
      <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-2">
        {grupos.map((g) => (
          <div key={g.titulo} className="flex gap-1 lg:flex-col">
            <p className="hidden px-2.5 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:block">{g.titulo}</p>
            {g.items.map((item) => {
              const activo = item.id === actual
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={activo ? "page" : undefined}
                  onClick={() => onElegir(item.id)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 pointer-coarse:h-11 rounded-lg px-3 text-left text-sm whitespace-nowrap transition-colors",
                    "max-lg:border max-lg:border-border max-lg:bg-card",
                    activo ? "bg-muted font-semibold text-foreground max-lg:border-primary" : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className="flex-1">{item.titulo}</span>
                  {item.cantidad !== undefined && (
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">{item.cantidad ?? "…"}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
