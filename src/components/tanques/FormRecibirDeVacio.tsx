import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MensajeError } from "@/components/MensajeError"
import { LataPixel } from "@/components/pixel/LataPixel"
import type { DatosRecibirDeVacio, Resultado } from "@/lib/preparacion/tipos"
import { nombreSaborConFamilia, type Sabor } from "@/lib/sabores"
import { useAccion } from "@/lib/useAccion"
import { TANK_MAX_VOLUMEN } from "./constantes"

/**
 * "Recibir de Vacío": Vacío preparó y el néctar llega por tubería a este
 * tanque. Sabor, lote y litros a mano (no hay tambores). Queda como lote
 * de Vacío, listo, fuera de la merma de Aséptico.
 */
export function FormRecibirDeVacio({
  numeroTanque,
  sabores,
  onRecibir,
  onCancelar,
}: {
  numeroTanque: 1 | 2 | 3
  sabores: Sabor[]
  onRecibir: (datos: DatosRecibirDeVacio) => Promise<Resultado>
  onCancelar: () => void
}) {
  const [saborId, setSaborId] = useState("")
  const [lote, setLote] = useState("")
  const [litros, setLitros] = useState("")
  const { enviando, error, ejecutar } = useAccion()

  const n = Number(litros)
  const excede = litros.trim() !== "" && n > TANK_MAX_VOLUMEN
  const valido = saborId !== "" && lote.trim() !== "" && litros.trim() !== "" && Number.isFinite(n) && n > 0 && !excede
  const saborNombre = sabores.find((s) => s.id === saborId)?.nombre ?? null

  async function recibir() {
    if (!valido) return
    await ejecutar(() => onRecibir({ numeroTanque, saborId, lote: lote.trim(), litros: n }))
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-vacio/50 p-3">
      <p className="text-xs font-semibold text-vacio">Recibir de Vacío · llega por tubería</p>
      <div className="grid grid-cols-2 gap-2">
        <Select value={saborId} onValueChange={setSaborId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sabor" />
          </SelectTrigger>
          <SelectContent>
            {sabores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {nombreSaborConFamilia(s.nombre, s.familiaNombre)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="Litros que llegaron"
          value={litros}
          onChange={(e) => setLitros(e.target.value)}
        />
      </div>
      {excede && (
        <p className="text-xs text-destructive" role="alert">
          El máximo del tanque es {TANK_MAX_VOLUMEN.toLocaleString("es-CO")} L.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Queda listo para Vacío: no se libera y no cuenta en la merma.</p>
      <MensajeError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!valido || enviando} onClick={recibir}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <LataPixel saborNombre={saborNombre} />}
          Recibir
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
