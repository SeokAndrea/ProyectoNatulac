import { useState } from "react"
import { Loader2 } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { completarParada, duracionMin, fmtDuracion, TIPO_FALLA_SIN_ESPECIFICAR, tipoACompletar, type Parada, type TipoParada } from "@/lib/paradas"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import type { EquipoParada } from "@/lib/paradasEquipos"
import { fechaPlanta, horaPlanta } from "@/lib/tiempoPlanta"

/*
 * Completar una parada pendiente (+1): tipo real si hace falta y minutos (u
 * horas). Sale de Registrar Paradas para usarlo también en Finalizar Turno.
 */

/** 'YYYY-MM-DDTHH:MM' del reloj de planta, para los campos de fecha y hora. */
export const ahoraPlanta = () => `${fechaPlanta()}T${horaPlanta().slice(0, 5)}`
/** 'YYYY-MM-DDTHH:MM' (campo) → 'YYYY-MM-DDTHH:MM:SS' (servidor). */
export const conSegundos = (v: string) => (v.length === 16 ? `${v}:00` : v)
/** Minutos entre dos campos 'YYYY-MM-DDTHH:MM'. null si alguno no es válido. */
export function minutosEntre(inicio: string, fin: string): number | null {
  const ms = new Date(conSegundos(fin)).getTime() - new Date(conSegundos(inicio)).getTime()
  return Number.isNaN(ms) ? null : Math.round(ms / 60000)
}
/** Campo 'YYYY-MM-DDTHH:MM' + minutos → 'YYYY-MM-DDTHH:MM' (mismo reloj que el campo). */
function sumarMinutos(v: string, min: number): string {
  const d = new Date(new Date(conSegundos(v)).getTime() + min * 60000)
  const dd = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T${dd(d.getHours())}:${dd(d.getMinutes())}`
}

/**
 * Hora de fin con atajo: se puede poner la hora, o solo los minutos y la
 * hora de fin sale sola (inicio + minutos). Los minutos siempre muestran
 * fin − inicio, así que si cambian la hora a mano se ven al día.
 */
export function CampoFin({
  etiqueta,
  inicio,
  fin,
  onFin,
}: {
  etiqueta: string
  inicio: string
  fin: string
  onFin: (v: string) => void
}) {
  const min = inicio && fin ? minutosEntre(inicio, fin) : null
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {etiqueta}
        <Input type="datetime-local" value={fin} onChange={(e) => onFin(e.target.value)} className="h-9" />
      </label>
      <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
        o minutos
        <Input
          type="number"
          min={1}
          value={min ?? ""}
          disabled={!inicio}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (e.target.value === "" || !Number.isFinite(n) || n < 0) return onFin("")
            onFin(sumarMinutos(inicio, n))
          }}
          className="h-9"
        />
      </label>
    </div>
  )
}

// ------------------------------------------------------------
// Completar una pendiente: tipo real (si hace falta) + minutos (o horas).
// ------------------------------------------------------------
export function FormCompletarParada({
  parada,
  usuario,
  area,
  equipos,
  presentacionMl,
  textoBoton,
  pagina,
  onListo,
  accionesExtra,
}: {
  parada: Parada
  usuario: string
  area: string
  equipos: EquipoParada[]
  presentacionMl: number | null
  textoBoton: string
  /** Página que queda en Auditoría. */
  pagina: string
  onListo: () => void | Promise<void>
  accionesExtra?: React.ReactNode
}) {
  const tiposActivos = useTiposActivos()
  const completar = tipoACompletar(parada.tipoCodigo)
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  const [minutos, setMinutos] = useState("")
  const [conHoras, setConHoras] = useState(false)
  const [inicio, setInicio] = useState(parada.inicio.slice(0, 16))
  const [fin, setFin] = useState(ahoraPlanta)
  const [justificacion, setJustificacion] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pasaron = Math.max(1, duracionMin({ inicio: parada.inicio, fin: null }))
  const tipoFinal = completar ? tipo : (tiposActivos.find((t) => t.codigo === parada.tipoCodigo) ?? null)
  const guia = tipoFinal?.clase === "PROGRAMADA" ? tipoFinal.tiempoGuiaMin : null
  const nMin = conHoras
    ? inicio && fin
      ? minutosEntre(inicio, fin)
      : null
    : minutos === ""
      ? null
      : Number(minutos)
  const pasaGuia = guia != null && nMin != null && nMin > guia

  const faltan: string[] = []
  if (completar && !tipo) faltan.push(completar === "EQUIPO" ? "Código y equipo de la falla" : "Tipo de parada")
  if (nMin == null || !Number.isFinite(nMin) || nMin <= 0) faltan.push(conHoras ? "Hora de inicio y fin (el fin después del inicio)" : "Minutos que duró")
  if (pasaGuia && justificacion.trim() === "") faltan.push(`Justificación: pasó ${nMin! - guia!} min del tiempo guía`)

  async function guardar() {
    if (faltan.length > 0) return
    setGuardando(true)
    setError(null)
    const r = await completarParada(
      usuario,
      parada.id,
      {
        minutos: conHoras ? null : nMin,
        inicio: conHoras ? conSegundos(inicio) : null,
        fin: conHoras ? conSegundos(fin) : null,
        tipoCodigo: tipo?.codigo ?? null,
        justificacion: pasaGuia ? justificacion.trim() : null,
      },
      pagina,
    )
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    await onListo()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-3">
      {completar && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {completar === "EQUIPO" ? "Código y equipo de la falla" : "Tipo de parada"}
          </p>
          <BuscadorTipoParada
            lineaCodigo={parada.lineaCodigo}
            area={area}
            equipos={equipos}
            presentacionMl={presentacionMl}
            permitir={(t) =>
              completar === "EQUIPO" ? !!t.equipoCodigo : t.codigo !== TIPO_FALLA_SIN_ESPECIFICAR
            }
            onElegir={setTipo}
          />
        </div>
      )}

      {conHoras ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Inicio
            <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
          </label>
          <CampoFin etiqueta="Fin" inicio={inicio} fin={fin} onFin={setFin} />
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Minutos que duró{guia != null ? ` (guía ${guia})` : ""}
            <Input type="number" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} className="h-9" />
          </label>
          <Button type="button" size="sm" variant="outline" onClick={() => setMinutos(String(pasaron))}>
            Usar {fmtDuracion(pasaron)} (desde el +1)
          </Button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setConHoras((v) => !v)}
        className="self-start text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        {conHoras ? "Mejor poner solo los minutos" : "Poner hora de inicio y fin"}
      </button>

      {pasaGuia && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Justificación (pasó {nMin! - guia!} min del tiempo guía)
          <Input value={justificacion} onChange={(e) => setJustificacion(e.target.value)} className="h-9" />
        </label>
      )}

      {faltan.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-danger-foreground">
          {faltan.map((f) => (
            <li key={f}>Falta: {f}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-sm text-danger-foreground" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={guardar} disabled={faltan.length > 0 || guardando}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {textoBoton}
        </Button>
        {accionesExtra}
      </div>
    </div>
  )
}
