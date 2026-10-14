import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { leerNumero } from "@/lib/indicadores/calculos"
import type { ParadaMes } from "@/lib/indicadores/tipos"

/** Id del <datalist> con los tipos de parada no programada (lo pone EditorManual). */
export const LISTA_CAUSAS = "indicadores-causas"

const mostrar = (v: number | null) => (v == null ? "" : String(v))

/** Paradas no programadas de una presentación: causa (de la lista o escrita), minutos y veces. */
export function EditorParadas({ paradas, onCambio }: { paradas: ParadaMes[]; onCambio: (p: ParadaMes[]) => void }) {
  const cambiar = (i: number, cambio: Partial<ParadaMes>) => onCambio(paradas.map((p, j) => (j === i ? { ...p, ...cambio } : p)))

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Paradas no programadas</span>
      {paradas.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_74px_74px_28px] gap-1 text-[10.5px] font-semibold text-muted-foreground">
          <span>Causa</span>
          <span>Minutos</span>
          <span>Veces</span>
          <span />
        </div>
      )}
      {paradas.map((p, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_74px_74px_28px] items-center gap-1">
          <Input aria-label="Causa" list={LISTA_CAUSAS} value={p.causa} placeholder="Elegir o escribir la causa" onChange={(e) => cambiar(i, { causa: e.target.value })} />
          <Input aria-label="Minutos" inputMode="numeric" className="font-mono" placeholder="—" value={mostrar(p.minutos)} onChange={(e) => cambiar(i, { minutos: leerNumero(e.target.value, true) })} />
          <Input aria-label="Veces" inputMode="numeric" className="font-mono" placeholder="—" value={mostrar(p.veces)} onChange={(e) => cambiar(i, { veces: leerNumero(e.target.value, true) })} />
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
