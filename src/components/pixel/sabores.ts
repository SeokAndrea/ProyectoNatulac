// ============================================================
//  sabores.ts  —  EL DIBUJO Y LOS COLORES DE CADA FRUTA
// ============================================================
//
//  Cada sabor tiene un dibujito de su fruta de 8 x 8 pixeles.
//  Ese dibujo se "pega" encima del envase, en el lugar que
//  dice presentaciones.ts.
//
//  Letras de la fruta:
//   F = fruta          f = sombra de la fruta   L = brillo
//   S = tallo          H = hoja                 "." = vacío
//
//  "acento" = el color principal del sabor. Algunas familias lo
//  usan para el nombre (Premium, Té) o para el fondo (Selecto).
//
//  Para agregar un sabor: copia un bloque completo, cámbiale
//  el nombre, el dibujo y los colores.
// ============================================================

export interface SaborPixel {
  nombre: string
  /** Color principal del sabor — lo usan las familias que dicen "acento". */
  acento: string
  dibujo: string[]
  colores: Record<string, string>
}

export const SABORES: Record<string, SaborPixel> = {
  pera: {
    nombre: "Pera",
    acento: "#8dc63f",
    dibujo: [
      "....SH..",
      "....S...",
      "...FFF..",
      "...FLF..",
      "..FFFFf.",
      ".FLFFFFf",
      ".FFFFFff",
      "..fffff.",
    ],
    colores: {
      F: "#b5cf5a", f: "#8fae3c", L: "#e4efa6",
      S: "#7a3e1c", H: "#4f7a3a",
    },
  },

  manzana: {
    nombre: "Manzana",
    acento: "#d8202a",
    dibujo: [
      "....S...",
      "...SHH..",
      ".FF.SFF.",
      "FLFFFFFf",
      "FLFFFFFf",
      "FFFFFFff",
      ".FFFFFf.",
      "..ff.ff.",
    ],
    colores: {
      F: "#d62b2b", f: "#a01818", L: "#ff8a7a",
      S: "#6b3a1a", H: "#4f9a3a",
    },
  },

  durazno: {
    nombre: "Durazno",
    acento: "#f5a623",
    dibujo: [
      "....HH..",
      "...SHHH.",
      ".FFFSFF.",
      "FLLFfFFF",
      "FLFFfFFf",
      "FFFFfFff",
      ".FFFFff.",
      "..ffff..",
    ],
    colores: {
      F: "#f0723a", f: "#c9452a", L: "#ffd15c",
      S: "#6b3a1a", H: "#5aa83a",
    },
  },

  naranja: {
    nombre: "Naranja",
    acento: "#f39200",
    dibujo: [
      "....HH..",
      "...SHH..",
      "..FFFF..",
      ".FLFFFF.",
      "FLFFFFFf",
      "FFFFFFff",
      ".FFFFff.",
      "..ffff..",
    ],
    colores: {
      F: "#f7941d", f: "#d06a0a", L: "#ffd08a",
      S: "#6b3a1a", H: "#3f8a2e",
    },
  },

  mango: {
    nombre: "Mango",
    acento: "#ffb627",
    dibujo: [
      "......SH",
      ".....SHH",
      "...FFF..",
      "..FLFFF.",
      ".FLFFFFf",
      "FFFFFFff",
      "FFFFFff.",
      ".fffff..",
    ],
    colores: {
      F: "#ffb627", f: "#e07b1a", L: "#ff6b3d", // L = la parte rojiza del mango
      S: "#6b3a1a", H: "#4f9a3a",
    },
  },

  // Cóctel de frutas: piña, naranja, guayaba y maracuyá.
  // Como son varias frutas, este sabor usa letras extra
  // (solo existen aquí, cada una es una fruta):
  //   S / s = piña (clara / oscura)   H = corona verde de la piña
  //   F / f = naranja (clara / oscura)
  //   G     = guayaba (rosada)
  //   M / m = maracuyá (amarilla / semillas)
  coctel: {
    nombre: "Cóctel",
    acento: "#f39200",
    dibujo: [
      "H.H.....",
      ".HH..FF.",
      ".SS.FFFF",
      ".SsSFFFf",
      "GSsSMMM.",
      "GGSSMmMM",
      "GG.MMmMM",
      "....MMM.",
    ],
    colores: {
      S: "#e0a82e", s: "#a8701a", H: "#4f9a3a",
      F: "#f7941d", f: "#d06a0a",
      G: "#f07a7a",
      M: "#f5d547", m: "#8a5a1a",
    },
  },

  coco: {
    nombre: "Coco",
    acento: "#c9a36b",
    dibujo: [
      "HH......",
      ".HH.....",
      "..ffff..",
      ".fLLLLf.",
      "fLLLLLLf",
      "fLLLLLLf",
      ".fLLLLf.",
      "..ffff..",
    ],
    colores: {
      F: "#8b5a2b", f: "#6b4020", L: "#f7f4ec", // L = carne blanca del coco
      S: "#6b4020", H: "#3f8a2e",
    },
  },

  limon: {
    nombre: "Limón",
    acento: "#6cc24a",
    dibujo: [
      "........",
      ".....HH.",
      "..FFFFH.",
      ".FLLFFF.",
      "FLFFFFFf",
      "FFFFFFff",
      ".FFFFff.",
      "..ffff..",
    ],
    colores: {
      F: "#7ac943", f: "#4f9a2a", L: "#d4f0a0",
      S: "#4f7a3a", H: "#2f6b2a",
    },
  },
}
