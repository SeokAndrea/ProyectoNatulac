import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, ClipboardPen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"
import { Input } from "@/components/ui/input"
import { ahoraPlanta, conSegundos } from "@/components/paradas/FormCompletarParada"

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
      <Link to="/lineas?paradas=1">
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
  textoBoton,
  children,
}: {
  lineaCodigo: string
  lineaEstado: LineaEstado | null
  paradaQueDetiene: ParadaQueDetiene | null
  terminarCip: AccionesLinea["terminarCip"]
  textoBoton?: string
  children?: ReactNode
}) {
  const { enviando, error, ejecutar } = useAccion()
  const [ahora, setAhora] = useState(Date.now)
  const [registrarArranque, setRegistrarArranque] = useState(false)
  const [reinicio, setReinicio] = useState("")
  const [motivo, setMotivo] = useState("")
  const fin = lineaEstado?.cipFinPrevisto
  const falta = !!fin && ahora < new Date(fin).getTime()
  const enReparacion = !!lineaEstado?.cipEnReparacion
  useEffect(() => {
    if (!fin || !falta) return
    const id = setTimeout(() => setAhora(Date.now()), Math.max(0, new Date(fin).getTime() - Date.now()))
    return () => clearTimeout(id)
  }, [fin, falta, ahora])
  return (
    <div className="flex flex-col gap-2">
      <DescripcionCip lineaEstado={lineaEstado}>{children}</DescripcionCip>
      <AvisoParadaPendiente parada={paradaQueDetiene} />
      {fin && <p className="text-xs text-muted-foreground">Fin previsto del lavado {horaCortaPlanta(fin, fin)}</p>}
      {enReparacion && <p className="text-xs text-muted-foreground">La línea seguirá en parada hasta que Mantenimiento registre el fin de la reparación.</p>}
      {fin && !falta && !enReparacion && (
        <div className="grid gap-2">
          <Button size="sm" variant="outline" className="self-start" onClick={() => {
            setRegistrarArranque(!registrarArranque)
            if (!reinicio) setReinicio(ahoraPlanta())
          }}>{registrarArranque ? "Quitar hora de arranque" : "Registrar hora real de arranque"}</Button>
          {registrarArranque && <>
            <label className="grid gap-1 text-xs">Hora real de arranque
              <Input type="datetime-local" max={ahoraPlanta()} value={reinicio} onChange={(e) => setReinicio(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs">Motivo si hubo espera
              <Input value={motivo} maxLength={140} onChange={(e) => setMotivo(e.target.value)} />
            </label>
          </>}
        </div>
      )}
      <Button
        size="sm"
        className="self-start"
        disabled={enviando || falta || paradaQueDetiene !== null || (registrarArranque && !enReparacion && !reinicio)}
        onClick={() => ejecutar(() => registrarArranque && !enReparacion
          ? terminarCip(lineaCodigo, { reinicioReal: conSegundos(reinicio), motivoEspera: motivo.trim() })
          : terminarCip(lineaCodigo))}
      >
        {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
        {enReparacion ? "Terminó el lavado" : textoBoton ?? "Terminó CIP"}
      </Button>
      <MensajeError error={error} />
    </div>
  )
}
