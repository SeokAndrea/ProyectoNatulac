import { useState } from "react"
import { Beaker, Loader2, PauseCircle, PlayCircle, Square } from "lucide-react"
import { ahoraPlanta, minutosEntre } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Corrida, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { fmtDuracion } from "@/lib/paradas"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import { AvisoParadaPendiente } from "./EstadoCipLinea"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/**
 * Corrida en pausa por una Parada: Continuar (termina la parada abierta con
 * la hora de ahora), Pasar a CIP o Detener. Un +1 viejo sin completar
 * («Parada por clasificar») sigue trabando Continuar hasta completarlo.
 * Cada botón sale solo si llega su acción: en Líneas, CIP y el atajo al
 * Modo Paradas; en el Modo Paradas, Continuar y Detener.
 */
export function PanelPausada({
  corrida,
  paradaQueDetiene,
  paradaDeLinea,
  continuar,
  onCip,
  onDetener,
  aModoParadas,
}: {
  corrida: Corrida
  /** +1 sin completar ligado a la línea. */
  paradaQueDetiene: ParadaQueDetiene | null
  /** La parada ligada a la línea (abierta o +1). */
  paradaDeLinea: ParadaQueDetiene | null
  continuar?: AccionesLinea["continuar"]
  onCip?: () => void
  onDetener?: () => void
  aModoParadas?: () => void
}) {
  const { enviando, error, ejecutar } = useAccion()
  const [justificacion, setJustificacion] = useState("")
  const abierta = paradaDeLinea && !paradaDeLinea.pendiente && paradaDeLinea.fin === null ? paradaDeLinea : null
  const minutos = abierta ? (minutosEntre(abierta.inicio.slice(0, 16), ahoraPlanta()) ?? 0) : 0
  // Cuánto duró (dueña, 2026-10-26): por defecto lo que marca el reloj; si la línea arrancó antes, se corrige (migración 20261112160000).
  const [duroTexto, setDuroTexto] = useState<string | null>(null)
  const pideMinutos = !!continuar && abierta !== null && !abierta.deMantenimiento
  const duro = duroTexto === null ? minutos : Number(duroTexto)
  const duroValido = duroTexto === null || (Number.isInteger(duro) && duro > 0)
  // Programada que pasó su tiempo guía: Continuar pide por qué (el servidor también lo exige).
  const pideJustificacion =
    abierta !== null &&
    !abierta.deMantenimiento &&
    abierta.clase === "PROGRAMADA" &&
    abierta.tiempoGuiaMin != null &&
    (duro > abierta.tiempoGuiaMin || (error?.includes("justificación") ?? false))
  const falta = paradaQueDetiene !== null || !duroValido || (pideJustificacion && justificacion.trim() === "")

  return (
    <div className="flex flex-col gap-2">
      {abierta ? (
        <div className="flex flex-col gap-0.5 text-xs">
          <p className="text-muted-foreground">
            Parada desde las {horaCortaPlanta(abierta.inicio, abierta.inicio)} ({fmtDuracion(minutos)}) ·{" "}
            <span className="font-medium text-foreground">{abierta.tipoNombre}</span>
          </p>
          {abierta.nota && <p className="text-foreground">{abierta.nota}</p>}
          {abierta.deMantenimiento && (
            <p className="text-muted-foreground">
              Es de Mantenimiento: al continuar, la línea sigue y la parada queda abierta para que Mantenimiento la cierre.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Parada{corrida.pausadaEn ? ` desde las ${horaCortaPlanta(corrida.pausadaEn, corrida.pausadaEn)}` : ""}.
        </p>
      )}
      <AvisoParadaPendiente parada={paradaQueDetiene} />
      {pideMinutos && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          ¿Cuánto duró?
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={duroTexto ?? String(minutos)}
            onChange={(e) => setDuroTexto(e.target.value)}
            className="num h-8 w-20 text-sm"
            aria-label="Minutos que duró la parada"
          />
          min
          <span className="basis-full">Si la línea arrancó antes de darle Continuar, pon los minutos reales.</span>
        </label>
      )}
      {continuar && pideJustificacion && abierta && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Pasó su tiempo guía ({fmtDuracion(abierta.tiempoGuiaMin ?? 0)}): ¿por qué?
          <Textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} rows={2} className="text-sm" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {continuar && (
          <Button
            size="sm"
            onClick={() =>
              ejecutar(() => continuar(corrida.id, pideJustificacion ? justificacion.trim() : null, pideMinutos && duroTexto !== null ? duro : null))
            }
            disabled={enviando || falta}
          >
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
            Continuar
          </Button>
        )}
        {aModoParadas && (
          <Button size="sm" onClick={aModoParadas}>
            <PauseCircle className="size-3.5" />
            Ir a Modo Paradas
          </Button>
        )}
        {onCip && (
          <Button size="sm" variant="outline" onClick={onCip} disabled={enviando}>
            <Beaker className="size-3.5" />
            Pasar a CIP
          </Button>
        )}
        {onDetener && (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={onDetener}
            disabled={enviando}
          >
            <Square className="size-3.5" />
            Detener línea
          </Button>
        )}
      </div>
      <MensajeError error={error} />
    </div>
  )
}
