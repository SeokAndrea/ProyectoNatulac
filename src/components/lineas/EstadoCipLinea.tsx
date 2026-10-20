import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, ClipboardPen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

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

/** La parada que detiene la línea (el +1) todavía no tiene tipo o minutos: hasta completarla no se sigue. Un botón directo, sin texto que leer. */
export function AvisoParadaPendiente({ parada }: { parada: ParadaQueDetiene | null }) {
  if (!parada) return null
  return (
    <Button asChild size="sm" className="self-start">
      <Link to={`/paradas?parada=${parada.paradaId}`}>
        <ClipboardPen className="size-3.5" />
        Completar parada · {parada.tipoNombre}
      </Link>
    </Button>
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
