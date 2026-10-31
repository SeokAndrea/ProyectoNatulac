import { useState } from "react"
import { Loader2, PauseCircle } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { BuscadorParada, type Eleccion } from "@/components/catalogo-fallas/BuscadorParada"
import { ahoraPlanta, conSegundos } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MensajeError } from "@/components/MensajeError"
import { fmtDuracion, LARGO_NOTA_PARADA, TIPO_FALLA_SIN_ESPECIFICAR, type ResponsableParada, type TipoParada } from "@/lib/paradas"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { useAuth } from "@/lib/auth"
import { asignarFallaRecienRegistrada, TIPO_FALLA_EQUIPO } from "@/lib/catalogoFallas/paradas"
import { useCatalogoModular } from "@/lib/catalogoFallas/switch"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/**
 * "Parar": pausa la corrida y deja abierta su parada. Empieza ahora, o a la
 * hora que se ponga si empezó antes; Continuar la termina. Responsable
 * (Operacional o Mantenimiento), Equipo y Falla, y Comentario son
 * obligatorios. Con `responsableFijo` (Mantenimiento) no se pregunta.
 */
export function FormParadaLinea({
  corridaId,
  lineaCodigo,
  areaCodigo,
  presentacionMl,
  desdeAntes = false,
  sinCorrida = false,
  responsableFijo,
  pausar,
  onCerrar,
}: {
  corridaId: string
  lineaCodigo: string
  areaCodigo: string | null
  presentacionMl: number | null
  /** Abre de entrada el campo de la hora de inicio (Status: la línea ya estaba parada). */
  desdeAntes?: boolean
  /** La línea no tiene corrida: la parada queda abierta desde la hora que se ponga (puede ser de días atrás) hasta que se termine. */
  sinCorrida?: boolean
  /** Si viene, no se muestra el selector y se usa este responsable. */
  responsableFijo?: ResponsableParada
  pausar: AccionesLinea["pausar"]
  onCerrar: () => void
}) {
  const equipos = useEquiposParadas()
  const [elegido, setElegido] = useState<ResponsableParada | null>(null)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  // Con el catálogo nuevo encendido (20261113790000): falla de equipo u otra parada, desde un solo buscador.
  const modular = useCatalogoModular(areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO") === true
  const [eleccion, setEleccion] = useState<Eleccion | null>(null)
  const [sinFalla, setSinFalla] = useState<string | null>(null)
  const { session } = useAuth()
  const [motivo, setMotivo] = useState("")
  const [conInicio, setConInicio] = useState(desdeAntes)
  const [inicio, setInicio] = useState(ahoraPlanta)
  const { enviando, error, ejecutar } = useAccion()
  const area = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const responsable = responsableFijo ?? elegido
  const tipoCodigo = modular ? (eleccion?.tipo?.codigo ?? (eleccion?.falla ? TIPO_FALLA_EQUIPO : undefined)) : tipo?.codigo
  const tipoElegido = modular ? (eleccion?.tipo ?? null) : tipo
  const listo = responsable !== null && tipoCodigo !== undefined && motivo.trim() !== "" && (!conInicio || inicio !== "")

  async function confirmar() {
    if (!tipoCodigo || !responsable || !listo) return
    const datos = { motivo: motivo.trim(), tipoCodigo, responsable, inicio: conInicio ? conSegundos(inicio) : null }
    if (!(await ejecutar(() => pausar(corridaId, datos)))) return
    // La falla va en un segundo paso: si no se pudo, la parada igual quedó y Mantenimiento se la pone al terminar.
    if (eleccion?.falla && session) {
      const r = await asignarFallaRecienRegistrada(session.username, lineaCodigo, eleccion.falla.falla.id, "Líneas")
      if (!r.ok) return setSinFalla(`La parada quedó registrada, pero sin la falla (${r.error}). Mantenimiento se la pone al terminarla.`)
    }
    onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-foreground">
        {sinCorrida
          ? "La línea no tiene corrida: la parada queda abierta desde ahora y cuenta hasta que la termines o arranques la línea."
          : "La línea se para ya; el tiempo cuenta hasta Continuar."}
      </p>
      {responsableFijo === undefined && (
        <div role="radiogroup" aria-label="Responsable de la parada" className="grid grid-cols-2 gap-2">
          {(["OPERACIONAL", "MANTENIMIENTO"] as const).map((r) => (
            <Button key={r} type="button" role="radio" aria-checked={elegido === r} variant={elegido === r ? "default" : "outline"} className="h-11" onClick={() => setElegido(r)}>
              {r === "OPERACIONAL" ? "Operacional" : "Mantenimiento"}
            </Button>
          ))}
        </div>
      )}
      {modular ? (
        <BuscadorParada lineaCodigo={lineaCodigo} area={area} presentacionMl={presentacionMl} onElegir={setEleccion} />
      ) : (
        <BuscadorTipoParada
          lineaCodigo={lineaCodigo}
          area={area}
          equipos={equipos}
          presentacionMl={presentacionMl}
          permitir={(t) => t.codigo !== TIPO_FALLA_SIN_ESPECIFICAR}
          onElegir={setTipo}
        />
      )}
      {tipoElegido?.clase === "PROGRAMADA" && tipoElegido.tiempoGuiaMin != null && (
        <p className="text-xs text-muted-foreground">Tiempo guía: {fmtDuracion(tipoElegido.tiempoGuiaMin)}.</p>
      )}
      <Textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value.slice(0, LARGO_NOTA_PARADA))}
        maxLength={LARGO_NOTA_PARADA}
        rows={2}
        placeholder="Qué pasó"
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
          <Button size="sm" onClick={confirmar} disabled={enviando || !listo || sinFalla !== null}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
            Confirmar parada
          </Button>
        </div>
      </div>
      <MensajeError error={error ?? sinFalla} />
    </div>
  )
}
