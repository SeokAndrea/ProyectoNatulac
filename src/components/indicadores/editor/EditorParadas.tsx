import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ParadaMes } from "@/lib/indicadores/tipos"

/** Id del <datalist> con los tipos de parada no programada (lo pone EditorManual). */
export const LISTA_CAUSAS = "indicadores-causas"

/** Paradas cargadas a mano (de una presentación o las generales): solo el nombre, en una lista numerada (dueña, 2026-10-14). */
export function EditorParadas({ paradas, onCambio, titulo = "Paradas" }: { paradas: ParadaMes[]; onCambio: (p: ParadaMes[]) => void; titulo?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      {paradas.map((p, i) => (
        <div key={i} className="grid grid-cols-[22px_minmax(0,1fr)_28px] items-center gap-1">
          <span className="text-sm font-semibold text-muted-foreground">{i + 1}.</span>
          <Input
            aria-label={`Parada ${i + 1}`}
            list={LISTA_CAUSAS}
            value={p.causa}
            placeholder="Elegir o escribir la parada"
            onChange={(e) => onCambio(paradas.map((x, j) => (j === i ? { ...x, causa: e.target.value } : x)))}
          />
          <Button variant="ghost" size="icon" aria-label="Quitar parada" onClick={() => onCambio(paradas.filter((_, j) => j !== i))}>
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => onCambio([...paradas, { causa: "", minutos: null, veces: null }])}>
        + Agregar parada
      </Button>
    </div>
  )
}
