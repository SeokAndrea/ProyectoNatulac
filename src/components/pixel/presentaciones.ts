// ============================================================
//  presentaciones.ts  —  LA FORMA DE CADA ENVASE
// ============================================================
//
//  Aquí está dibujada la FORMA de cada presentación (litro, 330, etc.).
//  Los colores NO van aquí: van en familias.ts (Clásicos, Jucosa...).
//  La fruta tampoco: va en sabores.ts.
//
//  Cada letra es UN pixel. El punto "." es vacío (transparente).
//  Todas las filas de un mismo dibujo deben tener el mismo largo.
//
//  Significado de cada letra:
//   T = tapa             t = sombra de la tapa
//   O = pajita (sorbete)
//   K = contorno         B = franja de arriba del envase
//   A = color del envase a = costado (más oscuro)
//   Y = sol del logo     W = óvalo del logo    R = letras del logo
//   X = texto pequeño ("Néctar de", "Bebida de"...)
//   N = nombre del sabor ("Pera", "Manzana"...)
//   P = fondo de abajo, detrás de la fruta
//
//  "fruta" dice DÓNDE se pega el dibujo de la fruta:
//   x = cuántos pixeles desde la izquierda
//   y = cuántos pixeles desde arriba
// ============================================================

export interface Presentacion {
  nombre: string
  /** Dónde se pega el dibujo de la fruta (en pixeles, desde arriba a la izquierda). */
  fruta: { x: number; y: number }
  dibujo: string[]
}

/*
 * La "llave" de cada presentación es su volumen en ml, igual que el
 * código de presentación que usa el resto de la app ("1000", "500"...),
 * así se puede pasar directo corrida.presentacion.
 */
export const PRESENTACIONES: Record<string, Presentacion> = {
  // ---------- 1 LITRO (alto y delgado, con tapa) ----------
  "1000": {
    nombre: "1 Litro",
    fruta: { x: 3, y: 15 },
    dibujo: [
      ".....TTTT.....",
      "....tTTTTt....",
      "....tTTTTt....",
      ".KKKKKKKKKKKK.",
      ".KBBBBBBBBBaK.",
      ".KAAAYYYYAAaK.",
      ".KAWWWWWWWWaK.",
      ".KWRRRRRRRRaK.",
      ".KAWWWWWWWWaK.",
      ".KAAAAAAAAAaK.",
      ".KAAXXAXXXAaK.",
      ".KAAAAAAAAAaK.",
      ".KAANNNNNNAaK.",
      ".KAAAAAAAAAaK.",
      ".KAAAAAAAAAaK.",
      ".KAAAAAAAAAaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KKKKKKKKKKKK.",
    ],
  },

  // ---------- 330 ml (como el litro, pero más pequeño) ----------
  "330": {
    nombre: "330 ml",
    fruta: { x: 2, y: 11 },
    dibujo: [
      "....TTTT....",
      "...tTTTTt...",
      "KKKKKKKKKKKK",
      "KBBBBBBBBBaK",
      "KAAAYYYYAAaK",
      "KAWWWWWWWAaK",
      "KWRRRRRRRWaK",
      "KAWWWWWWWAaK",
      "KAAXXAXXXAaK",
      "KAANNNNNNAaK",
      "KAAAAAAAAAaK",
      "KAAAAAAAAAaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KKKKKKKKKKKK",
    ],
  },

  // ---------- 500 ml (bajito y ancho, con tapa) ----------
  "500": {
    nombre: "500 ml",
    fruta: { x: 3, y: 8 },
    dibujo: [
      ".....TTTT.....",
      "....tTTTTt....",
      ".KKKKKKKKKKKK.",
      ".KBBBYYYYBBaK.",
      ".KWRRRRRRRRaK.",
      ".KAWWWWWWWWaK.",
      ".KAAXXAXXXAaK.",
      ".KAANNNNNNAaK.",
      ".KAAAAAAAAAaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KPPPPPPPPPaK.",
      ".KKKKKKKKKKKK.",
    ],
  },

  // ---------- 250 ml (delgado, con pajita y "orejitas" arriba) ----------
  "250": {
    nombre: "250 ml",
    fruta: { x: 1, y: 15 },
    dibujo: [
      "...OO......",
      ".....O.....",
      ".....O.....",
      ".....O.....",
      ".....O.....",
      "B....O....B",
      "KKKKKKKKKKK",
      "KBBBBBBBBaK",
      "KAAYYYYAAaK",
      "KWWWWWWWWaK",
      "KWRRRRRRWaK",
      "KWWWWWWWWaK",
      "KAXXAXXXAaK",
      "KANNNNNNAaK",
      "KAAAAAAAAaK",
      "KPPPPPPPPaK",
      "KPPPPPPPPaK",
      "KPPPPPPPPaK",
      "KPPPPPPPPaK",
      "KPPPPPPPPaK",
      "KPPPPPPPPaK",
      "KPPPPPPPPaK",
      "KPPPPPPPPaK",
      "KKKKKKKKKKK",
    ],
  },

  // ---------- 200 ml (cajita pequeña, sin tapa) ----------
  "200": {
    nombre: "200 ml",
    fruta: { x: 2, y: 8 },
    dibujo: [
      "KKKKKKKKKKKK",
      "KBBBBBBBBBaK",
      "KBBBBBBBBBaK",
      "KAAAYYYYAAaK",
      "KWRRRRRRRWaK",
      "KAWWWWWWWAaK",
      "KAXXAXXXXAaK",
      "KANNNNNNNAaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KPPPPPPPPPaK",
      "KKKKKKKKKKKK",
    ],
  },
};
