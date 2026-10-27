import { describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import type { RolCodigo } from "@/lib/catalogos"
import { agruparPorSeccion, bloqueoDeApp } from "@/lib/navegacion"

const principales = apps.filter((a) => !a.atajo)
const titulos = (rol?: Parameters<typeof agruparPorSeccion>[2]) => agruparPorSeccion(principales, false, rol).map((s) => s.titulo)

describe("agruparPorSeccion", () => {
  it("rol jefe y analista: Auditoría, Base de Datos y Producción, en ese orden", () => {
    for (const rol of ["JEFE_PRODUCCION", "ANALISTA"] as const) {
      expect(titulos(rol).slice(0, 3)).toEqual(["Auditoría", "Base de Datos", "Producción"])
    }
  })

  it("los demás siguen con Producción primero", () => {
    expect(titulos("SUPERVISOR")[0]).toBe("Producción")
    expect(titulos()[0]).toBe("Producción")
  })
})

describe("atajos", () => {
  it("en orden: paneles, Indicadores (amarillo), Manual y Programación; Calculadoras ya no", () => {
    const atajos = apps.filter((a) => a.atajo).map((a) => a.slug)
    expect(atajos.filter((s) => ["panel-produccion", "panel-paradas", "indicadores", "manual", "programacion"].includes(s))).toEqual([
      "panel-produccion",
      "panel-paradas",
      "indicadores",
      "manual",
      "programacion",
    ])
    expect(atajos).not.toContain("calculadoras")
    expect(apps.find((a) => a.slug === "indicadores")?.color).toBe("warning")
  })
})

describe("bloqueoDeApp en la continuidad de las 22:30", () => {
  const app = (slug: string) => apps.find((a) => a.slug === slug)!
  const continuidad = { codigo: "A20261019_T3G1", finalizableDesde: "00:30" }

  it("Finalizar Turno queda con candado hasta la hora; el resto sigue igual", () => {
    expect(bloqueoDeApp(app("finalizar-turno"), true, false, continuidad)).toMatchObject({ bloqueada: true, habilitaA: "00:30" })
    expect(bloqueoDeApp(app("finalizar-turno"), true, false, null).bloqueada).toBe(false)
    expect(bloqueoDeApp(app("producto-terminado"), true, false, continuidad).bloqueada).toBe(false)
  })
})

describe("Mantenimiento y Líneas", () => {
  const lineas = apps.find((a) => a.slug === "lineas")!

  it("Líneas no se bloquea para Mantenimiento sin turno, pero sí para las demás áreas", () => {
    expect(bloqueoDeApp(lineas, false, false, null, "MANTENIMIENTO").bloqueada).toBe(false)
    expect(bloqueoDeApp(lineas, false, false, null, "ASEPTICO").bloqueada).toBe(true)
    expect(bloqueoDeApp(lineas, false, false).bloqueada).toBe(true)
  })

  it("ya no hay una pantalla propia de Mantenimiento", () => {
    expect(apps.find((a) => a.slug === "mantenimiento")).toBeUndefined()
    expect(apps.some((a) => a.href === "/mantenimiento")).toBe(false)
  })
})

describe("Reportes de paradas", () => {
  const reportes = apps.find((a) => a.slug === "reportes-paradas")!
  const sesion = (rol: RolCodigo, esDueno = false): Session => ({
    username: "prueba",
    nombre: "Prueba",
    cedula: null,
    area: rol === "MANTENIMIENTO" ? "MANTENIMIENTO" : "ASEPTICO",
    rol,
    esDueno,
    permisos: [],
    debeCompletarPerfil: false,
  })

  it("el supervisor no la ve", () => {
    expect(puedeVerApp(sesion("SUPERVISOR"), reportes)).toBe(false)
  })

  it("la ven el Jefe, la Analista, Mantenimiento y la dueña", () => {
    for (const rol of ["JEFE_PRODUCCION", "ANALISTA", "MANTENIMIENTO", "SUPERADMINISTRADOR"] as const) {
      expect(puedeVerApp(sesion(rol), reportes)).toBe(true)
    }
  })

  it("ya no está en el flujo ni en lo rápido del supervisor", () => {
    expect(apps.find((a) => a.slug === "paradas")).toBeUndefined()
  })
})

describe("Códigos de Mantenimiento", () => {
  const app = apps.find((a) => a.slug === "codigos-mantenimiento")!
  const sesion = (rol: RolCodigo): Session => ({
    username: "u",
    nombre: "U",
    cedula: null,
    area: rol === "MANTENIMIENTO" ? "MANTENIMIENTO" : "ASEPTICO",
    rol,
    esDueno: false,
    permisos: [],
    debeCompletarPerfil: false,
  })

  it("lo ven Mantenimiento y el Super Administrador; ningún rol de Producción", () => {
    expect(puedeVerApp(sesion("MANTENIMIENTO"), app)).toBe(true)
    expect(puedeVerApp(sesion("SUPERADMINISTRADOR"), app)).toBe(true)
    for (const rol of ["SUPERVISOR", "JEFE_PRODUCCION", "ANALISTA", "VISTA"] as const) {
      expect(puedeVerApp(sesion(rol), app)).toBe(false)
    }
  })
})
