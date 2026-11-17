import { describe, expect, it } from "vitest"
import { nombreFamilia } from "@/components/indicadores/colores"
import { nombreSaborConFamilia } from "./sabores"
import { saborSinFamiliaOculta } from "./turno"

// Cambios de nombre de familias (Alexander, 2026-11-17): se aceptan el nombre viejo y el nuevo.
// «Clásicos» pasó a «Clásico» (migración 20261116390000).
describe("familia Clásico", () => {
  it("el sabor clásico va sin la familia al lado, con el nombre nuevo o el viejo", () => {
    expect(nombreSaborConFamilia("Manzana", "Clásico")).toBe("Manzana")
    expect(nombreSaborConFamilia("Manzana", "Clasicos")).toBe("Manzana")
    expect(nombreSaborConFamilia("Manzana", "Jucosa")).toBe("Manzana (Jucosa)")
    expect(nombreSaborConFamilia("Manzana", "Selecto")).toBe("Manzana 35%")
  })

  it("quita «(Clásico)» de los nombres que ya vienen armados", () => {
    expect(saborSinFamiliaOculta("Pera (Clásico)")).toBe("Pera")
    expect(saborSinFamiliaOculta("Pera (Clásicos)")).toBe("Pera")
    expect(saborSinFamiliaOculta("Pera (Jucosa)")).toBe("Pera (Jucosa)")
  })

  it("en Indicadores se llama «Néctar clásico» con cualquiera de los nombres", () => {
    expect(nombreFamilia("Clásico")).toBe("Néctar clásico")
    expect(nombreFamilia("Clasicos")).toBe("Néctar clásico")
    expect(nombreFamilia("Jucosa")).toBe("Jucosa")
  })
})

// «Especiales» pasó a «Bebida té negro» (migración 20261116490000).
describe("familia Bebida té negro", () => {
  it("los tés van sin la familia al lado, con el nombre nuevo o el viejo", () => {
    expect(nombreSaborConFamilia("Té de Durazno", "Bebida té negro")).toBe("Té de Durazno")
    expect(nombreSaborConFamilia("Té de Durazno", "Especiales")).toBe("Té de Durazno")
    expect(saborSinFamiliaOculta("Té de Limón (Bebida té negro)")).toBe("Té de Limón")
  })

  it("en Indicadores se sigue llamando «Té»", () => {
    expect(nombreFamilia("Bebida té negro")).toBe("Té")
    expect(nombreFamilia("Especiales")).toBe("Té")
  })
})
