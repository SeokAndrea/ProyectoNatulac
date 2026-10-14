import { Pencil } from "lucide-react"
import { capital, nombreMes } from "@/lib/indicadores/calculos"
import type { ModoMes } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"

export type Seccion = "1" | "2" | "3" | "semi"

const SECCIONES: { valor: Seccion; texto: string }[] = [
  { valor: "1", texto: "LÍNEA 1" },
  { valor: "2", texto: "LÍNEA 2" },
  { valor: "3", texto: "LÍNEA 3" },
  { valor: "semi", texto: "SEMIELABORADO" },
]

const chip = "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[12.5px] font-semibold tracking-wide"
const activo = "border-primary bg-primary text-primary-foreground"

/** Filtros: línea o semielaborado, el mes, y el modo del mes (AUTOMÁTICO / MANUAL) con su botón para cargar datos. */
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
      <div role="group" aria-label="Origen de los datos del mes" className="inline-flex rounded-full border bg-card p-0.5">
        {(["AUTO", "MANUAL"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={modo === m}
            disabled={!puedeEditar || cambiandoModo}
            onClick={() => modo !== m && onModo(m)}
            className={cn("rounded-full px-3 py-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground disabled:cursor-default", modo === m && activo)}
          >
            {m === "AUTO" ? "AUTOMÁTICO" : "MANUAL"}
          </button>
        ))}
      </div>
      {modo === "MANUAL" && puedeEditar && (
        <button type="button" onClick={onCargar} className={cn(chip, "border-dashed border-primary")}>
          <Pencil className="size-3.5" /> Cargar datos de {nombreMes(mes)}
        </button>
      )}
      <span className="ml-auto text-[11px] text-muted-foreground">
        {capital(nombreMes(mes))}: {modo === "MANUAL" ? "datos cargados a mano" : "calculado con las jornadas validadas"}
      </span>
    </div>
  )
}
