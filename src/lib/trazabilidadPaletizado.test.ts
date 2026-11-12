import { describe, expect, it } from "vitest"
import {
  armarHojas,
  codigoPresentacion,
  codigoSabor,
  errorConformidad,
  fechaHoja,
  mapearPaleta,
  textoObservacionCorto,
  textoObservacionLargo,
  type Paleta,
} from "@/lib/trazabilidadPaletizado"
import { generarTrazabilidadPdf, nombreArchivoTrazabilidad } from "@/lib/trazabilidadPaletizadoPdf"

let n = 0
const paleta = (over: Partial<Paleta> = {}): Paleta => ({
  id: `p${++n}`,
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  fechaProduccion: "2026-11-11",
  turnoTipo: "TURNO_1",
  creadaEn: `2026-11-11T1${n % 10}:00:00+00:00`,
  numero: 1,
  ticket: `T-${n}`,
  tipoPaletizado: "AUTOMATICO",
  cajas: 85,
  conforme: true,
  observacionCodigos: [],
  observacionOtros: null,
  accionCorreccion: null,
  lote: "261104",
  saborCodigo: "MZ",
  saborNombre: "Manzana",
  presentacionMl: 1000,
  presentacionCodigo: "TBA-1000 cm3",
  editadaEn: null,
  editadaPor: null,
  ...over,
})

describe("armarHojas", () => {
  it("una hoja por línea, presentación y tipo; los sabores comparten hoja", () => {
    const hojas = armarHojas([
      paleta({ creadaEn: "2026-11-11T11:00:00Z", saborCodigo: "MZ" }),
      paleta({ creadaEn: "2026-11-11T12:00:00Z", saborCodigo: "PR" }),
      paleta({ creadaEn: "2026-11-11T13:00:00Z", tipoPaletizado: "MANUAL" }),
      paleta({ creadaEn: "2026-11-11T10:00:00Z", lineaCodigo: "LINEA_2", lineaNombre: "Línea 2", presentacionCodigo: "TPA-250 cm3", presentacionMl: 250 }),
      paleta({ creadaEn: "2026-11-11T14:00:00Z", presentacionCodigo: "TBA-500 cm3", presentacionMl: 500 }),
    ])
    expect(hojas.map((h) => `${h.lineaCodigo} ${h.presentacionCodigo} ${h.tipoPaletizado} ${h.paletas.length}`)).toEqual([
      "LINEA_1 TBA-1000 cm3 AUTOMATICO 2",
      "LINEA_1 TBA-1000 cm3 MANUAL 1",
      "LINEA_1 TBA-500 cm3 AUTOMATICO 1",
      "LINEA_2 TPA-250 cm3 AUTOMATICO 1",
    ])
    expect(hojas[0].paletas.map((p) => p.saborCodigo)).toEqual(["MZ", "PR"])
    expect(hojas[0].presentacionHoja).toBe("TBA-1000 cm3")
  })

  it("dentro de la hoja, por hora de salida (A→B→A se ve 1…, 1…, 6…)", () => {
    const [h] = armarHojas([
      paleta({ creadaEn: "2026-11-11T15:00:00Z", numero: 6, saborCodigo: "MZ" }),
      paleta({ creadaEn: "2026-11-11T11:00:00Z", numero: 1, saborCodigo: "MZ" }),
      paleta({ creadaEn: "2026-11-11T13:00:00Z", numero: 1, saborCodigo: "PR" }),
    ])
    expect(h.paletas.map((p) => `${p.saborCodigo}${p.numero}`)).toEqual(["MZ1", "PR1", "MZ6"])
  })

  it("presentación sin código: «N ml» y sin casilla marcada", () => {
    const [h] = armarHojas([paleta({ presentacionCodigo: null, presentacionMl: 330 })])
    expect(h.presentacionCodigo).toBe("330 ml")
    expect(h.presentacionHoja).toBeNull()
  })
})

describe("textos de la hoja", () => {
  it("sabor sin código usa el nombre", () => {
    expect(codigoSabor({ saborCodigo: null, saborNombre: "Guanábana" })).toBe("Guanábana")
    expect(codigoPresentacion({ presentacionCodigo: null, presentacionMl: null })).toBe("Sin presentación")
  })

  it("observación corta y larga, con el «Otros»", () => {
    const p = { observacionCodigos: [1, 7], observacionOtros: "golpe" }
    expect(textoObservacionCorto(p)).toBe("1, 7 (golpe)")
    expect(textoObservacionLargo(p)).toBe("1 Solapas despegadas; 7 Otros: golpe")
  })

  it("fecha de la hoja", () => {
    expect(fechaHoja("2026-11-11")).toBe("11/11/2026")
  })
})

describe("errorConformidad", () => {
  const base = { conforme: false, observacionCodigos: [] as number[], observacionOtros: "", accionCorreccion: "" }
  it("el operador: NC exige observación", () => {
    expect(errorConformidad(base, true)).toMatch(/al menos una observación/)
    expect(errorConformidad({ ...base, observacionCodigos: [2] }, true)).toBeNull()
  })
  it("al corregir: la observación es opcional", () => {
    expect(errorConformidad(base, false)).toBeNull()
  })
  it("el 7 pide especificar", () => {
    expect(errorConformidad({ ...base, observacionCodigos: [7] }, false)).toMatch(/Otros/)
    expect(errorConformidad({ ...base, observacionCodigos: [7], observacionOtros: "x" }, true)).toBeNull()
  })
  it("conforme no pide nada", () => {
    expect(errorConformidad({ ...base, conforme: true }, true)).toBeNull()
  })
})

describe("mapearPaleta", () => {
  it("números de texto, tipo por defecto y códigos ordenados", () => {
    const p = mapearPaleta({
      id: "x",
      linea_codigo: "LINEA_3",
      linea_nombre: "Línea 3",
      fecha_produccion: "2026-11-11",
      turno_tipo: "TURNO_3",
      creada_en: "2026-11-12T02:00:00Z",
      numero: "4",
      ticket: null,
      tipo_paletizado: null,
      cajas: null,
      conforme: null,
      observacion_codigos: ["5", "2"],
      observacion_otros: null,
      accion_correccion: null,
      lote: null,
      sabor_codigo: null,
      sabor_nombre: null,
      presentacion_volumen_ml: "330",
      presentacion_codigo: null,
      editada_en: null,
      editada_por: null,
    })
    expect(p).toMatchObject({ numero: 4, tipoPaletizado: "AUTOMATICO", conforme: true, cajas: null, presentacionMl: 330, observacionCodigos: [2, 5] })
  })
})

describe("PDF", () => {
  it("genera un PDF con una página por hoja", async () => {
    const hojas = armarHojas([paleta(), paleta({ tipoPaletizado: "MANUAL" }), paleta({ conforme: false, observacionCodigos: [7], observacionOtros: "x" })])
    const blob = generarTrazabilidadPdf(hojas)
    // El Blob de jsdom no trae .text(): se lee con FileReader.
    const texto = await new Promise<string>((ok) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result))
      r.readAsText(blob)
    })
    expect(texto.startsWith("%PDF")).toBe(true)
    expect(texto.match(/\/Type \/Page\b/g)?.length).toBe(2)
  })

  it("nombre del archivo", () => {
    expect(nombreArchivoTrazabilidad("2026-11-11", null)).toBe("trazabilidad-paletizado-2026-11-11.pdf")
    expect(nombreArchivoTrazabilidad("2026-11-11", ["LINEA_1", "LINEA_3"])).toBe("trazabilidad-paletizado-2026-11-11-L1-L3.pdf")
  })
})
