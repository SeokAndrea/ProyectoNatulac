import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Tarjeta del Panel: cabecera con ícono, título y un dato a la derecha (`meta`). */
export function PanelCard({
  icon: Icon,
  titulo,
  meta,
  descripcion,
  className,
  children,
}: {
  icon: LucideIcon
  titulo: string
  meta?: string
  descripcion?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("shadow-panel gap-0 overflow-hidden border-border py-0", className)}>
      <div className="flex items-start justify-between gap-2 border-b border-border/70 bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Icon className="size-4 text-primary" />
            {titulo}
          </p>
          {descripcion && <p className="mt-1 truncate text-xs text-muted-foreground/80">{descripcion}</p>}
        </div>
        {meta && (
          <span className="num shrink-0 rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground">
            {meta}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  )
}

/** Separador con título ("Detalle del turno", "Histórico"). */
export function TituloSeccion({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
