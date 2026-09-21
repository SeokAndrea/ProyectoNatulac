import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { generarActaPdf } from "@/lib/actaPdf"
import { cargarParadasDelTurno } from "@/lib/paradasCatalogo"
import { miTurnoDetalle, misTurnosSinActa, subirYRegistrarActa } from "@/lib/historialTurnos"
import { listarLecturasServiciosIndustrialesDeTurno } from "@/lib/panelProduccion"

/**
 * Si el cron cerró alguno de tus turnos solo (abandonado — ver
 * cerrar_turnos_vencidos, migración 20261030) todavía no tiene acta:
 * el PDF (jsPDF) solo puede generarse en un navegador, nunca desde el
 * cron, así que no existe "en el instante" del cierre automático. Lo
 * más cerca que se puede llegar sin una Edge Function nueva: generarlo
 * ACÁ, la próxima vez que ese supervisor abre el Hub — mismo jsPDF de
 * siempre, con los datos ya congelados del turno. Silencioso: no hay
 * nada que el supervisor tenga que hacer, el acta aparece sola en Mis
 * Actas. Ver migración 20261058.
 */
export function useGenerarActasPendientes(): void {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades } = useCatalogosLive()
  const yaCorrio = useRef(false)

  useEffect(() => {
    if (yaCorrio.current) return
    if (!session || session.rol !== "SUPERVISOR" || session.area === "PRUEBAS") return
    if (lineas.length === 0) return // catálogos todavía no cargaron
    yaCorrio.current = true

    misTurnosSinActa(session.username).then(async (pendientes) => {
      for (const { turnoId } of pendientes) {
        const turno = await miTurnoDetalle(session.username, turnoId)
        if (!turno) continue
        const serviciosIndustriales = await listarLecturasServiciosIndustrialesDeTurno(turnoId)
        const paradas = await cargarParadasDelTurno(turnoId)
        try {
          const blob = await generarActaPdf({
            codigo: turno.codigo,
            fecha: turno.fecha,
            turnoTipo: turno.turnoTipo,
            grupo: turno.grupo,
            tanquesEncontrados: turno.tanquesEncontrados,
            tanques: turno.tanques,
            preparaciones: turno.preparaciones,
            corridas: turno.corridas,
            contadores: turno.contadores,
            productoTerminado: turno.productoTerminado,
            novedades: turno.novedades,
            ajustesVolumen: turno.ajustesVolumen,
            paradas,
            serviciosIndustriales,
            supervisorNombre: session.nombre || session.username,
            area: session.area,
            lineas,
            presentaciones,
            velocidades,
          })
          await subirYRegistrarActa(session.username, turnoId, session.area ?? "SIN_AREA", turno.codigo, blob)
        } catch {
          // Sin acá no se pierde nada: mis_turnos_sin_acta() lo vuelve a traer en la próxima visita mientras no tenga acta VIGENTE.
        }
      }
    })
  }, [session, lineas, presentaciones, velocidades])
}
