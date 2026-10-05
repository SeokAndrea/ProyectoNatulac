import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { ProgramacionItem } from "./calculosPanel"

/**
 * Carrusel del banner: rota los renglones del plan del día cada 2.5s,
 * mostrando "SABOR · 1000 ml  hecho / plan" (plan del módulo
 * Programación; hecho del Producto Terminado del turno).
 */
export function ProgramacionCarrusel({ items }: { items: ProgramacionItem[] }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 2500)
    return () => clearInterval(t)
  }, [items.length])

  if (items.length === 0) {
    return (
      <div>
        <p className="text-lg font-bold uppercase tracking-[0.14em] text-muted-foreground">Por programar</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Sin programación cargada para hoy</p>
      </div>
    )
  }

  const activo = idx % items.length
  const item = items[activo]

  return (
    <div>
      <div key={activo} className="carrusel-slide">
        <p className="truncate text-sm font-semibold uppercase tracking-wide text-primary">
          {item.sabor}
          {item.presentacionMl !== null && <span className="font-medium text-muted-foreground"> · {item.presentacionMl} ml</span>}
        </p>
        <p className="num mt-0.5 text-2xl font-bold leading-none tracking-tight text-foreground">
          {item.hecho.toLocaleString("es-CO")}
          <span className="text-base font-semibold text-muted-foreground">
            {" / "}
            {item.plan !== null ? item.plan.toLocaleString("es-CO") : "—"}
          </span>
        </p>
      </div>
      {items.length > 1 && (
        <div className="mt-2 flex justify-center gap-1">
          {items.map((it, i) => (
            <span key={it.sabor} className={cn("size-1 rounded-full transition-colors", i === activo ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      )}
    </div>
  )
}
