import { describe, expect, it } from "vitest"
import { apps } from "@/lib/apps"
import { agruparPorSeccion } from "@/lib/navegacion"

const principales = apps.filter((a) => !a.atajo)
const titulos = (cargo?: Parameters<typeof agruparPorSeccion>[2]) => agruparPorSeccion(principales, false, cargo).map((s) => s.titulo)

describe("agruparPorSeccion", () => {
  it("cargo jefe y analista (aunque su rol sea Super Administrador): Auditoría, Base de Datos y Producción, en ese orden", () => {
    for (const cargo of ["JEFE_PRODUCCION", "ANALISTA_PRODUCCION"] as const) {
      expect(titulos(cargo).slice(0, 3)).toEqual(["Auditoría", "Base de Datos", "Producción"])
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
