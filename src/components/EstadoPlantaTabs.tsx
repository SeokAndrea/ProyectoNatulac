import { useState } from "react"
import { Loader2 } from "lucide-react"
import { LataPixel } from "@/components/pixel/LataPixel"
import { TanqueCard } from "@/components/tanques/TanqueCard"
import type { AccionesTanque } from "@/components/tanques/tipos"
import { useAuth } from "@/lib/auth"
import { useAnalisisCalidad, useCalidadLibera } from "@/lib/calidad"
import { puede } from "@/lib/permisos"
import type { Sabor } from "@/lib/sabores"
import { useSesionTurno } from "@/lib/sesionTurno"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { useProductoTerminado } from "@/lib/productoTerminado"
import { cn } from "@/lib/utils"

/** El Modo Vacío se recuerda en este navegador (es una comodidad, no un dato). */
const LLAVE_MODO_VACIO = "preparacion.modoVacio"

function leerModoVacio(): boolean {
  try {
    return localStorage.getItem(LLAVE_MODO_VACIO) === "1"
  } catch {
    return false
  }
}

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
 * (src/pages/apps/Lineas.tsx) — ver docs/plan-rework-3-modulos-y-merma.md,
 * Fase 1: "la página de líneas debe ser su propia página como tal".
 * Este componente todavía necesita leer, de solo lectura, las corridas
 * del módulo Producción — para saber si el tanque que se está por
 * transferir/reactivar tiene una corrida activa tomando de él ahora
 * mismo — por eso llama a useProduccion() acá adentro, sin usar
 * ninguna de sus mutaciones.
 *
 * La tarjeta de cada tanque y sus paneles viven en src/components/tanques/.
 *
 * MODO VACÍO (solo en "preparacion"): un interruptor cambia los botones de
 * cada tanque por los de Vacío — Preparar para Vacío, Recibir de Vacío,
 * Entregar / Salida a Vacío, Pasar a Aséptico (PanelVacioTanque). Ver
 * migración 20261109490000.
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
  // Solo para avisar: un lote con corridas sin PT marca litros que ya se envasaron (AvisoPtPendiente).
  const { registros: productoTerminado } = useProductoTerminado(turnoIdProp)
  const sesion = useSesionTurno()
  const turnoId = turnoIdProp === undefined ? sesion.turnoId : turnoIdProp
  const lotesAbiertos = preparaciones.filter((p) => !p.liberadoEn && !p.cerradoEn).map((p) => p.id)
  const { porLote: analisisPorLote } = useAnalisisCalidad(lotesAbiertos)
  const puedeIrACalidad = puede(session, "LOTE_LIBERAR") || session?.area === "PRUEBAS"
  const calidadLibera = useCalidadLibera(session?.area ?? null)
  const [modoVacio, setModoVacio] = useState(leerModoVacio)

  function cambiarModoVacio() {
    const nuevo = !modoVacio
    setModoVacio(nuevo)
    try {
      localStorage.setItem(LLAVE_MODO_VACIO, nuevo ? "1" : "0")
    } catch {
      // Sin almacenamiento: el modo dura hasta recargar.
    }
  }

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
    recibirDeVacio: preparacion.recibirDeVacio,
    entregarAVacio: preparacion.entregarAVacio,
    pasarAAseptico: preparacion.pasarLoteAAseptico,
  }

  const vacioActivo = modo === "preparacion" && modoVacio

  return (
    <div className={cn("mx-auto flex max-w-3xl flex-col gap-2", vacioActivo && "rounded-xl bg-vacio-soft p-2")}>
      {modo === "preparacion" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {vacioActivo && (
            <p className="mr-auto text-xs font-medium text-vacio">
              Modo Vacío: los botones de cada tanque son los de Vacío.
            </p>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={modoVacio}
            onClick={cambiarModoVacio}
            className={cn(
              "flex items-center gap-2 rounded-full border-2 bg-card py-1 pl-1.5 pr-3 text-xs font-bold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vacio",
              modoVacio ? "border-vacio text-vacio" : "border-border text-muted-foreground",
            )}
          >
            <span className={cn("relative h-5 w-9 rounded-full transition-colors", modoVacio ? "bg-vacio" : "bg-border")}>
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 size-4 rounded-full bg-card transition-transform",
                  modoVacio && "translate-x-4",
                )}
              />
            </span>
            <LataPixel saborNombre="Coctel" />
            MODO VACÍO
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
          modoVacio={vacioActivo}
          salidasVacio={preparacion.salidasVacio}
          corridasSinPt={corridas.filter((c) => !productoTerminado.some((p) => p.corridaId === c.id))}
        />
      ))}
      </div>
    </div>
  )
}
