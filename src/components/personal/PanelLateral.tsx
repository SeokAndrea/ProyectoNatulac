import { X } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

/** Panel de la derecha (pantalla completa en el teléfono) para los formularios de Áreas y puestos. */
export function PanelLateral({ etiqueta, titulo, onCerrar, children }: { etiqueta: string; titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <aside aria-label={titulo} className="flex flex-col rounded-xl border border-border bg-card max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:overflow-y-auto max-lg:rounded-none lg:sticky lg:top-4 lg:w-96 lg:shrink-0 xl:w-[26rem]">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{etiqueta}</p>
          <h2 className="truncate text-lg font-semibold text-foreground">{titulo}</h2>
        </div>
        <Button variant="outline" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
          <X className="size-4" />
        </Button>
      </div>
      {children}
    </aside>
  )
}

export function Campo({ etiqueta, id, children }: { etiqueta: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {etiqueta}
      </label>
      {children}
    </div>
  )
}
