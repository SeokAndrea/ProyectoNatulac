import { describe, expect, it } from "vitest"
import type { FilaInventario } from "@/lib/inventario"
import { cantidadConUnidad, conteosParaGuardar, diferenciaDe, errorDeFila, esperado, textoDiferencia } from "./calculosInventario"

const fila = (saborId: string, saldo: number | null, unidad: FilaInventario["unidad"] = "tambores") =>
  ({ saborId, saldo, unidad }) as FilaInventario

describe("esperado y diferencia", () => {
  it("lo que debería haber = saldo + lo que llegó", () => {
    expect(esperado(fila("a", 28), { llego: "", contado: "" })).toBe(28)
    expect(esperado(fila("a", 28), { llego: "20", contado: "" })).toBe(48)
    expect(esperado(fila("a", null), { llego: "20", contado: "" })).toBeNull()
  })

  it("contado − esperado (lo que llegó no es diferencia)", () => {
    expect(diferenciaDe(fila("a", 28), { llego: "20", contado: "46" })).toBe(-2)
    expect(diferenciaDe(fila("a", 28), { llego: "", contado: "30" })).toBe(2)
    expect(diferenciaDe(fila("a", 28), { llego: "", contado: "" })).toBeNull()
    expect(diferenciaDe(fila("a", null), { llego: "", contado: "40" })).toBeNull()
  })
})

describe("validación y lo que se guarda", () => {
  it("enteros sin negativos; si llegó algo hay que contar", () => {
    expect(errorDeFila({ llego: "", contado: "" })).toBeNull()
    expect(errorDeFila({ llego: "2.5", contado: "3" })).toBe("Usa números enteros, sin negativos.")
    expect(errorDeFila({ llego: "", contado: "-1" })).toBe("Usa números enteros, sin negativos.")
    expect(errorDeFila({ llego: "5", contado: "" })).toBe("Falta lo contado.")
  })

  it("solo las filas con conteo escrito y sin errores", () => {
    const filas = [fila("a", 28), fila("b", 10), fila("c", null), fila("d", 3)]
    expect(
      conteosParaGuardar(filas, {
        a: { llego: "20", contado: "46" },
        b: { llego: "", contado: "" },
        c: { llego: "", contado: "40" },
        d: { llego: "1", contado: "x" },
      }),
    ).toEqual([
      { saborId: "a", contado: 46, llego: 20 },
      { saborId: "c", contado: 40, llego: 0 },
    ])
  })
})

describe("textos", () => {
  it("singular y plural", () => {
    expect(cantidadConUnidad(1, "tambores")).toBe("1 tambor")
    expect(cantidadConUnidad(1200, "kits")).toBe("1.200 kits")
    expect(textoDiferencia(0, "kits")).toBe("Cuadra")
    expect(textoDiferencia(-1, "kits")).toBe("Falta 1 kit")
    expect(textoDiferencia(-2, "tambores")).toBe("Faltan 2 tambores")
    expect(textoDiferencia(1, "tambores")).toBe("Sobra 1 tambor")
  })
})
