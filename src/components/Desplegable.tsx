import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

/**
 * Una tarjeta que se despliega con un clic: cerrada por defecto, con su
 * título y un resumen a la derecha. La página se ve limpia, solo los
 * títulos (dueña, 2026-10-15: Panel de Paradas, lo ve la presidencia;
 * 2026-10-20: Resumen Diario).
 */
export function Desplegable({
  titulo,
  resumen,
  inicial = false,
  id,
  children,
}: {
  titulo: string
  resumen?: ReactNode
  /** Abierta al entrar (ej. el mensaje de WhatsApp del Resumen Diario). */
  inicial?: boolean
  id?: string
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(inicial)
  return (
    <section id={id} className="flex flex-col rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={abierto}
      >
        <span className="text-base font-semibold text-foreground">{titulo}</span>
        <span className="flex items-center gap-2 text-sm text-foreground">
          {resumen}
          <ChevronDown className={`size-5 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </span>
      </button>
      {abierto && <div className="flex flex-col gap-3 border-t border-border px-4 py-3">{children}</div>}
    </section>
  )
}
