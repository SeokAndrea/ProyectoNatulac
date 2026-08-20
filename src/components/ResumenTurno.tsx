import { GRUPOS, LINEAS, TURNO_TIPOS, nombrePorCodigo, litrosHoraDe } from "@/lib/catalogos"
import type { TurnoActivo } from "@/lib/turno"

/**
 * Datos fijos del turno (los mismos desde "Comenzar Turno" hasta
 * "Finalizar Turno"): la usa Finalizar Turno para el encabezado del
 * acta. Cada línea activa muestra su propia presentación y velocidad
 * — pueden ser distintas entre sí.
 */
export function ResumenTurno({ turno }: { turno: TurnoActivo }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Fecha</dt>
          <dd className="font-medium text-foreground">{turno.fecha}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hora de inicio</dt>
          <dd className="font-medium text-foreground">{turno.horaInicio}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Turno</dt>
          <dd className="font-medium text-foreground">{nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Grupo</dt>
          <dd className="font-medium text-foreground">{nombrePorCodigo(GRUPOS, turno.grupo)}</dd>
        </div>
      </dl>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">Líneas en uso</p>
        {turno.lineas.length === 0 ? (
          <p className="text-sm font-medium text-foreground">Ninguna (parada)</p>
        ) : (
          <div className="flex flex-col gap-2">
            {turno.lineas.map((l) => {
              const litros = litrosHoraDe(l.linea, l.presentacion, l.envasesHora)
              return (
                <div
                  key={l.linea}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{nombrePorCodigo(LINEAS, l.linea)}</span>
                  <span className="text-muted-foreground">
                    {l.presentacion} ml · {l.envasesHora} env/h{litros ? ` · ${litros} L/h` : ""}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
