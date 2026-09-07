import { GRUPOS, TURNO_TIPOS, nombrePorCodigo, type GrupoCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import { useCatalogosLive, litrosHoraDeLive } from "@/lib/catalogosLive"
import type { Corrida } from "@/lib/produccion/tipos"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"

/**
 * Datos fijos del turno (los mismos desde "Comenzar Turno" hasta
 * "Finalizar Turno"): la usa Finalizar Turno para el encabezado del
 * acta. Cada línea activa muestra su propia presentación y velocidad
 * — pueden ser distintas entre sí.
 */
export function ResumenTurno({
  fecha,
  horaInicio,
  turnoTipo,
  grupo,
  corridas,
  tanques,
}: {
  fecha: string
  horaInicio: string
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  corridas: Corrida[]
  tanques: TanqueRecepcion[]
}) {
  const { lineas, velocidades } = useCatalogosLive()
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Fecha</dt>
          <dd className="font-medium text-foreground">{fecha}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hora de inicio</dt>
          <dd className="font-medium text-foreground">{horaInicio}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Turno</dt>
          <dd className="font-medium text-foreground">{nombrePorCodigo(TURNO_TIPOS, turnoTipo)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Grupo</dt>
          <dd className="font-medium text-foreground">{nombrePorCodigo(GRUPOS, grupo)}</dd>
        </div>
      </dl>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">Líneas en uso</p>
        {corridas.filter((l) => l.activa).length === 0 ? (
          <p className="text-sm font-medium text-foreground">Ninguna (parada)</p>
        ) : (
          <div className="flex flex-col gap-2">
            {corridas
              .filter((l) => l.activa)
              .map((l) => {
                const litros = litrosHoraDeLive(velocidades, l.linea, l.presentacion, l.envasesHora)
                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground">
                      {nombrePorCodigo(lineas, l.linea)}
                      {l.saborNombre ? ` · ${l.saborNombre}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {l.presentacion} ml · {l.envasesHora} env/h{litros ? ` · ${litros} L/h` : ""}
                    </span>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">Tanques</p>
        <div className="flex flex-col gap-2">
          {tanques.map((t) => (
            <div
              key={t.numeroTanque}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">Tanque {t.numeroTanque}</span>
              <span className="text-muted-foreground">
                {t.condicion === "LISTO" || t.condicion === "STANDBY"
                  ? `${t.saborNombre ?? "Sabor"} · ${t.volumenL} L${t.lote ? ` · Lote ${t.lote}` : ""}`
                  : t.condicion === "SUCIO"
                    ? "Sucio"
                    : t.condicion === "CIP"
                      ? "En CIP"
                      : t.condicion === "LIMPIO"
                        ? "Limpio"
                        : "En Preparación"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
