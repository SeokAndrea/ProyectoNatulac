import { describe, expect, it } from "vitest"
import { buscarFallas, fallasDeLinea, opcionDeFalla } from "./paradas"
import type { CatalogoFallas } from "./tipos"

const c: CatalogoFallas = {
  equipos: [
    { id: "cf", sufijo: "CF", nombre: "Compact Flex", tipo: "LINEA", activo: true, lineas: ["l2"] },
    { id: "gen", sufijo: "GEN", nombre: "Generador 440V", tipo: "SERVICIOS", activo: true, lineas: [] },
    { id: "viejo", sufijo: "VJ", nombre: "Equipo viejo", tipo: "LINEA", activo: false, lineas: ["l2"] },
  ],
  sistemas: [
    { id: "sup", equipoId: "cf", sufijo: "SUP", nombre: "Superestructura", activo: true },
    { id: "ele", equipoId: "gen", sufijo: "ELE", nombre: "Eléctrico", activo: true },
    { id: "s3", equipoId: "viejo", sufijo: "X", nombre: "X", activo: true },
  ],
  subsistemas: [
    { id: "cam", sistemaId: "sup", sufijo: "CAM", nombre: "Cámara aséptica", codigoSheet: null, activo: true },
    { id: "alt", sistemaId: "ele", sufijo: "ALT", nombre: "Alternador", codigoSheet: null, activo: true },
    { id: "u3", sistemaId: "s3", sufijo: "Y", nombre: "Y", codigoSheet: null, activo: true },
  ],
  fallas: [
    { id: "f1", subsistemaId: "cam", numero: 1, nombre: "Baja presión", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-CAM-01" },
    { id: "f2", subsistemaId: "cam", numero: 2, nombre: "Vieja", clase: "NO_PROGRAMADA", activo: false, codigo: "CF-SUP-CAM-02" },
    { id: "f3", subsistemaId: "alt", numero: 1, nombre: "No arranca", clase: "NO_PROGRAMADA", activo: true, codigo: "GEN-ELE-ALT-01" },
    { id: "f4", subsistemaId: "u3", numero: 1, nombre: "De equipo inactivo", clase: "NO_PROGRAMADA", activo: true, codigo: "VJ-X-Y-01" },
  ],
}

describe("fallasDeLinea", () => {
  it("las de los equipos de la línea más las de servicios, solo activas", () => {
    expect(fallasDeLinea(c, "l2").map((o) => o.falla.id)).toEqual(["f1", "f3"])
  })
  it("en otra línea, solo las de servicios", () => {
    expect(fallasDeLinea(c, "l1").map((o) => o.falla.id)).toEqual(["f3"])
  })
})

it("buscarFallas: por falla, subsistema, equipo o código, sin tildes; y por equipo", () => {
  const ops = fallasDeLinea(c, "l2")
  expect(buscarFallas(ops, "presion camara").map((o) => o.falla.id)).toEqual(["f1"])
  expect(buscarFallas(ops, "generador").map((o) => o.falla.id)).toEqual(["f3"])
  expect(buscarFallas(ops, "gen-ele").map((o) => o.falla.id)).toEqual(["f3"])
  expect(buscarFallas(ops, "", "cf").map((o) => o.falla.id)).toEqual(["f1"])
})

it("opcionDeFalla trae la cadena completa, aunque la falla esté desactivada", () => {
  expect(opcionDeFalla(c, "f2")?.equipo.nombre).toBe("Compact Flex")
  expect(opcionDeFalla(c, null)).toBeNull()
  expect(opcionDeFalla(c, "nada")).toBeNull()
})
