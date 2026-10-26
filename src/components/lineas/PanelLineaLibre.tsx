import { useState, type ReactNode } from "react"
import { Beaker, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LineaCodigo } from "@/lib/catalogos"
import type { CondicionLinea, LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { EstadoCipLinea } from "./EstadoCipLinea"
import { FilaAcciones } from "./FilaAcciones"
import { MensajeError } from "@/components/MensajeError"
import { ahoraPlanta, conSegundos, sumarMinutos } from "@/components/paradas/FormCompletarParada"
import { duracionBaseTurnoMin } from "@/lib/eficiencia"
import { anotarParada } from "@/lib/paradas"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { esLineaNoProgramada } from "@/lib/paradasTurnoCompleto"
import { useSesionTurno } from "@/lib/sesionTurno"
import { restarDias } from "@/lib/tiempoPlanta"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/**
 * Línea sin corrida: Arrancar línea + su condición (Sin programación /
 * Cambio de Presentación / Iniciar CIP) en una sola fila (FilaAcciones),
 * con `extra` (el botón de Paradas) después de Arrancar, para que se vea sin deslizar. En CIP muestra el CIP en
 * curso; con el formulario de CIP abierto (`formCip`), lo muestra en lugar
 * de los botones.
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
  extra,
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
  /** Botón que va al final de la fila (Paradas). */
  extra?: ReactNode
}) {
  const { enviando, error, ejecutar } = useAccion()
  const cambiar = (nueva: CondicionLinea) => ejecutar(() => cambiarCondicion({ linea: lineaCodigo, condicion: nueva }))
  const sesion = useSesionTurno()
  const motivosLnp = useTiposActivos().filter(esLineaNoProgramada)
  const [eligiendoLnp, setEligiendoLnp] = useState(false)

  /** Fin del turno en curso ('YYYY-MM-DDTHH:MM'), o null si no se sabe. */
  function finDelTurno(): string | null {
    if (!sesion.horaInicio || !sesion.turnoTipo) return null
    const minutos = duracionBaseTurnoMin(sesion.turnoTipo, { horaInicio: sesion.horaInicio })
    if (!minutos) return null
    const ahora = ahoraPlanta()
    let inicio = `${ahora.slice(0, 10)}T${sesion.horaInicio.slice(0, 5)}`
    if (inicio > ahora) inicio = `${restarDias(ahora.slice(0, 10), 1)}T${sesion.horaInicio.slice(0, 5)}`
    return sumarMinutos(inicio, minutos)
  }

  /**
   * LNP automático (dueña, 2026-10-25): «Sin programación» con su motivo anota la LNPE
   * desde ahora hasta el fin del turno; si la línea arranca, la base la corta
   * (migración 20261111890000).
   */
  function sinProgramacionPor(tipoCodigo: string) {
    setEligiendoLnp(false)
    void ejecutar(async () => {
      const r = await cambiarCondicion({ linea: lineaCodigo, condicion: "SIN_PROGRAMACION" })
      const fin = finDelTurno()
      if (!r.ok || !fin || !sesion.usuario) return r
      return anotarParada(sesion.usuario, { lineaCodigo, tipoCodigo, inicio: conSegundos(ahoraPlanta()), fin: conSegundos(fin), nota: null }, "Líneas")
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {(formCip || condicion === "CIP") && (
        <FilaAcciones>
          <Button variant="outline" size="sm" onClick={onArrancar}>
            <PlayCircle className="size-3.5" />
            Arrancar línea
          </Button>
          {extra}
        </FilaAcciones>
      )}
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
            <FilaAcciones>
              <Button variant="outline" size="sm" onClick={onArrancar}>
                <PlayCircle className="size-3.5" />
                Arrancar línea
              </Button>
              {extra}
              <Button
                size="sm"
                variant={condicion === "SIN_PROGRAMACION" ? "default" : "outline"}
                disabled={enviando}
                onClick={() => (condicion === "SIN_PROGRAMACION" || motivosLnp.length === 0 ? cambiar("SIN_PROGRAMACION") : setEligiendoLnp(true))}
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
            </FilaAcciones>
          )}
          {eligiendoLnp && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium">¿Por qué no está programada? Cubre el turno hasta que arranque.</p>
              <div className="flex flex-wrap gap-2">
                {motivosLnp.map((t) => (
                  <Button key={t.codigo} size="sm" variant="outline" disabled={enviando} onClick={() => sinProgramacionPor(t.codigo)}>
                    {t.nombre}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="ghost" className="self-start" onClick={() => setEligiendoLnp(false)}>
                Cancelar
              </Button>
            </div>
          )}
          <MensajeError error={error} />
        </div>
      )}
    </div>
  )
}
