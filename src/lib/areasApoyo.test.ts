import { describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import { cargosDeArea, cargoValeEnArea, esAreaDeApoyo, rolPermitidoEnArea, type AreaCodigo, type RolCodigo } from "@/lib/catalogos"

function sesion(area: AreaCodigo, rol: RolCodigo, permisos: Session["permisos"] = []): Session {
  return { username: "prueba", nombre: "Prueba", cedula: null, area, rol, esDueno: false, permisos, debeCompletarPerfil: false }
}
const visibles = (s: Session) => apps.filter((a) => puedeVerApp(s, a)).map((a) => a.slug)
const PRODUCCION = ["comenzar-turno", "preparacion", "lineas", "producto-terminado", "finalizar-turno", "mis-actas", "programacion"]
const PERMISOS_SUPERVISOR: Session["permisos"] = ["TURNO_ASUMIR", "TURNO_CARGAR", "PARADAS_REGISTRAR"]

describe("áreas de apoyo", () => {
  it("Calidad, Mantenimiento, Servicios Industriales y Otros son de apoyo; Aséptico, Pruebas y sin área no", () => {
    expect(["CALIDAD", "MANTENIMIENTO", "SERVICIOS_INDUSTRIALES", "OTROS"].every(esAreaDeApoyo)).toBe(true)
    expect([esAreaDeApoyo("ASEPTICO"), esAreaDeApoyo("PRUEBAS"), esAreaDeApoyo(null)]).toEqual([false, false, false])
  })

  it("las tarjetas de producción las decide el rol, no el área", () => {
    expect(visibles(sesion("ASEPTICO", "SUPERVISOR", PERMISOS_SUPERVISOR))).toEqual(expect.arrayContaining(PRODUCCION))
    expect(visibles(sesion("MANTENIMIENTO", "MANTENIMIENTO", ["PARADAS_MANTENIMIENTO", "SIF_GESTIONAR"])).filter((s) => PRODUCCION.includes(s))).toEqual(["lineas"]) // Líneas en Modo Paradas, sin abrir turno
    expect(visibles(sesion("CALIDAD", "CALIDAD", ["LOTE_LIBERAR"])).filter((s) => PRODUCCION.includes(s))).toEqual([])
  })

  it("Servicios Industriales ve solo sus dos tarjetas (y los accesos de todos)", () => {
    expect(visibles(sesion("SERVICIOS_INDUSTRIALES", "SERVICIOS_INDUSTRIALES")).sort()).toEqual([
      "manual",
      "panel-paradas",
      "panel-produccion",
      "registros-servicios-industriales",
      "servicios-industriales",
    ])
  })

  it("la tarjeta de Calidad es de los roles de Calidad: el Jefe no la ve aunque libere lotes", () => {
    expect(visibles(sesion("CALIDAD", "SUPERVISOR_CALIDAD", ["LOTE_LIBERAR", "CALIDAD_PARAMETROS"]))).toContain("calidad")
    expect(visibles(sesion("ASEPTICO", "JEFE_PRODUCCION", ["LOTE_LIBERAR", "TURNO_CARGAR"]))).not.toContain("calidad")
  })

  it("Validar jornada sigue en prueba: solo el Área de Pruebas", () => {
    expect(visibles(sesion("ASEPTICO", "ANALISTA", ["VALIDAR"]))).not.toContain("validar-jornada")
    expect(visibles(sesion("PRUEBAS", "ANALISTA", ["VALIDAR"]))).toContain("validar-jornada")
  })

  it("Mantenimiento ve Reportes de paradas", () => {
    expect(visibles(sesion("MANTENIMIENTO", "MANTENIMIENTO", ["PARADAS_MANTENIMIENTO"]))).toContain("reportes-paradas")
  })
})

describe("roles por área", () => {
  it("Calidad y Servicios Industriales solo con sus roles; Otros solo Solo Vista; Pruebas, cualquiera", () => {
    expect(rolPermitidoEnArea("SUPERVISOR", "SERVICIOS_INDUSTRIALES")).toBe(false)
    expect(rolPermitidoEnArea("SERVICIOS_INDUSTRIALES", "SERVICIOS_INDUSTRIALES")).toBe(true)
    expect(rolPermitidoEnArea("SERVICIOS_INDUSTRIALES", "ASEPTICO")).toBe(false)
    expect(rolPermitidoEnArea("CALIDAD", "ASEPTICO")).toBe(false)
    expect(rolPermitidoEnArea("SUPERVISOR", "OTROS")).toBe(false)
    expect(rolPermitidoEnArea("VISTA", "OTROS")).toBe(true)
    expect(rolPermitidoEnArea("VISTA", "ASEPTICO")).toBe(true)
    expect(rolPermitidoEnArea("SERVICIOS_INDUSTRIALES", "PRUEBAS")).toBe(true)
  })

  it("en Mantenimiento solo va su rol (o Solo Vista), y su rol no va en Producción", () => {
    expect(rolPermitidoEnArea("MANTENIMIENTO", "MANTENIMIENTO")).toBe(true)
    expect(rolPermitidoEnArea("VISTA", "MANTENIMIENTO")).toBe(true)
    expect(rolPermitidoEnArea("JEFE_PRODUCCION", "MANTENIMIENTO")).toBe(false)
    expect(rolPermitidoEnArea("ANALISTA", "MANTENIMIENTO")).toBe(false)
    expect(rolPermitidoEnArea("SUPERVISOR", "MANTENIMIENTO")).toBe(false)
    expect(rolPermitidoEnArea("MANTENIMIENTO", "ASEPTICO")).toBe(false)
    expect(rolPermitidoEnArea("MANTENIMIENTO", "PRUEBAS")).toBe(true)
  })
})

describe("cargos por área", () => {
  it("Producción y Calidad tienen sus cargos; Pruebas, los dos; sin área, todos", () => {
    expect(cargosDeArea("ASEPTICO").map((c) => c.codigo)).toContain("SUPERVISOR")
    expect(cargosDeArea("ASEPTICO").map((c) => c.codigo)).not.toContain("ANALISTA_CALIDAD")
    expect(cargosDeArea("CALIDAD").map((c) => c.codigo)).toEqual(["JEFE_CALIDAD", "SUPERVISOR_CALIDAD", "ANALISTA_CALIDAD"])
    expect(cargosDeArea("PRUEBAS").length).toBe(cargosDeArea(null).length)
    expect(cargosDeArea("MANTENIMIENTO").map((c) => c.codigo)).toEqual(["JEFE_MANTENIMIENTO", "SUPERVISOR_MANTENIMIENTO", "TECNICO_MANTENIMIENTO"])
    expect(cargosDeArea("SERVICIOS_INDUSTRIALES")).toEqual([])
  })

  it("al cambiar de área, un cargo que no va ahí deja de valer", () => {
    expect(cargoValeEnArea("SUPERVISOR", "CALIDAD")).toBe(false)
    expect(cargoValeEnArea("SUPERVISOR", "ASEPTICO")).toBe(true)
    expect(cargoValeEnArea("", "MANTENIMIENTO")).toBe(true)
  })
})
