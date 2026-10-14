import { describe, expect, it } from "vitest"
import { ausentismoTotal, conGeneralesDeLinea, textoSeguimiento, generalesDeLinea, totalAseptico, cumplimiento, extremos, finDeMes, leerNumero, mesesVentana, presentacionesDeLinea, sumarMeses, tieneDatos, topParadas } from "./calculos"
import { mesVacio, presentacionVacia } from "./tipos"

describe("meses", () => {
  it("ventana de 3 meses, también cruzando el año", () => {
    expect(mesesVentana("2026-09-01")).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"])
    expect(mesesVentana("2026-02-01")).toEqual(["2025-12-01", "2026-01-01", "2026-02-01"])
    expect(sumarMeses("2026-12-01", 1)).toBe("2027-01-01")
  })

  it("último día del mes", () => {
    expect(finDeMes("2026-09-01")).toBe("2026-09-30")
    expect(finDeMes("2028-02-01")).toBe("2028-02-29")
  })
})

describe("extremos — más alto y más bajo de la ventana", () => {
  it("sin los meses vacíos", () => {
    const r = extremos([
      { mes: "2026-07-01", valor: null },
      { mes: "2026-08-01", valor: 96.4 },
      { mes: "2026-09-01", valor: 99 },
    ])
    expect(r?.alto.mes).toBe("2026-09-01")
    expect(r?.bajo.mes).toBe("2026-08-01")
  })

  it("todo vacío = null", () => {
    expect(extremos([{ mes: "2026-09-01", valor: null }])).toBeNull()
  })
})

describe("presentaciones", () => {
  it("cumplimiento = producidas ÷ planeadas", () => {
    expect(cumplimiento({ ...presentacionVacia(), prod: 10443, plan: 9451 })).toBeCloseTo(110.5, 1)
    expect(cumplimiento({ ...presentacionVacia(), prod: 100, plan: null })).toBeNull()
  })

  it("sin cajas, usa el % cargado a mano (julio y agosto del Excel); con cajas, manda producidas ÷ planeadas", () => {
    expect(cumplimiento({ ...presentacionVacia(), cumplimiento: 105 })).toBe(105)
    expect(cumplimiento({ ...presentacionVacia(), prod: 50, plan: 100, cumplimiento: 105 })).toBe(50)
  })

  it("ausentismo total = horas perdidas ÷ horas teóricas", () => {
    expect(ausentismoTotal(562, 7418.5)).toBeCloseTo(7.58, 2)
    expect(ausentismoTotal(null, 7418.5)).toBeNull()
    expect(ausentismoTotal(562, 0)).toBeNull()
  })

  it("aparece si se corrió o tenía plan", () => {
    expect(tieneDatos(undefined)).toBe(false)
    expect(tieneDatos(presentacionVacia())).toBe(false)
    expect(tieneDatos({ ...presentacionVacia(), plan: 500 })).toBe(true)
    expect(tieneDatos({ ...presentacionVacia(), corrio: true })).toBe(true)
  })

  it("en MANUAL aparece solo si se marcó 'Se corrió', y solo esas suman al total", () => {
    expect(tieneDatos({ ...presentacionVacia(), plan: 20000 }, "MANUAL")).toBe(false)
    expect(tieneDatos({ ...presentacionVacia(), corrio: true }, "MANUAL")).toBe(true)
    const d = {
      ...mesVacio(),
      presentaciones: { "2|250": { ...presentacionVacia(), corrio: true, prod: 18660, plan: 27106 }, "2|200": { ...presentacionVacia(), plan: 20000 } },
    }
    expect(totalAseptico(d, "MANUAL").plan).toBe(27106)
    expect(totalAseptico(d).plan).toBe(47106)
  })

  it("las de la línea según el catálogo activo, de mayor a menor, y las que traen los datos", () => {
    const v = (linea: string, presentacion: string, activo = true) => ({ linea, presentacion, maquina: linea === "LINEA_1" ? "TB" : "TP", activo })
    const r = presentacionesDeLinea("2", [v("LINEA_2", "250"), v("LINEA_2", "200"), v("LINEA_2", "330", false), v("LINEA_1", "1000")], ["2|330"])
    expect(r.map((p) => p.nombre)).toEqual(["TPA-330", "TPA-250", "TPA-200"])
    expect(presentacionesDeLinea("1", [v("LINEA_1", "1000"), v("LINEA_1", "500")], []).map((p) => p.nombre)).toEqual(["TBA-1000", "TBA-500"])
  })
})

