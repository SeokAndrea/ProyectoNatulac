import { useState } from "react"
import { Loader2 } from "lucide-react"
import { ahoraPlanta, conSegundos } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { anotarParada, type TipoParada } from "@/lib/paradas"
import { MAX_DIAS_TURNO_COMPLETO, TURNOS_COMPLETOS, diasEntre, turnosACargar, type TipoTurno } from "@/lib/paradasTurnoCompleto"
import { franjaDeHora, restarDias } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"

const ddmm = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`

/**
 * Parada de Línea No Programada por TURNO COMPLETO (dueña, 2026-10-14): de
 * un día a otro y los turnos elegidos, una parada por turno con todo su
 * horario. Solo los turnos que ya terminaron.
 */
export function TurnoCompleto({
  usuario,
  lineaCodigo,
  tipo,
  nota,
  pagina,
  onGuardada,
  onRecargar,
  onCancelar,
}: {
  usuario: string
  lineaCodigo: string
  tipo: TipoParada
  nota: string
  pagina: string
  onGuardada: () => void | Promise<void>
  /** Si se guardaron algunas y otras no: para ver las guardadas. */
  onRecargar: () => void | Promise<void>
  onCancelar: () => void
}) {
  // Por defecto, la jornada anterior: lo común es cargarla después.
  const ayer = restarDias(franjaDeHora().fecha, 1)
  const [desde, setDesde] = useState(ayer)
  const [hasta, setHasta] = useState(ayer)
  const [tipos, setTipos] = useState<TipoTurno[]>(TURNOS_COMPLETOS.map((t) => t.tipo))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const muchosDias = diasEntre(desde, hasta).length > MAX_DIAS_TURNO_COMPLETO
  const turnos = muchosDias ? [] : turnosACargar(desde, hasta, tipos, ahoraPlanta())
  const listos = turnos.filter((t) => t.termino)
  const faltan = turnos.length - listos.length

  async function guardar() {
    setGuardando(true)
    setError(null)
    const fallas: string[] = []
    for (const t of listos) {
      const r = await anotarParada(
        usuario,
        { lineaCodigo, tipoCodigo: tipo.codigo, inicio: conSegundos(t.inicio), fin: conSegundos(t.fin), nota: nota.trim() || null },
        pagina,
      )
      if (!r.ok) fallas.push(`${ddmm(t.fecha)} ${t.corto}: ${r.error}`)
    }
    setGuardando(false)
    if (fallas.length > 0) {
      setError(`${listos.length - fallas.length} de ${listos.length} guardadas. No se guardaron: ${fallas.join(" · ")}`)
      if (fallas.length < listos.length) await onRecargar()
      return
    }
    await onGuardada()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Desde el día
          <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hasta el día
          <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="h-9" />
        </label>
      </div>
      <div role="group" aria-label="Turnos" className="flex flex-wrap gap-2">
        {TURNOS_COMPLETOS.map((t) => {
          const elegido = tipos.includes(t.tipo)
          return (
            <button
              key={t.tipo}
              type="button"
              aria-pressed={elegido}
              onClick={() => setTipos((ts) => (elegido ? ts.filter((x) => x !== t.tipo) : [...ts, t.tipo]))}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-left text-sm transition-colors",
                elegido ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border text-muted-foreground hover:border-primary",
              )}
            >
              {t.corto} <span className="text-xs font-normal text-muted-foreground">{t.desde}–{t.hasta}</span>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {muchosDias
          ? `Máximo ${MAX_DIAS_TURNO_COMPLETO} días de una vez.`
          : listos.length === 0
            ? "Elige al menos un turno que ya haya terminado."
            : `Se registran ${listos.length} parada${listos.length === 1 ? "" : "s"} de «${tipo.nombre}», una por turno, cada una con el turno entero.`}
        {faltan > 0 && ` ${faltan} turno${faltan === 1 ? "" : "s"} todavía no termina${faltan === 1 ? "" : "n"}: se carga${faltan === 1 ? "" : "n"} cuando terminen.`}
      </p>

      {error && (
        <p className="text-sm text-danger-foreground" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={guardar} disabled={listos.length === 0 || guardando}>
          {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
          Guardar {listos.length > 0 ? listos.length : ""} turno{listos.length === 1 ? "" : "s"} completo{listos.length === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
