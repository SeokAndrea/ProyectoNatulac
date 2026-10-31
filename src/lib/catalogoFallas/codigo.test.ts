import { describe, expect, it } from "vitest"
import { componerCodigo, errorSufijo, nombresPegados, normalizarSufijo, siguienteNumero, sugerirSufijo } from "./codigo"
import type { FallaCatalogo } from "./tipos"

const falla = (subsistemaId: string, numero: number, activo = true): FallaCatalogo => ({
  id: `${subsistemaId}-${numero}`,
  subsistemaId,
  numero,
  nombre: "x",
  clase: "NO_PROGRAMADA",
  activo,
  codigo: "",
})

describe("sufijos", () => {
  it("normaliza lo escrito: sin tildes, espacios ni símbolos, en mayúsculas y hasta 6", () => {
    expect(normalizarSufijo("cám a")).toBe("CAMA")
    expect(normalizarSufijo("a3-cflex!")).toBe("A3CFLE")
  })

  it("valida largo y que no se repita entre hermanos", () => {
    expect(errorSufijo("C", [])).toMatch(/2 a 6/)
    expect(errorSufijo("CAM", ["CAM"])).toMatch(/Ya existe/)
    expect(errorSufijo("CAS", ["CAM"])).toBeNull()
  })

  it("sugiere las primeras letras libres del nombre", () => {
    expect(sugerirSufijo("Cámara aséptica", [])).toBe("CAM")
    expect(sugerirSufijo("Cámara aséptica", ["CAM"])).toBe("CAMA")
    expect(sugerirSufijo("Sup", ["SUP"])).toBe("SUP2")
    expect(sugerirSufijo("x", [])).toBe("")
  })
})

describe("códigos", () => {
  it("el número sigue al mayor del subsistema, aunque esté inactivo", () => {
    expect(siguienteNumero([falla("a", 1), falla("a", 4, false), falla("b", 9)], "a")).toBe(5)
    expect(siguienteNumero([], "a")).toBe(1)
  })

  it("arma el código con dos dígitos y marca lo que falta", () => {
    expect(componerCodigo(["CF", "SUP", "CAM"], 1)).toBe("CF-SUP-CAM-01")
    expect(componerCodigo(["CF", "", "CAM"], 12)).toBe("CF-…-CAM-12")
  })
})

describe("nombresPegados", () => {
  it("una por línea, sin vacías ni repetidas (sin importar tildes ni espacios)", () => {
    expect(nombresPegados("Baja presión\r\n\n  baja  presion \nFuga de producto\n")).toEqual(["Baja presión", "Fuga de producto"])
  })
})
