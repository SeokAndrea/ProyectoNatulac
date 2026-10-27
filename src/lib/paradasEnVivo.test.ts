import { describe, expect, it } from "vitest"
import type { LineaLive } from "@/lib/catalogosLive"
import type { Parada } from "@/lib/paradas"
import type { Corrida } from "@/lib/produccion/tipos"
import { aplicarParadasEnVivo, estadoDeLineas } from "@/components/panel/calculosPanel"
import { paradaEnVivo, textoParadaEnVivo } from "./paradasEnVivo"

/*
 * Parada en vivo (dueña, 2026-10-12): una parada abierta para la cinta
 * recién a los 15 min; Mantenimiento manda sobre el supervisor.
 */

const AHORA = new Date("2026-10-12T10:00:00")

const abierta = (over: Partial<Parada>): Parada =>
  ({ id: "p", origen: "MANUAL", responsable: "OPERACIONAL", lineaCodigo: "LINEA_1", tipoNombre: "Falta de envase", inicio: "2026-10-12T09:50:00", fin: null, ...over }) as Parada

describe("paradaEnVivo", () => {
  it("sin paradas abiertas ni pausa, nada", () => {
    expect(paradaEnVivo("LINEA_1", [abierta({ fin: "2026-10-12T09:55:00" })], null, AHORA)).toBeNull()
  })

  it("antes de los 15 min no se muestra; después, sí", () => {
    const corta = paradaEnVivo("LINEA_1", [abierta({ inicio: "2026-10-12T09:54:00" })], null, AHORA)
    expect(corta).toMatchObject({ minutos: 6, visible: false })
    expect(textoParadaEnVivo(corta!)).toBe("Parada hace 6 min")

    const larga = paradaEnVivo("LINEA_1", [abierta({ inicio: "2026-10-12T09:37:00" })], null, AHORA)
    expect(larga).toMatchObject({ minutos: 23, visible: true })
    expect(textoParadaEnVivo(larga!)).toBe("Parada · 23 min")
  })

  it("la corrida pausada desde Líneas cuenta igual", () => {
    expect(paradaEnVivo("LINEA_1", [], "2026-10-12T09:40:00", AHORA)).toMatchObject({ minutos: 20, visible: true, tipoNombre: null })
  })

  it("Mantenimiento manda, aunque la del supervisor lleve más", () => {
    const p = paradaEnVivo(
      "LINEA_1",
      [abierta({ inicio: "2026-10-12T08:00:00" }), abierta({ responsable: "MANTENIMIENTO", tipoNombre: "Llenadora", inicio: "2026-10-12T09:18:00" })],
      null,
      AHORA,
    )
    expect(p).toMatchObject({ deMantenimiento: true, tipoNombre: "Llenadora", minutos: 42 })
    expect(textoParadaEnVivo(p!)).toBe("Mantenimiento · 42 min")
  })

  it("deMantenimiento sale del responsable, no del origen", () => {
    const doc = (o: Partial<Parada>) => paradaEnVivo("LINEA_1", [abierta({ inicio: "2026-10-12T09:00:00", ...o })], null, AHORA)
    expect(doc({ origen: "SHEET", responsable: "OPERACIONAL" })?.deMantenimiento).toBe(false)
    expect(doc({ origen: "MANUAL", responsable: "MANTENIMIENTO" })?.deMantenimiento).toBe(true)
  })

  it("Pruebas: LINEA_T1 es la misma línea que LINEA_1 de las paradas", () => {
    expect(paradaEnVivo("LINEA_T1", [abierta({ inicio: "2026-10-12T09:00:00" })], null, AHORA)?.visible).toBe(true)
    expect(paradaEnVivo("LINEA_2", [abierta({ inicio: "2026-10-12T09:00:00" })], null, AHORA)).toBeNull()
  })
})

describe("aplicarParadasEnVivo", () => {
  const LINEAS = [
    { id: "1", codigo: "LINEA_1", nombre: "Línea 1", activo: true },
    { id: "2", codigo: "LINEA_2", nombre: "Línea 2", activo: true },
  ] as LineaLive[]
  const corrida = (over: Partial<Corrida>): Corrida => ({ id: "c", linea: "LINEA_1", activa: true, pausadaEn: null, esperandoCierre: false, ...over }) as Corrida

  it("pausada hace 5 min sigue activa con el aviso; con 20 min, parada", () => {
    const base = estadoDeLineas([corrida({ pausadaEn: "2026-10-12T09:55:00" })], [], LINEAS)
    expect(base[0].estado).toBe("parada")
    const enVivo = aplicarParadasEnVivo(base, [], AHORA)
    expect(enVivo[0]).toMatchObject({ estado: "activa", paradaEnVivo: { minutos: 5, visible: false } })

    const larga = aplicarParadasEnVivo(estadoDeLineas([corrida({ pausadaEn: "2026-10-12T09:40:00" })], [], LINEAS), [], AHORA)
    expect(larga[0].estado).toBe("parada")
  })

  it("corriendo con una falla de Mantenimiento de 30 min: parada; sin corrida: detenida", () => {
    const falla = abierta({ responsable: "MANTENIMIENTO", inicio: "2026-10-12T09:30:00" })
    const conCorrida = aplicarParadasEnVivo(estadoDeLineas([corrida({})], [], LINEAS), [falla], AHORA)
    expect(conCorrida[0].estado).toBe("parada")
    const sinCorrida = aplicarParadasEnVivo(estadoDeLineas([], [], LINEAS), [falla], AHORA)
    expect(sinCorrida[0].estado).toBe("detenida")
    expect(sinCorrida[1].estado).toBe("libre")
  })

  it("CIP no cambia", () => {
    const base = estadoDeLineas([], [{ linea: "LINEA_1", condicion: "CIP", observacion: null } as never], LINEAS)
    expect(aplicarParadasEnVivo(base, [abierta({ inicio: "2026-10-12T08:00:00" })], AHORA)[0].estado).toBe("cip")
  })
})

describe("Línea No Programada hasta el final del turno (dueña, 2026-10-14)", () => {
  const lnpe = abierta({ tipoCodigo: "FERIADO", tipoNombre: "Feriado", origen: "MANTENIMIENTO", responsable: "MANTENIMIENTO", inicio: "2026-10-12T07:00:00", fin: "2026-10-12T15:00:00", nota: "Arreglo del piso" })

  it("mientras dura, la fila la muestra de entrada, con su descripción", () => {
    const p = paradaEnVivo("LINEA_1", [lnpe], null, AHORA)
    expect(p).toMatchObject({ lineaNoProgramada: true, visible: true, deMantenimiento: false, nota: "Arreglo del piso", minutos: 180 })
    expect(textoParadaEnVivo(p!)).toBe("Línea no programada · Feriado")
  })

  it("después del fin, ya no", () => {
    expect(paradaEnVivo("LINEA_1", [lnpe], null, new Date("2026-10-12T15:30:00"))).toBeNull()
  })
})
