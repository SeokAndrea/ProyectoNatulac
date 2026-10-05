import type { ReactNode } from "react"
import { Beaker, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LineaCodigo } from "@/lib/catalogos"
import type { CondicionLinea, LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { EstadoCipLinea } from "./EstadoCipLinea"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "./useAccion"

/**
 * Línea sin corrida: Arrancar línea + su condición (Sin programación /
 * Cambio de Presentación / Iniciar CIP). En CIP muestra el CIP en curso;
 * con el formulario de CIP abierto (`formCip`), lo muestra en lugar de
 * los botones.
 */
export function PanelLineaLibre({
  lineaCodigo,
  condicion,
  lineaEstado,
  paradaQueDetiene,
  formCip,
  cambiarCondicion,
  terminarCip,
  onArrancar,
  onIniciarCip,
}: {
  lineaCodigo: LineaCodigo
  condicion: CondicionLinea
  lineaEstado: LineaEstado | null
  paradaQueDetiene: ParadaQueDetiene | null
  formCip: ReactNode
  cambiarCondicion: AccionesLinea["cambiarCondicion"]
  terminarCip: AccionesLinea["terminarCip"]
  onArrancar: () => void
  onIniciarCip: () => void
}) {
  const { enviando, error, ejecutar } = useAccion()
  const cambiar = (nueva: CondicionLinea) => ejecutar(() => cambiarCondicion({ linea: lineaCodigo, condicion: nueva }))

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="sm" className="self-start" onClick={onArrancar}>
        <PlayCircle className="size-3.5" />
        Arrancar línea
      </Button>
      {formCip ?? (
        <div className="flex flex-col gap-2">
          {condicion === "CIP" ? (
            <EstadoCipLinea
              lineaCodigo={lineaCodigo}
              lineaEstado={lineaEstado}
              paradaQueDetiene={paradaQueDetiene}
              terminarCip={terminarCip}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={condicion === "SIN_PROGRAMACION" ? "default" : "outline"}
                disabled={enviando}
                onClick={() => cambiar("SIN_PROGRAMACION")}
              >
                Sin programación
              </Button>
              <Button
                size="sm"
                variant={condicion === "CAMBIO_PRESENTACION" ? "default" : "outline"}
                disabled={enviando}
                onClick={() => cambiar("CAMBIO_PRESENTACION")}
              >
                Cambio de Presentación
              </Button>
              <Button size="sm" variant="outline" disabled={enviando} onClick={onIniciarCip}>
                <Beaker className="size-3.5" />
                Iniciar CIP
              </Button>
            </div>
          )}
          <MensajeError error={error} />
        </div>
      )}
    </div>
  )
}
