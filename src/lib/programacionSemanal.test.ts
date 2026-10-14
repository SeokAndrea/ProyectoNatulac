import { describe, expect, it } from "vitest"
import { diasDeSemana, estadoDe, lunesDe, pendienteAl, planDelDia, planDelMes, programacionDe, semanaCerrada, type ItemSemana, type Semana } from "./programacionSemanal"

/*
 * Programación semanal (dueña, 2026-10-14). Semana del lunes 12 al viernes
 * 16 de octubre: Manzana TBA-1000 5000 cajas y Pera TPA-250 3000.
 */
const manzana: ItemSemana = { id: "m", semana: "2026-10-12", saborId: "s-man", saborNombre: "Manzana", presentacionId: "p-1000", presentacionMl: 1000, cajasPlan: 5000 }
const pera: ItemSemana = { id: "p", semana: "2026-10-12", saborId: "s-per", saborNombre: "Pera", presentacionId: "p-250", presentacionMl: 250, cajasPlan: 3000 }

const semana = (over: Partial<Semana> = {}): Semana => ({
  lunes: "2026-10-12",
  items: [manzana, pera],
  decisiones: [{ itemId: "m", fecha: "2026-10-12", estado: "ELEGIDO", lineaCodigo: "LINEA_1" }],
  producido: [{ fecha: "2026-10-12", saborId: "s-man", presentacionId: "p-1000", cajas: 3000 }],
  ...over,
})

describe("semana de lunes a viernes", () => {
  it("el lunes de cualquier día, y los 5 días", () => {
    expect(lunesDe("2026-10-14")).toBe("2026-10-12")
    expect(lunesDe("2026-10-12")).toBe("2026-10-12")
    expect(lunesDe("2026-10-18")).toBe("2026-10-12") // domingo
    expect(diasDeSemana("2026-10-12")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"])
  })

  it("cierra cuando el viernes quedó atrás", () => {
    expect(semanaCerrada("2026-10-12", "2026-10-16")).toBe(false)
    expect(semanaCerrada("2026-10-12", "2026-10-17")).toBe(true)
  })
})

describe("lo pendiente pasa solo al día siguiente", () => {
  it("lunes se planificó Manzana 5000 y se hicieron 3000: el martes aparece con 2000 pendientes, con su línea", () => {
    const s = semana()
    expect(pendienteAl(s, manzana, "2026-10-13")).toBe(2000)
    expect(planDelDia(s, "2026-10-13")).toEqual([{ item: manzana, lineaCodigo: "LINEA_1", viene: true }])
  })

  it("si se terminó, no pasa", () => {
    const s = semana({ producido: [{ fecha: "2026-10-12", saborId: "s-man", presentacionId: "p-1000", cajas: 5000 }] })
    expect(planDelDia(s, "2026-10-13")).toEqual([])
  })

  it("lo que se elige un día se suma a lo que viene; lo quitado deja de pasar", () => {
    const s = semana({
      decisiones: [
        { itemId: "m", fecha: "2026-10-12", estado: "ELEGIDO", lineaCodigo: "LINEA_1" },
        { itemId: "p", fecha: "2026-10-13", estado: "ELEGIDO", lineaCodigo: "LINEA_2" },
        { itemId: "m", fecha: "2026-10-14", estado: "QUITADO", lineaCodigo: null },
      ],
    })
    expect(planDelDia(s, "2026-10-13").map((x) => [x.item.id, x.lineaCodigo, x.viene])).toEqual([
      ["m", "LINEA_1", true],
      ["p", "LINEA_2", false],
    ])
    expect(planDelDia(s, "2026-10-14").map((x) => x.item.id)).toEqual(["p"])
  })

  it("se le puede cambiar la línea a lo que viene", () => {
    const s = semana({
      decisiones: [
        { itemId: "m", fecha: "2026-10-12", estado: "ELEGIDO", lineaCodigo: "LINEA_1" },
        { itemId: "m", fecha: "2026-10-13", estado: "ELEGIDO", lineaCodigo: "LINEA_3" },
      ],
    })
    expect(planDelDia(s, "2026-10-13")).toEqual([{ item: manzana, lineaCodigo: "LINEA_3", viene: true }])
    expect(programacionDe(s, manzana)).toEqual({ primerDia: "2026-10-12", lineaCodigo: "LINEA_3" })
  })
})

describe("estado de cada producto", () => {
  it("en curso, sin programar, cumplido e incumplido al cerrar el viernes", () => {
    const s = semana()
    expect(estadoDe(s, manzana, "2026-10-14").tipo).toBe("EN_CURSO")
    expect(estadoDe(s, pera, "2026-10-14").tipo).toBe("SIN_PROGRAMAR")
    expect(estadoDe(s, manzana, "2026-10-19")).toEqual({ tipo: "INCUMPLIDO", faltan: 2000 })
    const hecha = semana({ producido: [{ fecha: "2026-10-12", saborId: "s-man", presentacionId: "p-1000", cajas: 5200 }] })
    expect(estadoDe(hecha, manzana, "2026-10-19").tipo).toBe("CUMPLIDO")
  })
})

describe("plan para Indicadores", () => {
  it("con la línea con que se programó, en el mes de su primer día; lo no programado va aparte", () => {
    const { conLinea, sinLinea } = planDelMes([semana()], "2026-10-01")
    expect(conLinea).toEqual([{ linea: "1", volumenMl: 1000, cajas: 5000 }])
    expect(sinLinea).toEqual([{ volumenMl: 250, cajas: 3000 }])
    expect(planDelMes([semana()], "2026-09-01")).toEqual({ conLinea: [], sinLinea: [] })
  })
})
