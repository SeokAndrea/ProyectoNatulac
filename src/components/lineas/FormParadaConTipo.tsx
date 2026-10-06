import { useState } from "react"
import { Loader2, PauseCircle } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { MensajeError } from "@/components/MensajeError"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { registraSupervisor, type TipoParada } from "@/lib/paradas"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import type { Corrida } from "@/lib/produccion/tipos"
import { useAccion } from "@/lib/useAccion"
import type { AccionesLinea } from "./tipos"

/**
 * "Parada" con el catálogo: el supervisor elige el tipo (solo los suyos:
 * programadas, externas y operacionales) y escribe el comentario. La parada
 * queda en curso y "Continuar" la cierra. Si la línea paró antes de apretar
 * el botón, se ponen los minutos.
 */
export function FormParadaConTipo({
  corrida,
  areaCodigo,
  parar,
  onCerrar,
}: {
  corrida: Corrida
  areaCodigo: string | null
  parar: NonNullable<AccionesLinea["parar"]>
  onCerrar: () => void
}) {
  const equipos = useEquiposParadas()
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [nota, setNota] = useState("")
  const [minutosAntes, setMinutosAntes] = useState("")
  const { enviando, error, ejecutar } = useAccion()

  const minutos = minutosAntes === "" ? 0 : Number(minutosAntes)
  const valido = tipo !== null && nota.trim() !== "" && Number.isInteger(minutos) && minutos >= 0

  async function confirmar() {
    if (!valido || !tipo) return
    const ok = await ejecutar(() =>
      parar(corrida.id, { tipoCodigo: tipo.codigo, tipoNombre: tipo.nombre, nota: nota.trim(), minutosAntes: minutos }),
    )
    if (ok) onCerrar()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-foreground">Parada: la línea se pausa y el tiempo corre hasta que aprietes Continuar.</p>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Tipo de parada</Label>
        <BuscadorTipoParada
          lineaCodigo={corrida.linea}
          area={areaCodigo}
          equipos={equipos}
          presentacionMl={Number(corrida.presentacion) || null}
          permitir={registraSupervisor}
          onElegir={setTipo}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Comentario</Label>
        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value.slice(0, 140))}
          maxLength={140}
          rows={2}
          placeholder="Qué pasó — se ve en el Panel de Paradas"
          className="text-sm"
        />
        <span className="text-right text-[11px] text-muted-foreground">{nota.length}/140</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`antes-${corrida.id}`} className="text-xs">
          Paró hace
        </Label>
        <Input
          id={`antes-${corrida.id}`}
          type="number"
          inputMode="numeric"
          min={0}
          value={minutosAntes}
          onChange={(e) => setMinutosAntes(e.target.value)}
          placeholder="0"
          className="h-8 w-20"
        />
        <span className="text-xs text-muted-foreground">min (déjalo vacío si fue ahora)</span>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button size="sm" onClick={confirmar} disabled={enviando || !valido}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
          Confirmar parada
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
