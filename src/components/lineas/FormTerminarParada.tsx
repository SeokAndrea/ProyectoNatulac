import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { MensajeError } from "@/components/MensajeError"
import { conSegundos, minutosEntre, sumarMinutos } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  paradaCruzoTurnoCerrado,
  terminarParada,
  TIPO_FALLA_SIN_ESPECIFICAR,
  TIPO_POR_CLASIFICAR,
  type Parada,
  type TipoParada,
} from "@/lib/paradas"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { useAccion } from "@/lib/useAccion"

const PAGINA = "Líneas"
const LARGO_SOLUCION = 300

/**
 * Terminar parada (Mantenimiento, o el supervisor con el interruptor apagado):
 * código (equipo y falla, subsistema), qué se realizó y el tiempo final. Los
 * minutos o la hora de comienzo solo valen si la parada no cruzó un turno
 * cerrado: lo cerrado queda fijo y solo se mueve el final.
 */
export function FormTerminarParada({
  parada,
  usuario,
  areaCodigo = null,
  onTerminada,
}: {
  parada: Parada
  usuario: string
  areaCodigo?: string | null
  onTerminada: () => void
}) {
  const equipos = useEquiposParadas()
  const [cruzo, setCruzo] = useState<boolean | null>(null)
  const tipoInicial = parada.tipoCodigo && parada.tipoCodigo !== TIPO_FALLA_SIN_ESPECIFICAR && parada.tipoCodigo !== TIPO_POR_CLASIFICAR ? parada.tipoCodigo : null
  const [corrigiendo, setCorrigiendo] = useState(tipoInicial === null)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [subsistema, setSubsistema] = useState(parada.subsistemaCodigo ?? "")
  const [solucion, setSolucion] = useState(parada.solucion ?? "")
  const [conHoras, setConHoras] = useState(false)
  const [minutos, setMinutos] = useState("")
  const inicioOriginal = parada.inicio.slice(0, 16)
  const [comienzo, setComienzo] = useState(inicioOriginal)
  const [fin, setFin] = useState("")
  const { enviando, error, ejecutar } = useAccion()
  const area = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"

  useEffect(() => {
    let vivo = true
    void paradaCruzoTurnoCerrado(parada.id).then((c) => vivo && setCruzo(c))
    return () => {
      vivo = false
    }
  }, [parada.id])

  if (cruzo === null) {
    return (
      <div className="flex justify-center py-3 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  const tipoCodigo = tipo?.codigo ?? (corrigiendo ? null : tipoInicial)
  const usaMinutos = !cruzo && !conHoras
  const n = Number(minutos)
  const finCalculado = usaMinutos ? (Number.isInteger(n) && n >= 1 ? sumarMinutos(inicioOriginal, n) : "") : fin
  const inicioFinal = usaMinutos || cruzo ? inicioOriginal : comienzo
  const duracion = finCalculado && inicioFinal ? minutosEntre(inicioFinal, finCalculado) : null
  const tiempoListo = finCalculado !== "" && duracion !== null && duracion > 0
  const listo = tipoCodigo !== null && subsistema.trim() !== "" && solucion.trim() !== "" && tiempoListo

  async function confirmar() {
    if (!tipoCodigo || !listo) return
    const datos = {
      tipoCodigo,
      subsistemaCodigo: subsistema.trim(),
      solucion: solucion.trim(),
      fin: conSegundos(finCalculado),
      inicio: !usaMinutos && !cruzo && comienzo !== inicioOriginal ? conSegundos(comienzo) : null,
    }
    if (await ejecutar(() => terminarParada(usuario, parada.id, datos, PAGINA))) onTerminada()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      {corrigiendo ? (
        <BuscadorTipoParada
          lineaCodigo={parada.lineaCodigo}
          area={area}
          equipos={equipos}
          permitir={(t) => t.codigo !== TIPO_FALLA_SIN_ESPECIFICAR}
          onElegir={setTipo}
        />
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate font-medium text-foreground">{parada.tipoNombre}</span>
          <button type="button" onClick={() => setCorrigiendo(true)} className="shrink-0 text-xs text-muted-foreground underline decoration-dotted hover:text-foreground">
            Cambiar
          </button>
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Subsistema
        <Input value={subsistema} onChange={(e) => setSubsistema(e.target.value.slice(0, 40))} className="h-9" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        ¿Qué se realizó?
        <Textarea value={solucion} onChange={(e) => setSolucion(e.target.value.slice(0, LARGO_SOLUCION))} maxLength={LARGO_SOLUCION} rows={2} className="text-sm" />
      </label>

      {cruzo ? (
        <>
          <p className="text-xs text-muted-foreground">Empezó {parada.inicio.slice(11, 16)} (turno cerrado).</p>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Terminó a las
            <Input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
          </label>
        </>
      ) : (
        <>
          <div role="group" aria-label="Tiempo final" className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={usaMinutos ? "default" : "outline"} aria-pressed={usaMinutos} onClick={() => setConHoras(false)}>
              Minutos
            </Button>
            <Button type="button" size="sm" variant={usaMinutos ? "outline" : "default"} aria-pressed={!usaMinutos} onClick={() => setConHoras(true)}>
              Hora de comienzo y fin
            </Button>
          </div>
          {usaMinutos ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Minutos
              <Input type="number" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} className="h-9" />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Comenzó a las
                <Input type="datetime-local" value={comienzo} onChange={(e) => setComienzo(e.target.value)} className="h-9" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Terminó a las
                <Input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
              </label>
            </>
          )}
        </>
      )}
      {finCalculado !== "" && duracion !== null && duracion <= 0 && <p className="text-xs text-danger-foreground">El fin tiene que ser después del comienzo.</p>}

      <div className="flex justify-end">
        <Button size="sm" onClick={confirmar} disabled={enviando || !listo}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Terminar parada
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
