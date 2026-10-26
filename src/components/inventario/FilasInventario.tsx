import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ItemInventario } from "@/lib/inventario"
import { cn } from "@/lib/utils"
import {
  diferenciaPulpa,
  errorFilaEmpaque,
  errorFilaMateriaPrima,
  textoDiferencia,
  type FilaEmpaque,
  type FilaMateriaPrima,
  type SaborInventario,
} from "./calculosInventario"

const campoNumero = "h-9 w-24"

/** Una fila de Materia prima: el sabor (agregado con el buscador), pulpa y kits. Debajo, lo que espera el sistema de pulpa. */
export function FilaMateriaPrimaInput({
  fila,
  sabor,
  enfocar,
  onCambiar,
  onQuitar,
}: {
  fila: FilaMateriaPrima
  sabor: SaborInventario
  /** Recién agregada: el cursor va a su primer número. */
  enfocar?: boolean
  onCambiar: (f: FilaMateriaPrima) => void
  onQuitar: () => void
}) {
  const dif = diferenciaPulpa(sabor.pulpa, fila.pulpa)
  const error = errorFilaMateriaPrima(fila)
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 last:border-b-0">
      <div className="flex flex-wrap items-end gap-2">
        <span className="min-w-44 flex-1 self-center text-sm font-medium text-foreground">{sabor.nombre}</span>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          Pulpa (tambores)
          <Input type="number" min={0} step={1} inputMode="numeric" className={campoNumero} aria-label="Pulpa" autoFocus={enfocar} value={fila.pulpa} onChange={(e) => onCambiar({ ...fila, pulpa: e.target.value })} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          Kits
          <Input type="number" min={0} step={1} inputMode="numeric" className={campoNumero} aria-label="Kits" value={fila.kits} onChange={(e) => onCambiar({ ...fila, kits: e.target.value })} />
        </label>
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Quitar ${sabor.nombre}`} onClick={onQuitar}>
          <X className="size-4" />
        </Button>
      </div>
      {sabor.pulpa.saldo !== null ? (
        <p className="text-xs text-muted-foreground">
          El sistema espera {sabor.pulpa.saldo.toLocaleString("es-CO")} tambores
          {dif !== null && (
            <span className={cn("font-medium", dif === 0 ? "text-success" : "text-warning")}> · {textoDiferencia(dif, "tambores")}</span>
          )}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Primer conteo de este sabor.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** Una fila de Material de empaque: el material (agregado con el buscador) y la cantidad. */
export function FilaEmpaqueInput({
  fila,
  item,
  enfocar,
  onCambiar,
  onQuitar,
}: {
  fila: FilaEmpaque
  item: ItemInventario
  /** Recién agregada: el cursor va a su número. */
  enfocar?: boolean
  onCambiar: (f: FilaEmpaque) => void
  onQuitar: () => void
}) {
  const error = errorFilaEmpaque(fila)
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 last:border-b-0">
      <div className="flex flex-wrap items-end gap-2">
        <span className="min-w-44 flex-1 self-center text-sm font-medium text-foreground">{item.nombre}</span>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          Cantidad ({item.unidad})
          <Input type="number" min={0} step={1} inputMode="numeric" className={campoNumero} aria-label="Cantidad" autoFocus={enfocar} value={fila.cantidad} onChange={(e) => onCambiar({ ...fila, cantidad: e.target.value })} />
        </label>
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Quitar ${item.nombre}`} onClick={onQuitar}>
          <X className="size-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
