// ============================================================
//  familias.ts  —  LOS COLORES DE CADA FAMILIA DE PRODUCTO
// ============================================================
//
//  OJO: en la app, "línea" es la línea física de llenado (Línea 1, 2, 3)
//  y "familia" es la gama del producto (Clásicos, Jucosa, Selecto...),
//  igual que la tabla familias_producto de la base. Por eso aquí se
//  llaman familias.
//
//  Cada familia (Clásico, Jucosa, Selecto, Premium, Té) pinta
//  las letras del dibujo de presentaciones.ts con SUS colores.
//
//  Truco: si escribes "acento" en vez de un color, se usa el
//  color principal del sabor (rojo para manzana, naranja para
//  durazno...). Así, por ejemplo, el nombre del té cambia de
//  color según el sabor sin tener que hacer una familia por sabor.
//
//  Para cambiar un color: reemplaza el código "#......".
//
//  QUÉ EXISTE EN CADA FAMILIA:
//   presentaciones → en qué tamaños se fabrica esa familia
//   sabores        → qué sabores tiene esa familia
//  Los nombres deben ser iguales a los de presentaciones.ts y sabores.ts.
//  Si pides una combinación que no existe, el programa usa la
//  primera de la lista (y avisa en la consola del navegador).
// ============================================================

// Listas que se repiten, para no escribirlas varias veces
const TODAS_LAS_PRESENTACIONES = ["1000", "500", "330", "250", "200"]
const SABORES_CLASICOS = ["manzana", "pera", "durazno", "naranja", "mango", "coctel"]

// Colores que se usan igual en TODAS las familias
export const COLORES_COMUNES: Record<string, string> = {
  O: "#f2f2f2", // pajita (sorbete)
}

export interface Familia {
  nombre: string
  presentaciones: string[]
  sabores: string[]
  /** Letra del dibujo → color. "acento" = color principal del sabor. */
  colores: Record<string, string>
}

export const FAMILIAS: Record<string, Familia> = {
  // ---------- CLÁSICO (azul Natulac, como el de pera) ----------
  clasico: {
    nombre: "Clásico",
    presentaciones: TODAS_LAS_PRESENTACIONES,
    sabores: SABORES_CLASICOS,
    colores: {
      T: "#7dbb3a", // tapa verde
      t: "#5c9227", // sombra de la tapa
      K: "#141a45", // contorno
      B: "#2d3b8f", // franja de arriba (igual al envase)
      A: "#2d3b8f", // azul Natulac
      a: "#1f2a6b", // costado
      Y: "#f2b632", // sol amarillo del logo
      W: "#ffffff", // óvalo blanco del logo
      R: "#d8202a", // letras rojas "Natulac"
      X: "#ffffff", // "Néctar de"
      N: "#8dc63f", // nombre del sabor (verde)
      P: "#cfe3a0", // fondo verde claro de abajo
    },
  },

  // ---------- JUCOSA (verde con franja roja/naranja) ----------
  jucosa: {
    nombre: "Jucosa",
    presentaciones: ["1000", "200"],
    sabores: SABORES_CLASICOS,
    colores: {
      T: "#f2f2f2", // tapa blanca
      t: "#c4c4c4",
      K: "#2e4a1a",
      B: "#e0452a", // franja roja de arriba
      A: "#b9d44a", // verde amarillento
      a: "#94b02e",
      Y: "#3f8a2e", // hojita verde del logo
      W: "#ffffff", // fondo blanco del logo
      R: "#d8202a", // letras rojas "Jucosa"
      X: "#1f6b2a", // "Bebida de"
      N: "#ffffff", // nombre del sabor (blanco)
      P: "#8fbf3a", // verde más oscuro abajo
    },
  },

  // ---------- SELECTO (celeste, tapa azul oscuro) ----------
  selecto: {
    nombre: "Selecto",
    presentaciones: TODAS_LAS_PRESENTACIONES,
    sabores: SABORES_CLASICOS,
    colores: {
      T: "#2a3480", // tapa azul oscuro
      t: "#1b2260",
      K: "#1b2260",
      B: "#3a4aa0", // franja "SELECTO"
      A: "#a9cdea", // celeste
      a: "#86b0d6",
      Y: "#f2b632",
      W: "#ffffff",
      R: "#d8202a",
      X: "#2a3480", // "Néctar de" azul
      N: "#2a3480", // nombre azul
      P: "acento",  // fondo de abajo del color del sabor (como el jugo)
    },
  },

  // ---------- PREMIUM (azul marino, letras blancas) ----------
  premium: {
    nombre: "Premium",
    presentaciones: TODAS_LAS_PRESENTACIONES,
    sabores: ["naranja", "manzana", "coco"],
    colores: {
      T: "#1c2350", // tapa azul marino
      t: "#11163a",
      K: "#0f1330",
      B: "#1f2a5c",
      A: "#1f2a5c", // azul marino
      a: "#161f48",
      Y: "#1f2a5c", // sin sol (mismo color que el fondo)
      W: "#1f2a5c", // sin óvalo (mismo color que el fondo)
      R: "#ffffff", // "Natulac" en blanco
      X: "#e8e4d0", // texto pequeño crema
      N: "acento",  // nombre del color del sabor
      P: "#1f2a5c",
    },
  },

  // ---------- TÉ (negro, tapa plateada) ----------
  te: {
    nombre: "Té",
    presentaciones: TODAS_LAS_PRESENTACIONES,
    sabores: ["limon", "durazno"],
    colores: {
      T: "#d9d9d9", // tapa plateada
      t: "#a8a8a8",
      K: "#0a0a0a",
      B: "#1a1a1a",
      A: "#1f1f1f", // negro
      a: "#111111",
      Y: "#1f1f1f", // sin sol
      W: "#1f1f1f", // sin óvalo
      R: "#ffffff", // "Natulac" en blanco
      X: "#ffffff", // "TÉ" en blanco
      N: "acento",  // "LEMON", "DURAZNO"... del color del sabor
      P: "#2b2b2b",
    },
  },
}
