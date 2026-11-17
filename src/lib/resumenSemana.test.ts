import { describe, expect, it } from "vitest"
import type { ItemDia } from "@/lib/resumenDia"
import { cajasPorSaborYDia, diasDeSemana, lunesDeSemana, resumenPorDia, textoSemana, type DiaDeSemana } from "@/lib/resumenSemana"

const item = (saborNombre: string, volumenMl: number, cajasOficiales: number, estado: ItemDia["estado"] = "CONFIRMADO", cajasSupervisor = cajasOficiales): ItemDia => ({
  saborNombre,
  volumenMl,
  cajasSupervisor,
  estado,
  cajasOficiales,
  nota: null,
  validadoPorNombre: null,
})

const dia = (fecha: string, items: ItemDia[], nitrogenoConsumo: number | null = null): DiaDeSemana => ({
  fecha,
  etiqueta: "Lun",
  turnos: [],
  porTurno: [],
  items,
  paradas: [],
  nitrogenoConsumo,
})

describe("semana del Resumen Diario", () => {
  it("lunes a domingo: el lunes de cualquier día de la semana", () => {
    // 2026-11-17 es martes.
    expect(lunesDeSemana("2026-11-17")).toBe("2026-11-16")
    expect(lunesDeSemana("2026-11-16")).toBe("2026-11-16")
    expect(lunesDeSemana("2026-11-22")).toBe("2026-11-16") // domingo
    expect(lunesDeSemana("2026-11-23")).toBe("2026-11-23")
    expect(lunesDeSemana("2027-01-01")).toBe("2026-12-28") // cruza el año
    expect(diasDeSemana("2026-11-16")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"])
    expect(textoSemana("2026-11-16")).toBe("16/11 – 22/11")
  })

  it("cajas por sabor: una columna por día y el total con el número oficial", () => {
    const dias = [
      dia("2026-11-16", [item("Pera", 1000, 100), item("Durazno", 250, 40, "EDITADO", 50)]),
      dia("2026-11-17", [item("Pera", 1000, 30)]),
      dia("2026-11-18", []),
    ]
    expect(cajasPorSaborYDia(dias)).toEqual([
      { saborNombre: "Durazno", volumenMl: 250, porTurno: [40, 0, 0], oficial: 40, supervisores: 50, corregida: true },
      { saborNombre: "Pera", volumenMl: 1000, porTurno: [100, 30, 0], oficial: 130, supervisores: 130, corregida: false },
    ])
  })

  it("por día: cajas, sin validar, nitrógeno y los días que no llegaron", () => {
    const filas = resumenPorDia(
      [dia("2026-11-16", [item("Pera", 1000, 100), item("Pera", 250, 5, "PENDIENTE")], 3), dia("2026-11-17", [], null), dia("2026-11-18", [])],
      "2026-11-17",
    )
    expect(filas.map((f) => [f.etiqueta, f.cajas, f.sinValidar, f.nitrogenoConsumo, f.futuro])).toEqual([
      ["Lun 16/11", 105, 1, 3, false],
      ["Lun 17/11", 0, 0, null, false],
      ["Lun 18/11", 0, 0, null, true],
    ])
  })
})
