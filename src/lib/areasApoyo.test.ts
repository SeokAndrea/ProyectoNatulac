import { describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import { cargosDeArea, cargoValeEnArea, esAreaDeApoyo, type AreaCodigo, type RolCodigo } from "@/lib/catalogos"

function sesion(area: AreaCodigo, rol: RolCodigo, permisos: Session["permisos"] = []): Session {
  return { username: "prueba", nombre: "Prueba", cedula: null, area, rol, esDueno: false, permisos, debeCompletarPerfil: false }
}
const visibles = (s: Session) => apps.filter((a) => puedeVerApp(s, a)).map((a) => a.slug)
const PRODUCCION = ["comenzar-turno", "preparacion", "lineas", "producto-terminado", "finalizar-turno", "mis-actas", "programacion"]
const PERMISOS_SUPERVISOR: Session["permisos"] = ["TURNO_ASUMIR", "TURNO_CARGAR", "PARADAS_REGISTRAR"]

describe("áreas de apoyo", () => {
  it("Calidad, Mantenimiento y Servicios Industriales son de apoyo; Aséptico, Pruebas y sin área no", () => {
    expect(["CALIDAD", "MANTENIMIENTO", "SERVICIOS_INDUSTRIALES"].every(esAreaDeApoyo)).toBe(true)
    expect([esAreaDeApoyo("ASEPTICO"), esAreaDeApoyo("PRUEBAS"), esAreaDeApoyo(null)]).toEqual([false, false, false])
  })

  it("con rol Supervisor, un área de apoyo no ve las tarjetas de producción", () => {
    for (const area of ["SERVICIOS_INDUSTRIALES", "MANTENIMIENTO", "CALIDAD"] as const) {
      expect(visibles(sesion(area, "SUPERVISOR", PERMISOS_SUPERVISOR)).filter((s) => PRODUCCION.includes(s))).toEqual([])
    }
    expect(visibles(sesion("ASEPTICO", "SUPERVISOR", PERMISOS_SUPERVISOR))).toEqual(expect.arrayContaining(PRODUCCION.filter((s) => s !== "programacion")))
  })

  it("Mantenimiento sigue viendo Registrar Paradas", () => {
    expect(visibles(sesion("MANTENIMIENTO", "MANTENIMIENTO", ["PARADAS_MANTENIMIENTO"]))).toContain("paradas")
  })
})

describe("cargos por área", () => {
  it("Producción y Calidad tienen sus cargos; Pruebas, los dos; sin área, todos", () => {
    expect(cargosDeArea("ASEPTICO").map((c) => c.codigo)).toContain("SUPERVISOR")
    expect(cargosDeArea("ASEPTICO").map((c) => c.codigo)).not.toContain("ANALISTA_CALIDAD")
    expect(cargosDeArea("CALIDAD").map((c) => c.codigo)).toEqual(["JEFE_CALIDAD", "SUPERVISOR_CALIDAD", "ANALISTA_CALIDAD"])
    expect(cargosDeArea("PRUEBAS").length).toBe(cargosDeArea(null).length)
    expect(cargosDeArea("MANTENIMIENTO")).toEqual([])
  })

  it("al cambiar de área, un cargo que no va ahí deja de valer", () => {
    expect(cargoValeEnArea("SUPERVISOR", "CALIDAD")).toBe(false)
    expect(cargoValeEnArea("SUPERVISOR", "ASEPTICO")).toBe(true)
    expect(cargoValeEnArea("", "MANTENIMIENTO")).toBe(true)
  })
})
