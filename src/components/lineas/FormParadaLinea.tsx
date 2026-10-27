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
 * 20261111590000). Empieza ahora, o a la hora que se ponga si empezó
 * antes; Continuar la termina. Dos caminos (20261112590000):
 *  - «Sé la causa»: el tipo del catálogo.
 *  - «No sé / es una falla»: solo la descripción; queda como «Falla sin
 *    especificar» y Mantenimiento le pone el código después.
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
  const [noSe, setNoSe] = useState(false)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [motivo, setMotivo] = useState("")
  const [conInicio, setConInicio] = useState(desdeAntes)
  const [inicio, setInicio] = useState(ahoraPlanta)
  const { enviando, error, ejecutar } = useAccion()
  const area = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const tipoCodigo = noSe ? TIPO_FALLA_SIN_ESPECIFICAR : tipo?.codigo
  const listo = tipoCodigo !== undefined && motivo.trim() !== "" && (!conInicio || inicio !== "")

  async function confirmar() {
    if (!tipoCodigo || !listo) return
    // El selector de Responsable llega con la pantalla nueva; mientras, Operacional.
    const datos = { motivo: motivo.trim(), tipoCodigo, responsable: "OPERACIONAL" as const, inicio: conInicio ? conSegundos(inicio) : null }
    if (await ejecutar(() => pausar(corridaId, datos))) onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-foreground">
        Parada: la línea se para ya y el tiempo empieza a contar. Al darle Continuar, termina con esa hora.
      </p>
      <div role="radiogroup" aria-label="¿Sabes la causa?" className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" role="radio" aria-checked={!noSe} variant={noSe ? "outline" : "default"} onClick={() => setNoSe(false)}>
          Sé la causa
        </Button>
        <Button type="button" size="sm" role="radio" aria-checked={noSe} variant={noSe ? "default" : "outline"} onClick={() => setNoSe(true)}>
          No sé / es una falla
        </Button>
      </div>
      {noSe ? (
        <p className="text-xs text-muted-foreground">Queda como «Falla sin especificar»: Mantenimiento le pone el código después.</p>
      ) : (
        <>
          <BuscadorTipoParada
            lineaCodigo={lineaCodigo}
            area={area}
            equipos={equipos}
            presentacionMl={presentacionMl}
            permitir={(t) => t.codigo !== TIPO_FALLA_SIN_ESPECIFICAR}
            onElegir={setTipo}
          />
          {tipo?.clase === "PROGRAMADA" && tipo.tiempoGuiaMin != null && (
            <p className="text-xs text-muted-foreground">Tiempo guía: {fmtDuracion(tipo.tiempoGuiaMin)}.</p>
          )}
        </>
      )}
      <Textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value.slice(0, LARGO_NOTA_PARADA))}
        maxLength={LARGO_NOTA_PARADA}
        rows={2}
        placeholder={noSe ? "Qué está pasando — lo ve Mantenimiento" : "Qué pasó — se muestra en los paneles"}
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
        <span className="text-xs text-muted-foreground">
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
