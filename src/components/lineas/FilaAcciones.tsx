import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Botones de una tarjeta de línea en una sola fila (dueña, 2026-10-25: que no
 * se apilen debajo de cada tarjeta). En el teléfono se desliza con el dedo y
 * el borde derecho se desvanece para que se note que hay más; con espacio
 * (sm en adelante) se acomodan en varias filas como siempre.
 */
export function FilaAcciones({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "-mx-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] *:shrink-0 *:snap-start [&::-webkit-scrollbar]:hidden",
        "mask-r-from-85% sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 sm:mask-none",
        className,
      )}
    >
      {children}
    </div>
  )
}