describe("topParadas", () => {
  const paradas = [
    { causa: "Falla de suministro eléctrico", minutos: 1200, veces: 8 },
    { causa: "Falta de paletas", minutos: null, veces: null },
    { causa: "Atasco en la araña", minutos: 90, veces: 12 },
    { causa: "  ", minutos: 500, veces: 1 },
  ]

  it("por tiempo y por veces; las sin dato al final y sin causa no cuentan", () => {
    expect(topParadas(paradas, "tiempo").map((p) => p.causa)).toEqual(["Falla de suministro eléctrico", "Atasco en la araña", "Falta de paletas"])
    expect(topParadas(paradas, "veces")[0].causa).toBe("Atasco en la araña")
  })
})

describe("leerNumero — lo escrito en el editor", () => {
  it("vacío = sin dato; enteros sin puntos de miles; % con coma", () => {
    expect(leerNumero("  ", false)).toBeNull()
    expect(leerNumero("69.157", true)).toBe(69157)
    expect(leerNumero("3,04", false)).toBe(3.04)
    expect(leerNumero("3.04", false)).toBe(3.04)
  })
})

describe("totalAseptico — la franja de arriba", () => {
  const sep = { ...mesVacio(), presentaciones: { "1|1000": { ...presentacionVacia(), prod: 69157, plan: 98085 }, "2|250": { ...presentacionVacia(), prod: 66636, plan: 74483 } } }

  it("sin total cargado, suma las presentaciones", () => {
    const t = totalAseptico(sep)
    expect(t.prod).toBe(135793)
    expect(t.plan).toBe(172568)
    expect(t.cumplimiento).toBeCloseTo(78.69, 2)
  })

  it("sin cajas, manda el % cargado a mano (julio y agosto vienen de otro Excel)", () => {
    expect(totalAseptico({ ...mesVacio(), totalAseptico: { prod: null, plan: null, cumplimiento: 44 } }).cumplimiento).toBe(44)
    expect(totalAseptico(null)).toEqual({ prod: null, plan: null, cumplimiento: null })
  })

  it("con cajas, todo sale de la suma: lo cargado a mano no pisa", () => {
    const t = totalAseptico({ ...sep, totalAseptico: { prod: 1, plan: 2, cumplimiento: 44 } })
    expect([t.prod, t.plan]).toEqual([135793, 172568])
    expect(t.cumplimiento).toBeCloseTo(78.69, 2)
  })
})

describe("paradas generales por línea (dueña, 2026-10-14)", () => {
  const luz = { causa: "Falla en Suministro Eléctrico", minutos: null, veces: null }

  it("cada línea la suya", () => {
    const d = conGeneralesDeLinea(mesVacio(), "2", [luz])
    expect(generalesDeLinea(d, "2")).toEqual([luz])
    expect(generalesDeLinea(d, "1")).toEqual([])
  })

  it("la lista vieja de las 3 se ve en todas; al editar una línea, cada una queda con su copia", () => {
    const viejo = { ...mesVacio(), paradasGenerales: [luz] as unknown as Record<string, typeof luz[]> }
    expect(generalesDeLinea(viejo, "3")).toEqual([luz])
    const d = conGeneralesDeLinea(viejo, "1", [])
    expect([generalesDeLinea(d, "1"), generalesDeLinea(d, "2"), generalesDeLinea(d, "3")]).toEqual([[], [luz], [luz]])
  })
})

describe("textoSeguimiento (dueña, 2026-10-14)", () => {
  const base = { quePaso: "", comoPaso: "", accionCorrectiva: "" }
  it("el texto del seguimiento; si no tiene, lo que se cargó en el formato viejo, junto", () => {
    expect(textoSeguimiento({ ...base, texto: "Se cambió el kit." })).toBe("Se cambió el kit.")
    expect(textoSeguimiento({ ...base, accionCorrectiva: "Se valida el kit." })).toBe("Se valida el kit.")
    expect(textoSeguimiento(base)).toBe("")
  })
})
