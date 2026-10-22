import { describe, expect, it } from "vitest"
import type { FilaCatalogo } from "@/lib/edicionDatos"
import { SECCIONES_CATALOGO, seccionPorId } from "./secciones"
import { armarItems, filtrarFilas, leerFormulario, textoCelda, valorParaFormulario, type OpcionesExternas } from "./tabla"

const fila = (id: string, datos: Record<string, unknown>, activo = true): FilaCatalogo =>
  ({ id, activo, editado_en: null, editado_por_nombre: null, ...datos }) as FilaCatalogo

const externas: OpcionesExternas = {
  familias: [
    { valor: "f1", etiqueta: "Clásicos" },
    { valor: "f2", etiqueta: "Premium" },
  ],
  lineas: [
    { valor: "l1", etiqueta: "Línea 1", orden: 1 },
    { valor: "l2", etiqueta: "Línea 2", orden: 2 },
  ],
  presentaciones: [
    { valor: "p1000", etiqueta: "1000 ml", orden: 1000 },
    { valor: "p500", etiqueta: "500 ml", orden: 500 },
    { valor: "p250", etiqueta: "250 ml", orden: 250 },
  ],
}

const sabores = seccionPorId("sabores")!
const velocidades = seccionPorId("velocidades")!
const bobinas = seccionPorId("bobinas")!

describe("textoCelda", () => {
  it("muestra la etiqueta de la opción, números con coma y — si está vacío", () => {
    expect(textoCelda(sabores.campos[1], "f2", externas)).toBe("Premium")
    expect(textoCelda(bobinas.campos[2], 0.0382, externas)).toBe("0,0382")
    expect(textoCelda(sabores.campos[2], null, externas)).toBe("—")
    expect(textoCelda(bobinas.campos[4], true, externas)).toBe("Hacia arriba")
  })
})

describe("filtrarFilas", () => {
  const filas = [fila("a", { nombre: "Pera", familia_id: "f1" }), fila("b", { nombre: "Piña", familia_id: "f2" }, false)]

  it("esconde los inactivos salvo que se pidan", () => {
    expect(filtrarFilas(filas, sabores, externas, "", false).map((f) => f.id)).toEqual(["a"])
    expect(filtrarFilas(filas, sabores, externas, "", true).map((f) => f.id)).toEqual(["a", "b"])
  })

  it("busca en lo que se ve, sin acentos ni mayúsculas (también la familia)", () => {
    expect(filtrarFilas(filas, sabores, externas, "pina", true).map((f) => f.id)).toEqual(["b"])
    expect(filtrarFilas(filas, sabores, externas, "clásicos", true).map((f) => f.id)).toEqual(["a"])
  })
})

describe("armarItems", () => {
  it("agrupa en el orden de las opciones, sin la columna del grupo", () => {
    const items = armarItems(
      [fila("a", { nombre: "Piña", familia_id: "f2", volumen: 2180 }), fila("b", { nombre: "Pera", familia_id: "f1", volumen: 2710 })],
      sabores,
      externas,
    )
    expect(items.map((i) => (i.tipo === "grupo" ? `# ${i.etiqueta} (${i.cantidad})` : i.celdas.join(" | ")))).toEqual([
      "# Clásicos (1)",
      "Pera | 2710",
      "# Premium (1)",
      "Piña | 2180",
    ])
  })

  it("velocidades: la presentación y la máquina salen una vez hasta que cambian", () => {
    const filas = [
      fila("v1", { linea_id: "l1", presentacion_id: "p500", maquina: "TB", envases_hora: 3000, litros_hora: 3000 }),
      fila("v2", { linea_id: "l1", presentacion_id: "p1000", maquina: "TB", envases_hora: 7000, litros_hora: 7000 }),
      fila("v3", { linea_id: "l1", presentacion_id: "p1000", maquina: "TB", envases_hora: 6000, litros_hora: 6000 }),
      fila("v4", { linea_id: "l2", presentacion_id: "p250", maquina: "TP", envases_hora: 7500, litros_hora: 1875 }),
    ]
    const items = armarItems(filas, velocidades, externas)
    expect(items.map((i) => (i.tipo === "grupo" ? `# ${i.etiqueta}` : i.celdas.join("|")))).toEqual([
      "# Línea 1",
      "1000 ml|TB|6000|6000",
      "||7000|7000",
      "500 ml|TB|3000|3000",
      "# Línea 2",
      "250 ml|TP|7500|1875",
    ])
  })
})

describe("formulario", () => {
  it("los números van con coma al formulario y vuelven como número", () => {
    expect(valorParaFormulario(bobinas.campos[2], 0.0382)).toBe("0,0382")
    const r = leerFormulario(bobinas, { nombre: " TP 250cc ", diametro_core_cm: "15,75", espesor_cm: "0,0382", largo_envase_cm: "18.5", redondear_hacia_arriba: "false" }, false)
    expect(r).toEqual({
      ok: true,
      valores: { nombre: "TP 250cc", diametro_core_cm: 15.75, espesor_cm: 0.0382, largo_envase_cm: 18.5, redondear_hacia_arriba: false },
    })
  })

  it("con coma, los puntos son miles", () => {
    const r = leerFormulario(sabores, { nombre: "Pera", familia_id: "f1", volumen: "2.710,5" }, true)
    expect(r.ok && r.valores.volumen).toBe(2710.5)
  })

  it("avisa si un número no se entiende", () => {
    expect(leerFormulario(sabores, { nombre: "Pera", familia_id: "f1", volumen: "abc" }, true)).toEqual({
      ok: false,
      error: "Volumen por tambor/kit: escribe un número.",
    })
  })

  it("al editar no manda lo que solo se escribe al crear (los ml de una presentación)", () => {
    const presentaciones = seccionPorId("presentaciones")!
    const borrador = { volumen_ml: "330", cajas_x_camada: "15", cant_camada: "10", cajas_x_paleta: "150", litros_x_caja: "5,94", envases_x_caja: "18" }
    const editar = leerFormulario(presentaciones, borrador, false)
    const crear = leerFormulario(presentaciones, borrador, true)
    expect(editar.ok && "volumen_ml" in editar.valores).toBe(false)
    expect(crear.ok && crear.valores.volumen_ml).toBe(330)
  })
})

describe("secciones", () => {
  it("todas tienen ids distintos y campos con clave", () => {
    const ids = SECCIONES_CATALOGO.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SECCIONES_CATALOGO) expect(s.campos.every((c) => c.clave && c.etiqueta)).toBe(true)
  })
})
