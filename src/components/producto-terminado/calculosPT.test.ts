import { describe, expect, it } from "vitest"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { deltaEnvases, normalizarLote, tanqueDeCorrida, vistaPreviaCarga } from "./calculosPT"

const LITRO = { codigo: "1000", cajasXPaleta: 100, envasesXCaja: 12, volumenMl: 1000 } as PresentacionLive

describe("normalizarLote / tanqueDeCorrida", () => {
  it("casa lotes numéricos sin importar los ceros", () => {
    expect(normalizarLote("1")).toBe("0001")
    expect(normalizarLote(" 00012 ")).toBe("0012")
    expect(normalizarLote("000")).toBe("0000")
    expect(normalizarLote("A-7")).toBe("A-7")
    expect(normalizarLote("  ")).toBeNull()
  })

  it("el tanque Liberado o Con Restos del mismo sabor y lote", () => {
    const t = (n: 1 | 2 | 3, condicion: TanqueRecepcion["condicion"], saborId: string, lote: string) =>
      ({ numeroTanque: n, condicion, saborId, lote }) as TanqueRecepcion
    const tanques = [t(1, "SUCIO", "s1", "1"), t(2, "STANDBY", "s1", "0001"), t(3, "LISTO", "s2", "0001")]
    expect(tanqueDeCorrida(tanques, "s1", "1")?.numeroTanque).toBe(2)
    expect(tanqueDeCorrida(tanques, "s1", "0002")).toBeNull()
  })
})

describe("deltaEnvases", () => {
  const registro = { paletas: 9, cajasSueltas: 50 } as ProductoTerminadoRegistro
  it("|buenos − envases del PT|, o null si falta uno", () => {
    expect(deltaEnvases(registro, LITRO, 11000)).toBe(400)
    expect(deltaEnvases(null, LITRO, 11000)).toBeNull()
    expect(deltaEnvases(registro, LITRO, 0)).toBeNull()
  })
})

describe("vistaPreviaCarga", () => {
  const base = { presentacion: LITRO, paletas: "", cajasSueltas: "", contadorActual: 0, contadorBuenosActual: 0, envasesLlenadora: "", envasesBuenos: "" }

  it("totales de PT: cajas y litros", () => {
    const v = vistaPreviaCarga({ ...base, paletas: "10", cajasSueltas: "5" })
    expect(v.cajas).toBe(1005)
    expect(v.litros).toBe(12060)
    expect(v.mermaPct).toBeNull()
  })

  it("merma contra el contador (lo cargado + lo nuevo) y su nivel", () => {
    const v = vistaPreviaCarga({ ...base, paletas: "10", cajasSueltas: "0", contadorActual: 12000, envasesLlenadora: "1200" })
    expect(v.mermaPct).toBe(9.09)
    expect(v.nivel).toBe("danger")
    expect(v.mermaProvisional).toBe(false)
    const ok = vistaPreviaCarga({ ...base, paletas: "10", cajasSueltas: "90", contadorActual: 12000, envasesLlenadora: "1200" })
    expect(ok.mermaPct).toBe(0.91)
    expect(ok.nivel).toBe("ok")
  })

  it("sin contador definitivo la merma es provisional", () => {
    expect(vistaPreviaCarga({ ...base, paletas: "1", envasesLlenadora: "1300" }).mermaProvisional).toBe(true)
  })

  it("equivalencia de los envases buenos, con o sin lo ya cargado", () => {
    expect(vistaPreviaCarga({ ...base, envasesBuenos: "1212" }).textoBuenos).toMatch(/^Equivale a /)
    expect(vistaPreviaCarga({ ...base, contadorBuenosActual: 1200, envasesBuenos: "12" }).textoBuenos).toMatch(
      /^Con lo ya cargado, 1\.212 envases buenos: equivale a /,
    )
    expect(vistaPreviaCarga(base).textoBuenos).toBeNull()
  })
})
