import { Link } from "react-router-dom"
import { Plus, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ItemMenuArea {
  codigo: string
  nombre: string
  activo: boolean
  personas: number
}

/** Áreas a la izquierda en PC (fila deslizable en el teléfono); abajo, el enlace a Áreas y puestos. */
export function MenuAreas({ areas, actual, onElegir, onNueva }: { areas: ItemMenuArea[]; actual: string; onElegir: (codigo: string) => void; onNueva?: () => void }) {
  return (
    <nav aria-label="Áreas" className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
      <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-2">
        <p className="hidden px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-foreground uppercase lg:block">Áreas</p>
        {areas.map((a) => {
          const activo = a.codigo === actual
          return (
            <button
              key={a.codigo}
              type="button"
              aria-current={activo ? "page" : undefined}
              onClick={() => onElegir(a.codigo)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm whitespace-nowrap transition-colors pointer-coarse:h-11",
                "max-lg:border max-lg:border-border max-lg:bg-card",
                activo ? "bg-muted font-semibold text-foreground max-lg:border-primary" : "font-medium text-foreground hover:bg-muted/60",
                !a.activo && !activo && "italic opacity-70",
              )}
            >
              <span className="flex-1">{a.nombre}</span>{" "}
              <span className="text-xs font-normal text-foreground tabular-nums">{a.personas}</span>
            </button>
          )
        })}
        {onNueva && (
          <button
            type="button"
            onClick={onNueva}
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium whitespace-nowrap text-info-foreground hover:bg-muted/60 max-lg:border max-lg:border-border max-lg:bg-card pointer-coarse:h-11"
          >
            <Plus className="size-4 shrink-0" />
            Área
          </button>
        )}
        <Link
          to="/areas-puestos"
          className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-info-foreground hover:bg-muted/60 max-lg:border max-lg:border-border max-lg:bg-card max-lg:whitespace-nowrap lg:mt-2 pointer-coarse:min-h-11"
        >
          <Settings2 className="size-4 shrink-0" />
          Administración › Áreas y puestos
        </Link>
      </div>
    </nav>
  )
}
