import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import { useAccion } from "@/lib/useAccion"
import type { AccionesTanque } from "./tipos"

/**
 * Después de transferir: cerrar los dos tanques con lo que se mida de
 * verdad. Primero el resto que quedó en el origen (salvo que se haya
 * mudado el lote entero), después el volumen real del destino.
 */
export function CierreTransferencia({
  origen,
  destino,
  puedeCapturarResto,
  capturarRestoOrigen,
  medirTanque,
  onCerrar,
}: {
  origen: 1 | 2 | 3
  /** El tanque destino tal como quedó DESPUÉS de la transferencia (dato fresco del turno). */
  destino: TanqueRecepcion
  puedeCapturarResto: boolean
  capturarRestoOrigen: AccionesTanque["capturarRestoOrigen"]
  medirTanque: AccionesTanque["medirTanque"]
  onCerrar: () => void
}) {
  const [restoOrigen, setRestoOrigen] = useState("0")
  const [volMedido, setVolMedido] = useState("")
  const { enviando, error, ejecutar } = useAccion()
  const resto = Number(restoOrigen)

  async function guardar() {
    const real = volMedido.trim() === "" ? null : Number(volMedido)
    if (real !== null && (!Number.isFinite(real) || real < 0)) return
    if (puedeCapturarResto && (!Number.isFinite(resto) || resto < 0)) return

    const ok = await ejecutar(async () => {
      if (puedeCapturarResto && resto > 0) {
        const r = await capturarRestoOrigen(origen, resto)
        if (!r.ok) return r
      }
      if (real !== null && destino.saborId !== null) return medirTanque(destino.numeroTanque, real)
      return { ok: true }
    })
    if (ok) onCerrar()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-warning/40 bg-warning-soft/30 p-3">
      <p className="text-xs break-words text-foreground">Transferencia hecha. Cierra los dos tanques con lo que midas de verdad.</p>

      {puedeCapturarResto && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs break-words text-foreground">¿El Tanque {origen} quedó vacío? Si no, ¿cuántos L quedaron?</p>
          <CampoLitros value={restoOrigen} onChange={setRestoOrigen} />
          <p className="text-[11px] text-muted-foreground">0 = quedó vacío.</p>
          {resto > 0 && (
            <p className="text-[11px] break-words text-muted-foreground">
              Esos {resto.toLocaleString("es-CO")} L vuelven como resto en el Tanque {origen} y se le descuentan al Tanque{" "}
              {destino.numeroTanque}.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-xs break-words text-foreground">
          Volumen real del Tanque {destino.numeroTanque} (~{(destino.volumenL ?? 0).toLocaleString("es-CO")} L calculado):
        </p>
        <CampoLitros value={volMedido} onChange={setVolMedido} placeholder={String(destino.volumenL ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={enviando || (volMedido.trim() === "" && !(puedeCapturarResto && resto > 0))} onClick={guardar}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar cierre
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={onCerrar}>
          Todo quedó bien
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}

function CampoLitros({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        className="h-8 w-24"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-xs text-muted-foreground">L</span>
    </div>
  )
}
