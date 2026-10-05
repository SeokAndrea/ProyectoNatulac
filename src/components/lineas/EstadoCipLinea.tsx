import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "./useAccion"

/** "Motivo. En CIP desde las HH:MM." (+ lo que se agregue al final). */
export function DescripcionCip({ lineaEstado, children }: { lineaEstado: LineaEstado | null; children?: ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground">
      {lineaEstado?.observacion ? <span className="font-medium text-foreground">{lineaEstado.observacion}. </span> : null}
      En CIP{lineaEstado?.cipIniciadoEn ? ` desde las ${horaCortaPlanta(lineaEstado.cipIniciadoEn, lineaEstado.cipIniciadoEn)}` : ""}.
      {children}
    </p>
  )
}

/** Aviso cuando la parada del CIP (el +1) todavía no tiene tipo o minutos: hasta completarla no se sigue. */
export function AvisoParadaPendiente({ parada, accion = "terminar el CIP" }: { parada: ParadaQueDetiene | null; accion?: string }) {
  if (!parada) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-warning/40 bg-warning-soft/40 p-2">
      <p className="text-xs text-foreground">
        Para {accion}, completa la parada («{parada.tipoNombre}») en Registrar Paradas: tipo y minutos.
      </p>
      <Button asChild size="sm" variant="outline" className="self-start">
        <Link to={`/paradas?parada=${parada.paradaId}`}>Ir a Registrar Paradas</Link>
      </Button>
    </div>
  )
}

/** Línea en CIP sin corrida en pausa: motivo, desde cuándo y Terminó CIP (bloqueado mientras falte la parada). */
export function EstadoCipLinea({
  lineaCodigo,
  lineaEstado,
  paradaQueDetiene,
  terminarCip,
}: {
  lineaCodigo: string
  lineaEstado: LineaEstado | null
  paradaQueDetiene: ParadaQueDetiene | null
  terminarCip: AccionesLinea["terminarCip"]
}) {
  const { enviando, error, ejecutar } = useAccion()
  return (
    <div className="flex flex-col gap-2">
      <DescripcionCip lineaEstado={lineaEstado} />
      <AvisoParadaPendiente parada={paradaQueDetiene} />
      <Button
        size="sm"
        className="self-start"
        disabled={enviando || paradaQueDetiene !== null}
        onClick={() => ejecutar(() => terminarCip(lineaCodigo))}
      >
        {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
        Terminó CIP
      </Button>
      <MensajeError error={error} />
    </div>
  )
}
