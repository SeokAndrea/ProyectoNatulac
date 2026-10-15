import { useEffect, useState } from "react"
import { Clock } from "lucide-react"
import type { Parada } from "@/lib/paradas"
import { cargarParadasDelTurno } from "@/lib/paradasCatalogo"
import { dur, minutosSinReportar, textoSinReportar } from "@/lib/minutosSinReportar"
import type { Corrida } from "@/lib/produccion/tipos"
import { useProductoTerminado } from "@/lib/productoTerminado"
import { horasTranscurridasTurno } from "@/lib/reportes"
import type { TurnoActivo } from "@/lib/turno"
import { cn } from "@/lib/utils"

/**
 * Registrar Paradas: cuánto tiempo del turno en curso nadie explicó todavía,
 * por línea (ver src/lib/minutosSinReportar.ts). `version` cambia cada vez
 * que se guarda o borra una parada, para volver a traerlas.
 */
export function SinReportarTurno({ turno, corridas, version }: { turno: TurnoActivo | null; corridas: Corrida[]; version: unknown }) {
  const [paradas, setParadas] = useState<Parada[] | null>(null)
  const pt = useProductoTerminado(turno?.id ?? null)
  const { recargar: recargarPt } = pt

  // `turno` se vuelve a pedir cada minuto: con él (y con cada parada guardada) se traen paradas y PT de nuevo.
  useEffect(() => {
    if (!turno?.id) return
    let vivo = true
    void cargarParadasDelTurno(turno.id).then((p) => vivo && setParadas(p))
    void recargarPt()
    return () => {
      vivo = false
    }
  }, [turno, version, recargarPt])

  if (!turno || paradas === null || corridas.length === 0) return null
  const filas = minutosSinReportar({
    turnoTipo: turno.turnoTipo,
    esquema: turno.esquema,
    horaInicio: turno.horaInicio,
    estado: turno.estado,
    horasTranscurridas: horasTranscurridasTurno(turno.horaInicio, turno.estado, turno.horaFin),
    corridas,
    productoTerminado: pt.registros,
    paradas,
  })
  if (filas.length === 0) return null

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Clock className="size-4 text-muted-foreground" />
        Tiempo sin reportar · turno {turno.codigo}
      </h2>
      <ul className="flex flex-col gap-1">
        {filas.map((f) => {
          const { texto, alerta } = textoSinReportar(f)
          return (
            <li key={f.linea} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className={cn("font-medium", alerta ? "text-warning-foreground" : "text-foreground")}>
                Línea {f.linea}: {texto}
              </span>
              {f.sinReportarMin !== null && (
                <span className="text-xs text-muted-foreground">
                  {dur(f.ventanaMin)} de turno − {dur(f.paradasMin)} en paradas − {dur(f.producidoMin)} produciendo
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
