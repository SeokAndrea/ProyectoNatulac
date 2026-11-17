import { useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MensajeError } from "@/components/MensajeError"
import { CamposConformidad } from "@/components/robot-tavil/CamposConformidad"
import { avisoTicketRepetido, type DatosEditarPaleta, type DatosNuevaPaleta, type LineaRobot } from "@/lib/robotTavil"
import {
  codigoPresentacion,
  codigoSabor,
  errorConformidad,
  numeroTurno,
  type DatosConformidad,
  type Paleta,
} from "@/lib/trazabilidadPaletizado"

export type DialogoPaletaModo = { tipo: "nueva"; linea: LineaRobot } | { tipo: "editar"; paleta: Paleta }

/**
 * Cuadro del «+» (paleta nueva: ticket y conformidad) y de corregir una
 * paleta de la lista (además, tipo y cajas). El tipo de una paleta nueva sale
 * del interruptor «Paleta manual» de la línea. El error del servidor se
 * muestra aquí mismo y el cuadro queda abierto. Ticket repetido (migración
 * 20261116190000): el servidor avisa en qué paleta está y el botón pide un
 * segundo clic para guardarlo igual.
 */
export function DialogoPaleta({
  modo,
  onCerrar,
  onCrear,
  onEditar,
}: {
  modo: DialogoPaletaModo | null
  onCerrar: () => void
  onCrear: (linea: string, d: DatosNuevaPaleta) => Promise<string | null>
  onEditar: (paletaId: string, d: DatosEditarPaleta) => Promise<string | null>
}) {
  return (
    <Dialog open={!!modo} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        {modo && (
          <CuerpoDialogo
            key={modo.tipo === "nueva" ? `nueva-${modo.linea.lineaCodigo}` : modo.paleta.id}
            modo={modo}
            onCerrar={onCerrar}
            onCrear={onCrear}
            onEditar={onEditar}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CuerpoDialogo({
  modo,
  onCerrar,
  onCrear,
  onEditar,
}: {
  modo: DialogoPaletaModo
  onCerrar: () => void
  onCrear: (linea: string, d: DatosNuevaPaleta) => Promise<string | null>
  onEditar: (paletaId: string, d: DatosEditarPaleta) => Promise<string | null>
}) {
  const p = modo.tipo === "editar" ? modo.paleta : null
  const [ticket, setTicket] = useState(p?.ticket ?? "")
  const [manual, setManual] = useState(p?.tipoPaletizado === "MANUAL")
  const [cajas, setCajas] = useState(p?.cajas ? String(p.cajas) : "")
  const [conformidad, setConformidad] = useState<DatosConformidad>({
    conforme: p?.conforme ?? true,
    observacionCodigos: p?.observacionCodigos ?? [],
    observacionOtros: p?.observacionOtros ?? "",
    accionCorreccion: p?.accionCorreccion ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  /** Aviso del servidor: el ticket ya está en otra paleta. El siguiente clic guarda igual. */
  const [repetido, setRepetido] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const numero = p ? p.numero : modo.tipo === "nueva" ? modo.linea.proximoNumero : null
  const sabor = p ? codigoSabor(p) : modo.tipo === "nueva" ? modo.linea.proximoSaborCodigo || modo.linea.corrida.saborNombre || "—" : "—"
  const pres = p ? codigoPresentacion(p) : modo.tipo === "nueva" ? modo.linea.proximoPresentacionCodigo || "—" : "—"
  const turno = p ? p.turnoTipo : modo.tipo === "nueva" ? modo.linea.proximoTurno : null
  const lote = p ? p.lote : modo.tipo === "nueva" ? modo.linea.corrida.lote : null
  const lineaManual = modo.tipo === "nueva" && modo.linea.manual

  async function guardar() {
    setError(null)
    if (!ticket.trim()) {
      setError("Escribe el número de ticket para guardar la paleta.")
      return
    }
    const e = errorConformidad(conformidad, true)
    if (e) {
      setError(e)
      return
    }
    let nCajas = 0
    if (p) {
      nCajas = Number(cajas)
      if (!Number.isInteger(nCajas) || nCajas <= 0) {
        setError("El número de cajas debe ser mayor que cero.")
        return
      }
    }
    setEnviando(true)
    const confirmarRepetido = repetido !== null
    const r =
      modo.tipo === "nueva"
        ? await onCrear(modo.linea.lineaCodigo, { ticket: ticket.trim(), ...conformidad, confirmarRepetido })
        : await onEditar(modo.paleta.id, {
            ticket: ticket.trim(),
            tipoPaletizado: manual ? "MANUAL" : "AUTOMATICO",
            cajas: nCajas,
            ...conformidad,
            confirmarRepetido,
          })
    setEnviando(false)
    const aviso = avisoTicketRepetido(r)
    if (aviso) setRepetido(aviso)
    else if (r) setError(r)
    else onCerrar()
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
        <DialogTitle>
          {modo.tipo === "nueva" ? `Nueva paleta · ${modo.linea.lineaNombre}` : `Paleta Nº ${p?.numero ?? "—"} · ${p?.lineaNombre}`}
        </DialogTitle>
        <DialogDescription>
          {modo.tipo === "nueva" ? "Escribe el ticket del papel que va en la paleta." : "Corrige lo que haga falta. El cambio queda en Auditoría."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <span className="num text-3xl font-semibold leading-none">Nº {numero ?? "—"}</span>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="info">{sabor}</Badge>
          <Badge variant="muted">{pres}</Badge>
          {lote && <Badge variant="muted">Lote {lote}</Badge>}
          <Badge variant="muted">Turno {numeroTurno(turno)}</Badge>
        </div>
        {lineaManual && (
          <p className="text-sm text-warning-foreground">
            <Badge variant="warning" className="mr-1.5">
              Manual
            </Badge>
            La línea tiene encendida «Paleta manual»: esta paleta se guardará como Manual.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paleta-ticket">Nº de ticket</Label>
        <Input
          id="paleta-ticket"
          value={ticket}
          autoFocus
          autoComplete="off"
          placeholder="El del papel que va en la paleta"
          aria-invalid={!!error && !ticket.trim()}
          onChange={(e) => {
            setTicket(e.target.value)
            // Otro ticket: si también está repetido, se vuelve a avisar.
            setRepetido(null)
          }}
        />
      </div>

      {p && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paleta-cajas">Nº de cajas</Label>
            <Input id="paleta-cajas" type="number" min={1} inputMode="numeric" value={cajas} onChange={(e) => setCajas(e.target.value)} />
          </div>
          <label htmlFor="paleta-manual" className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span className="flex flex-col">
              <span className="font-medium">Paleta manual</span>
              <span className="text-xs text-muted-foreground">Corrige el tipo de esta paleta. Apagado = Automático.</span>
            </span>
            <Switch id="paleta-manual" checked={manual} onCheckedChange={setManual} />
          </label>
        </>
      )}

      <CamposConformidad idBase="paleta" valor={conformidad} onCambio={setConformidad} />

      <MensajeError error={error} />
      {repetido && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {repetido} Si es correcto, toca «Sí, guardar con el ticket repetido».
          </span>
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando} variant={repetido ? "destructive" : "default"}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          {repetido ? "Sí, guardar con el ticket repetido" : modo.tipo === "nueva" ? "Crear paleta" : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </form>
  )
}
