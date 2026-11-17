import { useState } from "react"
import { AlertTriangle, Loader2, Printer } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MensajeError } from "@/components/MensajeError"
import type { ConfigTickets } from "@/lib/robotTavil"
import { diaMesPlanta, horaPlanta } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"

const textoCopias = (n: number) => `${n} ${n === 1 ? "copia" : "copias"} por paleta`

/**
 * «Tickets por sistema» (prueba, migración 20261116590000): un interruptor
 * general del Robot Tavil. Encendido, el «+» no pide ticket: el sistema lo
 * crea y lo imprime. Lo cambia quien tenga ROBOT_TAVIL_TICKETS, con doble
 * confirmación; el cambio queda en Auditoría.
 */
export function TicketsSistema({
  config,
  puedeCambiar,
  onGuardar,
}: {
  config: ConfigTickets
  puedeCambiar: boolean
  onGuardar: (activo: boolean, copias: number) => Promise<string | null>
}) {
  const [abierto, setAbierto] = useState(false)
  const on = config.activo
  const cuando = config.cambiadoEn ? `${diaMesPlanta(new Date(config.cambiadoEn))} ${horaPlanta(new Date(config.cambiadoEn)).slice(0, 5)}` : null

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
        on ? "border-info/40 bg-info-soft text-info-foreground" : "border-border bg-card",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-semibold">
          <Printer className="size-4 shrink-0" />
          Tickets por sistema
          <Badge variant="muted">Prueba</Badge>
        </span>
        <span className={cn("text-sm", !on && "text-muted-foreground")}>
          {on ? `Encendido · al crear la paleta se imprime su ticket con QR (${textoCopias(config.copias)}).` : "Apagado · el ticket se escribe del papel."}
        </span>
        {config.cambiadoPor && cuando && (
          <span className="text-xs text-muted-foreground">
            Lo cambió {config.cambiadoPor} el <span className="num">{cuando}</span>
          </span>
        )}
      </div>
      {puedeCambiar && (
        <Button size="sm" variant="outline" className="shrink-0" aria-label="Cambiar los tickets por sistema" onClick={() => setAbierto(true)}>
          Cambiar
        </Button>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          {abierto && <CuerpoConfig config={config} onGuardar={onGuardar} onCerrar={() => setAbierto(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CuerpoConfig({
  config,
  onGuardar,
  onCerrar,
}: {
  config: ConfigTickets
  onGuardar: (activo: boolean, copias: number) => Promise<string | null>
  onCerrar: () => void
}) {
  const [activo, setActivo] = useState(config.activo)
  const [copias, setCopias] = useState(config.copias)
  /** Primer clic: muestra qué cambia. Segundo clic: guarda. */
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sinCambios = activo === config.activo && copias === config.copias
  const cambiaActivo = activo !== config.activo

  async function guardar() {
    if (!confirmando) {
      setConfirmando(true)
      return
    }
    setEnviando(true)
    setError(null)
    const e = await onGuardar(activo, copias)
    setEnviando(false)
    if (e) {
      setError(e)
      setConfirmando(false)
    } else onCerrar()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <DialogHeader>
        <DialogTitle>Tickets por sistema</DialogTitle>
        <DialogDescription>Vale para todas las líneas del Robot Tavil. El cambio queda en Auditoría.</DialogDescription>
      </DialogHeader>

      <label htmlFor="tickets-activo" className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
        <span className="flex flex-col">
          <span className="font-medium">Imprimir el ticket al crear la paleta</span>
          <span className="text-xs text-muted-foreground">Encendido, el «+» no pide ticket: el sistema lo crea (P-000124) y lo imprime.</span>
        </span>
        <Switch
          id="tickets-activo"
          checked={activo}
          onCheckedChange={(v) => {
            setActivo(v)
            setConfirmando(false)
          }}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tickets-copias">Copias por paleta</Label>
        <div role="group" id="tickets-copias" aria-label="Copias por paleta" className="inline-flex self-start overflow-hidden rounded-lg border border-border">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={copias === n}
              onClick={() => {
                setCopias(n)
                setConfirmando(false)
              }}
              className={cn(
                "num min-h-10 min-w-11 border-l border-border px-3 text-sm first:border-l-0",
                copias === n ? "bg-primary font-semibold text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Por defecto 1. Con 2 o más, se pegan en distintas caras de la paleta.</span>
      </div>

      {confirmando && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {cambiaActivo
              ? activo
                ? "Desde ahora, en todas las líneas, el «+» crea el ticket y lo imprime. "
                : "Desde ahora el operador vuelve a escribir el ticket del papel. Las paletas que ya tienen ticket del sistema lo conservan. "
              : ""}
            {copias === 1 ? "Queda" : "Quedan"} {textoCopias(copias)}. Toca otra vez para confirmar.
          </span>
        </p>
      )}
      <MensajeError error={error} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando || sinCambios} variant={confirmando ? "destructive" : "default"}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          {confirmando ? (cambiaActivo ? (activo ? "Sí, encender los tickets" : "Sí, apagar los tickets") : "Sí, cambiar las copias") : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  )
}
