import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import { LineaCard } from "@/components/lineas/LineaCard"
import type { AccionesLinea } from "@/components/lineas/tipos"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { paradasQueDetienenLineas } from "@/lib/produccion/ajustes"
import { useSesionTurno } from "@/lib/sesionTurno"
import type { ParadaQueDetiene, Resultado } from "@/lib/produccion/tipos"

/*
 * Líneas: el estado CONTINUO de las 3 líneas — antes vivía como pestaña
 * compartida adentro de EstadoPlantaTabs.tsx, ahora es su propia pieza y
 * su propia página (src/pages/apps/Lineas.tsx), más una sección
 * embebida en Status (revisión de INICIO) — ver
 * plan-rework-3-modulos-y-merma.md, Fase 1: "la página de líneas debe
 * ser su propia página como tal". Mismo prop "modo" que Tanques
 * (EstadoPlantaTabs.tsx) — ver el comentario ahí para el detalle
 * status/preparación.
 *
 * Costura #1 del plan: activar una corrida necesita leer, de solo
 * lectura, qué tanques están Listos — por eso llama a usePreparacion()
 * acá adentro además de useProduccion(), sin usar ninguna mutación de
 * Preparación.
 *
 * La tarjeta de cada línea y sus paneles viven en src/components/lineas/.
 */
export function LineasEstadoPlanta({
  modo,
  turnoId,
}: {
  modo: ModoEstadoPlanta
  /** Turno a mostrar/editar — omitido usa el turno en vivo (ver usePreparacion). Superadmin en modo corrección lo pisa. */
  turnoId?: string | null
}) {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const { tanques, cargando: cargandoPreparacion } = usePreparacion(turnoId)
  const produccion = useProduccion(turnoId)
  const { corridas, lineasEstado, cargando: cargandoProduccion } = produccion

  // Qué parada (+1) tiene detenida a cada línea: hasta completarla no se termina el CIP.
  const sesion = useSesionTurno()
  const idTurno = turnoId === undefined ? sesion.turnoId : turnoId
  const [paradasDetienen, setParadasDetienen] = useState<ParadaQueDetiene[]>([])
  const recargarParadas = useCallback(async () => {
    setParadasDetienen(idTurno ? await paradasQueDetienenLineas(idTurno) : [])
  }, [idTurno])
  useEffect(() => {
    void recargarParadas()
  }, [recargarParadas])

  /** Después de un CIP o de terminarlo, se vuelve a leer qué parada detiene a cada línea. */
  function yRecargarParadas<A extends unknown[]>(fn: (...args: A) => Promise<Resultado>) {
    return async (...args: A) => {
      const resultado = await fn(...args)
      if (resultado.ok) await recargarParadas()
      return resultado
    }
  }

  if (cargandoCatalogos || cargandoPreparacion || cargandoProduccion) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const acciones: AccionesLinea = {
    activar: produccion.activarLinea,
    pausar: yRecargarParadas(produccion.pausarLinea),
    continuar: yRecargarParadas(produccion.continuarLinea),
    detener: produccion.detenerLineaPorFalla,
    continuarSiguienteLote: produccion.continuarSiguienteLote,
    seguirMismoLote: produccion.seguirMismoLote,
    confirmarEstado: produccion.confirmarEstadoLinea,
    cambiarCondicion: produccion.cambiarCondicionLinea,
    ponerEnCip: yRecargarParadas(produccion.ponerLineaEnCip),
    terminarCip: yRecargarParadas(produccion.terminarCip),
    continuarCorridaDetenida: produccion.continuarCorridaDetenida,
    terminarLinea: produccion.terminarLinea,
  }
  const tanquesListos = tanques.filter((t) => t.condicion === "LISTO")

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
      {lineas
        .filter((l) => l.activo)
        .map((l) => (
          <LineaCard
            key={l.codigo}
            lineaCodigo={l.codigo}
            nombreLinea={l.nombre}
            modo={modo}
            areaCodigo={session?.area ?? null}
            lineaTurno={corridas.find((c) => c.linea === l.codigo && c.activa) ?? null}
            corridaEsperandoPt={corridas.find((c) => c.linea === l.codigo && c.esperandoCierre) ?? null}
            lineaEstado={lineasEstado.find((le) => le.linea === l.codigo) ?? null}
            tanquesListos={tanquesListos}
            presentaciones={presentaciones}
            velocidades={velocidades}
            paradaQueDetiene={paradasDetienen.find((p) => p.linea === l.codigo && p.pendiente) ?? null}
            acciones={acciones}
          />
        ))}
    </div>
  )
}
