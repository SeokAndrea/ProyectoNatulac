import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { misTurnosSinActa } from "@/lib/historialTurnos"
import { regenerarActaDeMiTurno } from "@/lib/regenerarActa"

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
    // Cualquiera que pueda asumir turnos (no solo el rol Supervisor: esta semana los abrieron también Super Administradores).
    if (!session || !puede(session, "TURNO_ASUMIR") || session.area === "PRUEBAS") return
    if (lineas.length === 0) return // catálogos todavía no cargaron
    yaCorrio.current = true

    misTurnosSinActa(session.username).then(async (pendientes) => {
      for (const { turnoId } of pendientes) {
        // Si falla no se pierde nada: mis_turnos_sin_acta() lo vuelve a traer en la próxima visita mientras no tenga acta VIGENTE.
        await regenerarActaDeMiTurno(session, turnoId, { lineas, presentaciones, velocidades })
      }
    })
  }, [session, lineas, presentaciones, velocidades])
}
