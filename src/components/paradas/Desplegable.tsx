import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

/**
 * Un renglón del Panel de Paradas que se despliega con un clic: cerrado por
 * defecto, con su título y un resumen a la derecha. Al abrir el panel se ve
 * limpio, solo los títulos (dueña, 2026-10-15: lo va a ver la presidencia).
 */
export function Desplegable({ titulo, resumen, children }: { titulo: string; resumen?: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <section className="flex flex-col rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={abierto}
      >
        <span className="text-base font-semibold text-foreground">{titulo}</span>
        <span className="flex items-center gap-2 text-sm text-foreground">
          {resumen}
          <ChevronDown className={`size-5 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </span>
      </button>
      {abierto && <div className="flex flex-col gap-3 border-t border-border px-4 py-3">{children}</div>}
    </section>
  )
}
