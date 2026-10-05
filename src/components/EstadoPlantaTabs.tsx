import { Loader2 } from "lucide-react"
import { TanqueCard } from "@/components/tanques/TanqueCard"
import type { AccionesTanque } from "@/components/tanques/tipos"
import { useAuth } from "@/lib/auth"
import { useAnalisisCalidad, useCalidadLibera } from "@/lib/calidad"
import { puede } from "@/lib/permisos"
import type { Sabor } from "@/lib/sabores"
import { useSesionTurno } from "@/lib/sesionTurno"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"

export type ModoEstadoPlanta = "status" | "preparacion"

/*
 * Tanques: el estado CONTINUO de la planta, compartido entre la
 * revisión de inicio (src/components/RevisionInicioTurno.tsx, dentro
 * de Comenzar Turno) y Preparación (src/pages/apps/Preparacion.tsx)
 * — mismo dato, pero con acciones DISTINTAS según el prop "modo":
 *   - "status": el paso de revisión de INICIO (Confirmar/Editar, ver
 *     ConfirmarEstadoTanque) + "Corregir" si algo no coincide con la
 *     realidad después de confirmado (mismo TanqueEditForm que usa
 *     "Editar" — nombre distinto porque es un momento distinto, pero
 *     es la misma acción). Sin botones para arrancar algo nuevo.
 *   - "preparacion": todas las acciones para arrancar algo nuevo.
 *
 * Liberar: en las áreas con «Calidad libera» encendido lo hace Calidad al
 * registrar un análisis conforme (src/pages/apps/Calidad.tsx), y el tanque
 * En Preparación muestra si espera a Calidad o el resultado del último
 * análisis. Apagado, el supervisor libera acá con «Liberar».
 *
 * Ciclo de vida de un tanque (modo "preparacion"): Limpio/Sucio (o
 * incluso ya Listo, para arrancar un lote nuevo que reemplaza al
 * actual) → "Iniciar Preparación" (sabor + tambores; el volumen sale
 * solo de tambores × sabor.volumen) → En Preparación (no liberado) →
 * "Liberar" (o Calidad, si el área lo tiene encendido) → Listo (recién ahí una corrida lo puede tomar). Limpio y
 * Vacío eran la misma cosa (nada adentro, disponible) — se fusionaron
 * en Limpio, que además puede llegar de CIP (limpieza terminada).
 *
 * Líneas dejó de vivir acá — es su propia pieza, LineasEstadoPlanta
 * (src/components/LineasEstadoPlanta.tsx), y su propia página, Líneas
 * (src/pages/apps/Lineas.tsx) — ver plan-rework-3-modulos-y-merma.md,
 * Fase 1: "la página de líneas debe ser su propia página como tal".
 * Este componente todavía necesita leer, de solo lectura, las corridas
 * del módulo Producción — para saber si el tanque que se está por
 * transferir/reactivar tiene una corrida activa tomando de él ahora
 * mismo — por eso llama a useProduccion() acá adentro, sin usar
 * ninguna de sus mutaciones.
 *
 * La tarjeta de cada tanque y sus paneles viven en src/components/tanques/.
 */
export function EstadoPlantaTabs({
  sabores,
  modo,
  turnoId: turnoIdProp,
}: {
  sabores: Sabor[]
  modo: ModoEstadoPlanta
  /** Turno a mostrar/editar — omitido usa el turno en vivo (ver usePreparacion). Superadmin en modo corrección lo pisa. */
  turnoId?: string | null
}) {
  const { session } = useAuth()
  const preparacion = usePreparacion(turnoIdProp)
  const { tanques, preparaciones, cargando } = preparacion
  const { corridas, cargando: cargandoProduccion } = useProduccion(turnoIdProp)
  const sesion = useSesionTurno()
  const turnoId = turnoIdProp === undefined ? sesion.turnoId : turnoIdProp
  const lotesAbiertos = preparaciones.filter((p) => !p.liberadoEn && !p.cerradoEn).map((p) => p.id)
  const { porLote: analisisPorLote } = useAnalisisCalidad(lotesAbiertos)
  const puedeIrACalidad = puede(session, "LOTE_LIBERAR") || session?.area === "PRUEBAS"
  const calidadLibera = useCalidadLibera(session?.area ?? null)

  if (cargando || cargandoProduccion) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const acciones: AccionesTanque = {
    cambiarCondicion: preparacion.cambiarCondicionTanque,
    confirmarEstado: preparacion.confirmarEstadoTanque,
    iniciarPreparacion: preparacion.iniciarPreparacion,
    liberarLote: preparacion.liberarLote,
    ajustar: preparacion.ajustarPreparacion,
    fijarVolumenLote: preparacion.fijarVolumenLote,
    transferir: preparacion.transferirTanque,
    desvasar: preparacion.desvasarTanque,
    medirTanque: preparacion.medirTanque,
    capturarRestoOrigen: preparacion.capturarRestoOrigenTransferencia,
  }

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3">
      {tanques.map((t) => (
        <TanqueCard
          key={t.numeroTanque}
          tanque={t}
          sabores={sabores}
          modo={modo}
          preparaciones={preparaciones.filter((p) => p.numeroTanque === t.numeroTanque)}
          tanquesDelTurno={tanques}
          corridasDelTurno={corridas}
          areaCodigo={session?.area ?? null}
          usuarioSesion={session?.username ?? ""}
          analisisPorLote={analisisPorLote}
          calidadLibera={calidadLibera}
          puedeIrACalidad={puedeIrACalidad}
          turnoId={turnoId}
          acciones={acciones}
        />
      ))}
    </div>
  )
}
