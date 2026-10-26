import type { FilaCatalogo } from "@/lib/edicionDatos"
import type { Opcion, OpcionesExternas, Seccion } from "./tabla"

/*
 * Qué tiene cada catálogo de Edición de Datos: columnas, qué se puede
 * cambiar y cómo se agrupa. Lo que la base acepta lo decide
 * guardar_catalogo() (migración 20261111490000).
 */

const ordenDe = (lista: Opcion[] | undefined, valor: unknown) => lista?.find((o) => o.valor === String(valor))?.orden ?? 0

export const SECCIONES_CATALOGO: Seccion[] = [
  {
    id: "sabores",
    titulo: "Sabores",
    singular: "sabor",
    agruparPor: "familia_id",
    campos: [
      { clave: "nombre", etiqueta: "Sabor", tipo: "texto", ancho: "minmax(0, 2fr)" },
      {
        clave: "familia_id",
        etiqueta: "Familia",
        tipo: "opciones",
        opcionesDe: "familias",
        notaAlCambiar: "Cambiar la familia cambia cómo se ve su historia en Indicadores.",
      },
      // sabores.volumen: litros que rinde una unidad de preparación (tambor, o kit en Selecto/Mango/35 %).
      { clave: "volumen", etiqueta: "Volumen por tambor/kit", tipo: "numero", unidad: "L" },
    ],
  },
  {
    id: "presentaciones",
    titulo: "Presentaciones",
    singular: "presentación",
    campos: [
      { clave: "volumen_ml", etiqueta: "Envase", tipo: "numero", unidad: "ml", soloAlCrear: true },
      { clave: "cajas_x_camada", etiqueta: "Cajas por camada", tipo: "numero" },
      { clave: "cant_camada", etiqueta: "Camadas", tipo: "numero" },
      { clave: "cajas_x_paleta", etiqueta: "Cajas por paleta", tipo: "numero" },
      { clave: "litros_x_caja", etiqueta: "Litros por caja", tipo: "numero", unidad: "L" },
      { clave: "envases_x_caja", etiqueta: "Envases por caja", tipo: "numero" },
    ],
  },
  {
    id: "velocidades",
    titulo: "Velocidades",
    singular: "velocidad",
    agruparPor: "linea_id",
    noRepetir: ["presentacion_id", "maquina"],
    compacta: true,
    campos: [
      { clave: "linea_id", etiqueta: "Línea", tipo: "opciones", opcionesDe: "lineas" },
      { clave: "presentacion_id", etiqueta: "Presentación", tipo: "opciones", opcionesDe: "presentaciones", ancho: "120px" },
      { clave: "maquina", etiqueta: "Máquina", tipo: "texto", ancho: "110px" },
      { clave: "envases_hora", etiqueta: "Envases por hora", tipo: "numero", ancho: "150px" },
      { clave: "litros_hora", etiqueta: "Litros por hora", tipo: "numero", ancho: "150px" },
    ],
    // Dentro de cada línea: presentación de mayor a menor, después la velocidad.
    ordenar: (a, b, opciones) =>
      ordenDe(opciones.presentaciones, b.presentacion_id) - ordenDe(opciones.presentaciones, a.presentacion_id) ||
      Number(a.envases_hora) - Number(b.envases_hora),
  },
  {
    id: "lineas",
    titulo: "Líneas",
    singular: "línea",
    sinAgregar: true,
    campos: [
      { clave: "codigo", etiqueta: "Código", tipo: "texto", soloAlCrear: true, ancho: "160px" },
      { clave: "nombre", etiqueta: "Nombre", tipo: "texto", ancho: "minmax(0, 2fr)" },
    ],
  },
  {
    id: "bobinas",
    titulo: "Bobinas",
    singular: "tipo de bobina",
    campos: [
      { clave: "nombre", etiqueta: "Tipo", tipo: "texto", ancho: "minmax(0, 1.4fr)" },
      { clave: "diametro_core_cm", etiqueta: "Diámetro del core", tipo: "numero", unidad: "cm" },
      { clave: "espesor_cm", etiqueta: "Espesor", tipo: "numero", unidad: "cm" },
      { clave: "largo_envase_cm", etiqueta: "Largo del envase", tipo: "numero", unidad: "cm" },
      {
        clave: "redondear_hacia_arriba",
        etiqueta: "Redondeo",
        tipo: "opciones",
        booleano: true,
        opciones: [
          { valor: "true", etiqueta: "Hacia arriba" },
          { valor: "false", etiqueta: "Al más cercano" },
        ],
      },
    ],
  },
  {
    id: "conteo",
    titulo: "Conteo por peso",
    singular: "tipo",
    campos: [
      { clave: "nombre", etiqueta: "Tipo", tipo: "texto", ancho: "minmax(0, 2.4fr)" },
      { clave: "peso_vacio_kg", etiqueta: "Peso vacío", tipo: "numero", unidad: "kg" },
      { clave: "peso_unidad_g", etiqueta: "Peso por unidad", tipo: "numero", unidad: "g" },
      {
        clave: "redondeo",
        etiqueta: "Redondeo",
        tipo: "opciones",
        opciones: [
          { valor: "ABAJO", etiqueta: "Hacia abajo" },
          { valor: "ARRIBA", etiqueta: "Hacia arriba" },
        ],
      },
    ],
  },
  {
    // Calculadora de Fórmula (migración 20261112390000).
    id: "formulas",
    titulo: "Fórmulas",
    singular: "fórmula",
    agruparPor: "familia",
    campos: [
      { clave: "nombre", etiqueta: "Sabor", tipo: "texto", ancho: "minmax(0, 2fr)" },
      {
        clave: "familia",
        etiqueta: "Familia",
        tipo: "opciones",
        opciones: [
          { valor: "CLASICOS", etiqueta: "Clásicos", orden: 0 },
          { valor: "PREMIUM", etiqueta: "Premium", orden: 1 },
          { valor: "TE", etiqueta: "Té", orden: 2 },
        ],
      },
      {
        clave: "unidad_base",
        etiqueta: "Por",
        tipo: "opciones",
        opciones: [
          { valor: "tambor", etiqueta: "Tambor" },
          { valor: "kit", etiqueta: "Kit" },
        ],
      },
    ],
  },
  {
    // Lo que lleva cada fórmula por tambor o kit: azúcar, micros, agua…
    id: "insumos",
    titulo: "Insumos de fórmula",
    singular: "insumo",
    agruparPor: "variante_id",
    campos: [
      { clave: "insumo", etiqueta: "Insumo", tipo: "texto", ancho: "minmax(0, 2fr)" },
      { clave: "variante_id", etiqueta: "Fórmula", tipo: "opciones", opcionesDe: "formulas" },
      { clave: "cantidad", etiqueta: "Cantidad", tipo: "numero" },
      {
        clave: "unidad",
        etiqueta: "Unidad",
        tipo: "opciones",
        opciones: [
          { valor: "kg", etiqueta: "kg" },
          { valor: "L", etiqueta: "L" },
        ],
      },
    ],
  },
  {
    // Inventario diario (migraciones 20261112290000 y 20261112390000).
    id: "empaque",
    titulo: "Material de empaque",
    singular: "material",
    campos: [
      { clave: "nombre", etiqueta: "Material", tipo: "texto", ancho: "minmax(0, 2fr)" },
      { clave: "unidad", etiqueta: "Se cuenta en", tipo: "texto" },
      { clave: "orden", etiqueta: "Orden en la lista", tipo: "numero" },
    ],
    ordenar: (a, b) => Number(a.orden) - Number(b.orden),
  },
]

/** Grupos del menú de la izquierda. */
export const GRUPOS_MENU: { titulo: string; secciones: string[] }[] = [
  { titulo: "Planta", secciones: ["sabores", "presentaciones", "velocidades", "lineas"] },
  { titulo: "Materia prima", secciones: ["formulas", "insumos"] },
  { titulo: "Inventario", secciones: ["empaque"] },
  { titulo: "Calculadoras", secciones: ["bobinas", "conteo"] },
]

export function seccionPorId(id: string): Seccion | undefined {
  return SECCIONES_CATALOGO.find((s) => s.id === id)
}

/** Total y activos, para el número al lado de cada sección del menú. */
export function contarActivos(filas: FilaCatalogo[] | undefined): number | null {
  return filas ? filas.filter((f) => f.activo).length : null
}

export type { OpcionesExternas }
