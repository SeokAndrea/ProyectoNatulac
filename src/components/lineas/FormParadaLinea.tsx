import { useState } from "react"
import { Loader2, PauseCircle } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { ahoraPlanta, conSegundos } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MensajeError } from "@/components/MensajeError"
import { fmtDuracion, LARGO_NOTA_PARADA, TIPO_FALLA_SIN_ESPECIFICAR, type TipoParada } from "@/lib/paradas"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/**
 * "Parada": pausa la corrida y deja abierta su parada (migración
 * 20261111590000). El tipo y la descripción son obligatorios; empieza
 * ahora, o a la hora que se ponga si empezó antes. Continuar la termina.
 */
export function FormParadaLinea({
  corridaId,
  lineaCodigo,
  areaCodigo,
  presentacionMl,
  desdeAntes = false,
  pausar,
  onCerrar,
}: {
  corridaId: string
  lineaCodigo: string
  areaCodigo: string | null
  presentacionMl: number | null
  /** Abre de entrada el campo de la hora de inicio (Status: la línea ya estaba parada). */
  desdeAntes?: boolean
  pausar: AccionesLinea["pausar"]
  onCerrar: () => void
}) {
  const equipos = useEquiposParadas()
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [motivo, setMotivo] = useState("")
  const [conInicio, setConInicio] = useState(desdeAntes)
  const [inicio, setInicio] = useState(ahoraPlanta)
  const { enviando, error, ejecutar } = useAccion()
  const area = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const listo = tipo !== null && motivo.trim() !== "" && (!conInicio || inicio !== "")

  async function confirmar() {
    if (!tipo || !listo) return
    const datos = { motivo: motivo.trim(), tipoCodigo: tipo.codigo, inicio: conInicio ? conSegundos(inicio) : null }
    if (await ejecutar(() => pausar(corridaId, datos))) onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-foreground">
        Parada: la corrida se pausa y la parada queda abierta. Al darle Continuar, termina sola con esa hora.
      </p>
      <BuscadorTipoParada
        lineaCodigo={lineaCodigo}
        area={area}
        equipos={equipos}
        presentacionMl={presentacionMl}
        permitir={(t) => t.codigo !== TIPO_FALLA_SIN_ESPECIFICAR}
        onElegir={setTipo}
      />
      {tipo?.clase === "PROGRAMADA" && tipo.tiempoGuiaMin != null && (
        <p className="text-[11px] text-muted-foreground">Tiempo guía: {fmtDuracion(tipo.tiempoGuiaMin)}.</p>
      )}
      <Textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value.slice(0, LARGO_NOTA_PARADA))}
        maxLength={LARGO_NOTA_PARADA}
        rows={2}
        placeholder="Qué pasó — se muestra en los paneles"
        className="text-sm"
      />
      {conInicio ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Empezó a las
          <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setConInicio(true)}
          className="self-start text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
        >
          Empezó antes
        </button>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {motivo.length}/{LARGO_NOTA_PARADA}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmar} disabled={enviando || !listo}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
            Confirmar parada
          </Button>
        </div>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
