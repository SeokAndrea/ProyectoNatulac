import { Clock } from "lucide-react"
import { paradasValidadas } from "@/lib/indicadores/automatico"
import { dur, minutosSinReportar, textoSinReportar } from "@/lib/minutosSinReportar"
import { horasTranscurridasTurno } from "@/lib/reportes"
import type { DatosJornada } from "@/lib/validarJornada"
import { cn } from "@/lib/utils"

/**
 * Validar jornada → Paradas: por turno y línea, el tiempo que nadie explicó
 * (src/lib/minutosSinReportar.ts), con las paradas como quedan validadas
 * (minutos corregidos, sin las que «no cuentan»).
 */
export function SinReportarJornada({ datos }: { datos: DatosJornada }) {
  const filas = datos.turnos.flatMap(({ turno, etiqueta }) =>
    minutosSinReportar({
      turnoTipo: turno.turnoTipo,
      esquema: turno.esquema,
      horaInicio: turno.horaInicio,
      estado: turno.estado,
      horasTranscurridas: horasTranscurridasTurno(turno.horaInicio, turno.estado, turno.horaFin),
      corridas: turno.corridas,
      productoTerminado: turno.productoTerminado,
      paradas: paradasValidadas(datos.paradasPorTurno.get(turno.id) ?? [], datos.paradasValidadas),
    }).map((f) => ({ ...f, etiqueta, clave: `${turno.id}|${f.linea}` })),
  )
  if (filas.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="size-4 text-muted-foreground" />
        Tiempo sin reportar
      </h3>
      <ul className="flex flex-col gap-1">
        {filas.map((f) => {
          const { texto, alerta } = textoSinReportar(f)
          return (
            <li key={f.clave} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className={cn("font-medium", alerta ? "text-warning-foreground" : "text-foreground")}>
                {f.etiqueta} · Línea {f.linea}: {texto}
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
    </div>
  )
}
