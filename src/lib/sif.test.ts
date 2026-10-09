import { describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"
import { fechaHoraSif, minutosEntre, textoDuracion } from "@/lib/sif"

function sesion(area: AreaCodigo, rol: RolCodigo, permisos: Session["permisos"]): Session {
  return { username: "prueba", nombre: "Prueba", cedula: null, area, rol, esDueno: false, permisos, debeCompletarPerfil: false }
}
const veSif = (s: Session) => puedeVerApp(s, apps.find((a) => a.slug === "solicitudes-intervencion")!)

describe("Solicitudes de Intervención de Falla", () => {
  it("fecha y hora en hora de planta (Caracas, UTC-4)", () => {
    expect(fechaHoraSif("2026-10-09T18:05:00Z")).toBe("09/10/2026 14:05")
    expect(fechaHoraSif(null)).toBe("—")
  })

  it("duración en minutos y en horas", () => {
    expect(minutosEntre("2026-10-09T10:00:00Z", "2026-10-09T10:18:00Z")).toBe(18)
    expect(minutosEntre("2026-10-09T10:00:00Z", null)).toBeNull()
    expect(textoDuracion(18)).toBe("18 min")
    expect(textoDuracion(125)).toBe("2 h 05 min")
    expect(textoDuracion(null)).toBe("—")
  })

  it("la ven Mantenimiento, los supervisores y quien audita; Servicios Industriales no", () => {
    expect(veSif(sesion("MANTENIMIENTO", "MANTENIMIENTO", ["PARADAS_MANTENIMIENTO", "SIF_GESTIONAR"]))).toBe(true)
    expect(veSif(sesion("ASEPTICO", "SUPERVISOR", ["TURNO_ASUMIR", "TURNO_CARGAR", "PARADAS_REGISTRAR"]))).toBe(true)
    expect(veSif(sesion("ASEPTICO", "ANALISTA", ["AUDITORIA_VER"]))).toBe(true)
    expect(veSif(sesion("SERVICIOS_INDUSTRIALES", "SUPERVISOR", ["PARADAS_REGISTRAR"]))).toBe(false)
    expect(veSif(sesion("CALIDAD", "CALIDAD", ["LOTE_LIBERAR"]))).toBe(false)
  })
})
