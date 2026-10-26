import { describe, expect, it } from "vitest"
import type { ItemInventario } from "@/lib/inventario"
import {
  cantidadConUnidad,
  conteosDelBorrador,
  diferenciaPulpa,
  empaqueDe,
  errorFilaEmpaque,
  errorFilaMateriaPrima,
  saboresDe,
  textoDiferencia,
} from "./calculosInventario"

const item = (over: Partial<ItemInventario>) => ({ seccion: "MATERIA_PRIMA", saldo: null, ...over }) as ItemInventario

describe("agrupar", () => {
  it("pulpa y kits de cada sabor juntos; el empaque aparte", () => {
    const items = [
      item({ item: "PULPA:a", tipo: "PULPA", saborId: "a", nombre: "Durazno" }),
      item({ item: "KITS:a", tipo: "KITS", saborId: "a", nombre: "Durazno" }),
      item({ item: "EMPAQUE:CAJAS_1000", tipo: "EMPAQUE", seccion: "EMPAQUE", empaqueCodigo: "CAJAS_1000", nombre: "Cajas 1000 ml" }),
    ]
    const sabores = saboresDe(items)
    expect(sabores).toHaveLength(1)
    expect(sabores[0].pulpa.item).toBe("PULPA:a")
    expect(sabores[0].kits.item).toBe("KITS:a")
    expect(empaqueDe(items).map((e) => e.item)).toEqual(["EMPAQUE:CAJAS_1000"])
  })
})

describe("filas del formulario", () => {
  it("materia prima: sabor + pulpa y/o kits, enteros", () => {
    expect(errorFilaMateriaPrima({ clave: 1, saborId: "", pulpa: "", kits: "" })).toBeNull()
    expect(errorFilaMateriaPrima({ clave: 1, saborId: "a", pulpa: "", kits: "" })).toBe("Escribe la pulpa o los kits.")
    expect(errorFilaMateriaPrima({ clave: 1, saborId: "", pulpa: "4", kits: "" })).toBe("Elige el sabor.")
    expect(errorFilaMateriaPrima({ clave: 1, saborId: "a", pulpa: "2.5", kits: "" })).toBe("Usa números enteros, sin negativos.")
    expect(errorFilaMateriaPrima({ clave: 1, saborId: "a", pulpa: "", kits: "3" })).toBeNull()
  })

  it("empaque: material + cantidad", () => {
    expect(errorFilaEmpaque({ clave: 1, codigo: "", cantidad: "" })).toBeNull()
    expect(errorFilaEmpaque({ clave: 1, codigo: "CAJAS_1000", cantidad: "" })).toBe("Escribe la cantidad.")
    expect(errorFilaEmpaque({ clave: 1, codigo: "", cantidad: "5" })).toBe("Elige el material.")
    expect(errorFilaEmpaque({ clave: 1, codigo: "CAJAS_1000", cantidad: "-1" })).toBe("Usa números enteros, sin negativos.")
  })

  it("lo que se guarda: solo filas completas; pulpa y kits por separado", () => {
    expect(
      conteosDelBorrador(
        [
          { clave: 1, saborId: "a", pulpa: "28", kits: "10" },
          { clave: 2, saborId: "b", pulpa: "", kits: "4" },
          { clave: 3, saborId: "", pulpa: "", kits: "" },
          { clave: 4, saborId: "c", pulpa: "x", kits: "" },
        ],
        [
          { clave: 5, codigo: "CAJAS_1000", cantidad: "850" },
          { clave: 6, codigo: "TAPAS_BLANCAS", cantidad: "" },
        ],
      ),
    ).toEqual([
      { tipo: "PULPA", saborId: "a", empaqueCodigo: null, contado: 28 },
      { tipo: "KITS", saborId: "a", empaqueCodigo: null, contado: 10 },
      { tipo: "KITS", saborId: "b", empaqueCodigo: null, contado: 4 },
      { tipo: "EMPAQUE", saborId: null, empaqueCodigo: "CAJAS_1000", contado: 850 },
    ])
  })

  it("diferencia de pulpa contra lo que espera el sistema", () => {
    const pulpa = item({ tipo: "PULPA", saldo: 28 })
    expect(diferenciaPulpa(pulpa, "26")).toBe(-2)
    expect(diferenciaPulpa(pulpa, "")).toBeNull()
    expect(diferenciaPulpa(item({ tipo: "PULPA", saldo: null }), "40")).toBeNull()
  })
})

describe("textos", () => {
  it("singular y plural", () => {
    expect(cantidadConUnidad(1, "tambores")).toBe("1 tambor")
    expect(cantidadConUnidad(1, "rollos")).toBe("1 rollo")
    expect(cantidadConUnidad(24000, "unidades")).toBe("24.000 unidades")
    expect(textoDiferencia(0, "tambores")).toBe("Cuadra")
    expect(textoDiferencia(-1, "tambores")).toBe("Falta 1 tambor")
    expect(textoDiferencia(-2, "tambores")).toBe("Faltan 2 tambores")
    expect(textoDiferencia(3, "tambores")).toBe("Sobran 3 tambores")
  })
})
