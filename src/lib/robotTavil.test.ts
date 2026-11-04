import { describe, expect, it } from "vitest"
import { pistaPrecarga } from "@/components/producto-terminado/calculosPT"
import { mapearEstimaciones, mapearPantallaRobot, mapearPrecargas, mensajeErrorRobot, nivelEstimado } from "@/lib/robotTavil"

const corrida = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  lote: "2411",
  sabor_nombre: "Fresa",
  presentacion_volumen_ml: 1000,
  paletas: "8",
  ultima_paleta_en: "2026-11-04T16:01:00+00:00",
  resto: 12,
  entregada: false,
  ...over,
})

describe("mapearPantallaRobot", () => {
  it("pasa los números que la base manda como texto y deja null lo que no viene", () => {
    const [l] = mapearPantallaRobot({
      lineas: [
        {
          linea_codigo: "LINEA_1",
          linea_nombre: "Línea 1",
          estado: "LOTE_NUEVO",
          puede_sumar: false,
          corrida: corrida(),
          sin_corrida: "0",
          nueva: corrida({ id: "c2", lote: "2415", paletas: 0, resto: 0, ultima_paleta_en: null }),
          anterior: null,
        },
      ],
    })
    expect(l).toEqual({
      lineaCodigo: "LINEA_1",
      lineaNombre: "Línea 1",
      estado: "LOTE_NUEVO",
      puedeSumar: false,
      corrida: { id: "c1", lote: "2411", saborNombre: "Fresa", presentacionMl: 1000, paletas: 8, ultimaPaletaEn: "2026-11-04T16:01:00+00:00", resto: 12, entregada: false },
      sinCorrida: 0,
      nueva: { id: "c2", lote: "2415", saborNombre: "Fresa", presentacionMl: 1000, paletas: 0, ultimaPaletaEn: null, resto: 0, entregada: false },
      anterior: null,
    })
  })

  it("sin respuesta, ninguna línea", () => {
    expect(mapearPantallaRobot(null)).toEqual([])
    expect(mapearPantallaRobot({})).toEqual([])
  })
})

describe("mapearPrecargas", () => {
  it("Resto null = el operador no lo escribió", () => {
    const [a, b] = mapearPrecargas([
      { turno_linea_id: "c1", paletas: "3", ultima_paleta_en: null, ultima_paleta_por: null, resto: null, resto_en: null, resto_por: null },
      { turno_linea_id: "c2", paletas: 0, ultima_paleta_en: null, ultima_paleta_por: null, resto: "15", resto_en: "x", resto_por: "Ana" },
    ])
    expect(a).toMatchObject({ corridaId: "c1", paletas: 3, resto: null })
    expect(b).toMatchObject({ corridaId: "c2", paletas: 0, resto: 15, restoPor: "Ana" })
  })
})

describe("mensajeErrorRobot", () => {
  it("deja el mensaje de la base y cambia los técnicos", () => {
    expect(mensajeErrorRobot("Esta línea no tiene una corrida en curso.")).toBe("Esta línea no tiene una corrida en curso.")
    expect(mensajeErrorRobot("function robot_tavil_sumar(text) does not exist")).toMatch(/No se pudo completar/)
    expect(mensajeErrorRobot("Failed to fetch")).toMatch(/No hay conexión/)
  })
})

describe("pistaPrecarga", () => {
  it("vacío o igual: «Robot: N»; otro número: corrige", () => {
    expect(pistaPrecarga("", 8)).toEqual({ texto: "Robot: 8", corrige: false })
    expect(pistaPrecarga("8", 8)).toEqual({ texto: "Robot: 8", corrige: false })
    expect(pistaPrecarga("7", 8)).toEqual({ texto: "Corriges la precarga: Robot 8", corrige: true })
  })
})

describe("estimación de los tanques", () => {
  it("mapea la fila de la base", () => {
    expect(mapearEstimaciones([{ numero_tanque: 2, volumen_oficial_l: "12400.00", litros_pendientes: "960" }])).toEqual([
      { numeroTanque: 2, volumenOficialL: 12400, litrosPendientes: 960 },
    ])
    expect(mapearEstimaciones(null)).toEqual([])
  })

  it("el estimado nunca es negativo y avisa si la precarga supera lo que queda", () => {
    expect(nivelEstimado({ numeroTanque: 1, volumenOficialL: 15000, litrosPendientes: 4944 })).toEqual({ estimadoL: 10056, excede: false })
    expect(nivelEstimado({ numeroTanque: 1, volumenOficialL: 300, litrosPendientes: 480 })).toEqual({ estimadoL: 0, excede: true })
  })
})
