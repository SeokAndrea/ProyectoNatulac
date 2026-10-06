import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

/** Una fila de Materia prima: sabor (de la lista), pulpa y kits. Debajo, lo que espera el sistema de pulpa. */
export function FilaMateriaPrimaInput({
  fila,
  sabores,
  usados,
  onCambiar,
  onQuitar,
}: {
  fila: FilaMateriaPrima
  sabores: SaborInventario[]
  /** Sabores ya elegidos en otras filas (no se ofrecen de nuevo). */
  usados: Set<string>
  onCambiar: (f: FilaMateriaPrima) => void
  onQuitar: () => void
}) {
  const sabor = sabores.find((s) => s.saborId === fila.saborId) ?? null
  const dif = sabor ? diferenciaPulpa(sabor.pulpa, fila.pulpa) : null
  const error = errorFilaMateriaPrima(fila)
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 last:border-b-0">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={fila.saborId} onValueChange={(v) => onCambiar({ ...fila, saborId: v })}>
          <SelectTrigger className="min-w-44 flex-1" aria-label="Sabor">
            <SelectValue placeholder="Elige el sabor" />
          </SelectTrigger>
          <SelectContent>
            {sabores
              .filter((s) => s.saborId === fila.saborId || !usados.has(s.saborId))
              .map((s) => (
                <SelectItem key={s.saborId} value={s.saborId}>
                  {s.nombre}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          Pulpa (tambores)
          <Input type="number" min={0} step={1} inputMode="numeric" className={campoNumero} aria-label="Pulpa" value={fila.pulpa} onChange={(e) => onCambiar({ ...fila, pulpa: e.target.value })} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          Kits
          <Input type="number" min={0} step={1} inputMode="numeric" className={campoNumero} aria-label="Kits" value={fila.kits} onChange={(e) => onCambiar({ ...fila, kits: e.target.value })} />
        </label>
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Quitar sabor" onClick={onQuitar}>
          <X className="size-4" />
        </Button>
      </div>
      {sabor && sabor.pulpa.saldo !== null ? (
        <p className="text-xs text-muted-foreground">
          El sistema espera {sabor.pulpa.saldo.toLocaleString("es-CO")} tambores
          {dif !== null && (
            <span className={cn("font-medium", dif === 0 ? "text-success" : "text-warning")}> · {textoDiferencia(dif, "tambores")}</span>
          )}
        </p>
      ) : sabor ? (
        <p className="text-xs text-muted-foreground">Primer conteo de este sabor.</p>
      ) : null}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** Una fila de Material de empaque: material (de la lista) y cantidad. */
export function FilaEmpaqueInput({
  fila,
  empaque,
  usados,
  onCambiar,
  onQuitar,
}: {
  fila: FilaEmpaque
  empaque: ItemInventario[]
  usados: Set<string>
  onCambiar: (f: FilaEmpaque) => void
  onQuitar: () => void
}) {
  const item = empaque.find((e) => e.empaqueCodigo === fila.codigo) ?? null
  const error = errorFilaEmpaque(fila)
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 last:border-b-0">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={fila.codigo} onValueChange={(v) => onCambiar({ ...fila, codigo: v })}>
          <SelectTrigger className="min-w-44 flex-1" aria-label="Material">
            <SelectValue placeholder="Elige el material" />
          </SelectTrigger>
          <SelectContent>
            {empaque
              .filter((e) => e.empaqueCodigo === fila.codigo || !usados.has(e.empaqueCodigo!))
              .map((e) => (
                <SelectItem key={e.item} value={e.empaqueCodigo!}>
                  {e.nombre}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          Cantidad{item ? ` (${item.unidad})` : ""}
          <Input type="number" min={0} step={1} inputMode="numeric" className={campoNumero} aria-label="Cantidad" value={fila.cantidad} onChange={(e) => onCambiar({ ...fila, cantidad: e.target.value })} />
        </label>
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Quitar material" onClick={onQuitar}>
          <X className="size-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
