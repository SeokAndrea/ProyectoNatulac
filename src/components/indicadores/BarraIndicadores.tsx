import { Pencil } from "lucide-react"
import { nombreMes } from "@/lib/indicadores/calculos"
import type { ModoMes } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"
import { SECCIONES, type Seccion } from "@/components/indicadores/secciones"

const chip = "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[12.5px] font-semibold tracking-wide"
const activo = "border-primary bg-primary text-primary-foreground"

/** Filtros: línea o semielaborado y el mes. La analista ve además el modo del mes (AUTOMÁTICO / MANUAL) y el botón para cargar datos. */
export function BarraIndicadores({
  seccion,
  onSeccion,
  mes,
  opcionesMes,
  onMes,
  modo,
  onModo,
  onCargar,
  puedeEditar,
  cambiandoModo,
}: {
  seccion: Seccion
  onSeccion: (s: Seccion) => void
  mes: string
  opcionesMes: string[]
  onMes: (m: string) => void
  modo: ModoMes
  onModo: (m: ModoMes) => void
  onCargar: () => void
  puedeEditar: boolean
  cambiandoModo: boolean
}) {
  return (
    <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {SECCIONES.map((s) => (
        <button key={s.valor} type="button" aria-pressed={seccion === s.valor} onClick={() => onSeccion(s.valor)} className={cn(chip, seccion === s.valor && activo)}>
          {s.valor !== "semi" && <span className="size-2.5 rounded-full" style={{ background: `var(--ind-l${s.valor})` }} />}
          {s.texto}
        </button>
      ))}
      <select aria-label="Mes" value={mes} onChange={(e) => onMes(e.target.value)} className={cn(chip, "pr-2")}>
        {opcionesMes.map((m) => (
          <option key={m} value={m}>
            {nombreMes(m).toUpperCase()} {m.slice(0, 4)}
          </option>
        ))}
      </select>
      {/* El modo del mes y la carga a mano son solo de la analista (dueña, 2026-10-14). */}
      {puedeEditar && (
        <div role="group" aria-label="Origen de los datos del mes" className="inline-flex rounded-full border bg-card p-0.5">
          {(["AUTO", "MANUAL"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              disabled={cambiandoModo}
              onClick={() => modo !== m && onModo(m)}
              className={cn("rounded-full px-3 py-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground disabled:cursor-default", modo === m && activo)}
            >
              {m === "AUTO" ? "AUTOMÁTICO" : "MANUAL"}
            </button>
          ))}
        </div>
      )}
      {modo === "MANUAL" && puedeEditar && (
        <button type="button" onClick={onCargar} className={cn(chip, "border-dashed border-primary")}>
          <Pencil className="size-3.5" /> Cargar datos de {nombreMes(mes)}
        </button>
      )}
    </div>
  )
}
