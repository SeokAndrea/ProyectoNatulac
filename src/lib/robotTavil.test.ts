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
      manual: false,
      proximoNumero: null,
      proximoTurno: null,
      proximoSaborCodigo: null,
      proximoPresentacionCodigo: null,
      paletasDia: [],
      anuladasDia: 0,
    })
  })

  it("trae el interruptor manual, el próximo Nº y las paletas del día", () => {
    const [l] = mapearPantallaRobot({
      lineas: [
        {
          linea_codigo: "LINEA_2",
          linea_nombre: "Línea 2",
          estado: "EN_CURSO",
          puede_sumar: true,
          corrida: corrida(),
          sin_corrida: 0,
          nueva: null,
          anterior: null,
          manual: true,
          proximo_numero: "4",
          proximo_turno: "TURNO_2",
          proximo_sabor_codigo: "MZ%",
          proximo_presentacion_codigo: "TPA-250 cm3",
          anuladas_dia: "1",
          paletas_dia: [
            {
              id: "p3",
              linea_codigo: "LINEA_2",
              linea_nombre: "Línea 2",
              fecha_produccion: "2026-11-12",
              turno_tipo: "TURNO_2",
              creada_en: "2026-11-12T19:40:00+00:00",
              numero: "3",
              ticket: "T-3",
              tipo_paletizado: "MANUAL",
              cajas: "140",
              conforme: false,
              observacion_codigos: [7, 1],
              observacion_otros: "golpe",
              accion_correccion: null,
              lote: "2611",
              sabor_codigo: "MZ%",
              sabor_nombre: "Manzana 35%",
              presentacion_volumen_ml: 250,
              presentacion_codigo: "TPA-250 cm3",
              editada_en: null,
              editada_por: null,
            },
          ],
        },
      ],
    })
    expect(l).toMatchObject({ manual: true, proximoNumero: 4, proximoTurno: "TURNO_2", anuladasDia: 1 })
    expect(l.paletasDia[0]).toMatchObject({ numero: 3, cajas: 140, tipoPaletizado: "MANUAL", conforme: false, observacionCodigos: [1, 7] })
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
