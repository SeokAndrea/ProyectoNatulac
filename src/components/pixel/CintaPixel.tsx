// ============================================================
//  CintaPixel.tsx  —  CINTA TRANSPORTADORA PIXEL ART
// ============================================================
//
//  Dibuja la cinta con los envases avanzando. Se estira al ancho
//  del lugar donde la pongas (el alto se calcula solo).
//
//  Uso:
//    <CintaPixel presentacion="1000" familia="clasico" sabor="pera" />
//
//  Opciones:
//    presentacion → "1000", "500", "330", "250" o "200" (como corrida.presentacion)
//    familia      → "clasico", "jucosa", "selecto", "premium" o "te"
//    sabor        → "manzana", "pera", "durazno", "naranja", "mango",
//                   "coctel", "coco" o "limon"
//    velocidad    → "lenta", "normal" o "rapida"
//    pausada      → true = la cinta se queda quieta
//    conPatas     → false = sin las patas de la máquina (más bajita)
//    separacion   → espacio entre un envase y otro
//    modo         → "produccion" (normal), "cip" (limpieza, sin envases)
//                   o "reparacion" (cinta quieta, un técnico trabajando)
//    alertaMerma  → true = algunos envases salen aplastados y caen al
//                   tacho de descarte, con una baliza roja parpadeando
//    conEnvases   → false = la cinta sin envases (línea sin corrida, o
//                   un sabor que no tiene dibujo)
//
//  Los dibujos de CIP, reparación y merma están en escenasCinta.ts.
// ============================================================

import { useEffect, useRef } from "react"
import { armarJugo } from "./armarJugo"
import {
  dibujarBaliza,
  dibujarCIP,
  dibujarReparacion,
  dibujarTachoFrente,
  TACHO,
  type ModoCinta,
} from "./escenasCinta"
import { cn } from "@/lib/utils"
import { ALTURA_CINTA, ANCHO, METAL, METAL_CLARO, METAL_MUY_OSCURO, METAL_OSCURO, rectangulo } from "./lienzo"

// Las 3 velocidades de la cinta.
// El número es cuántos pixeles avanza la cinta en cada cuadro.
// Si quieres que vaya más rápido o más lento, cambia solo el número.
const VELOCIDADES = {
  lenta: 0.3,
  normal: 0.6,
  rapida: 1.2,
}
export type VelocidadCinta = keyof typeof VELOCIDADES

export function CintaPixel({
  presentacion,
  familia,
  sabor,
  velocidad = "normal",
  pausada = false,
  conPatas = true,
  separacion = 26,
  modo = "produccion",
  alertaMerma = false,
  baliza = false,
  conEnvases = true,
  className,
}: {
  presentacion: string
  familia: string
  sabor: string
  velocidad?: VelocidadCinta
  pausada?: boolean
  conPatas?: boolean
  separacion?: number
  modo?: ModoCinta
  alertaMerma?: boolean
  /** Baliza roja girando (ej. parada de más de 15 min en el Panel de Paradas), en cualquier modo. */
  baliza?: boolean
  conEnvases?: boolean
  className?: string
}) {
  // "canvasRef" es como una etiqueta para encontrar el lienzo donde dibujamos
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // El tacho de merma y el técnico necesitan el piso: en esos casos el lienzo es alto
  const necesitaPiso = conPatas || alertaMerma || modo === "reparacion"
  const alto = necesitaPiso ? 54 : ALTURA_CINTA + 10

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return

    // Armamos el envase con sus 3 piezas (se pinta una sola vez)
    const jugo = armarJugo(presentacion, familia, sabor)

    // Convertimos el nombre de la velocidad en su número (si está mal, la normal)
    const pasoPorCuadro = VELOCIDADES[velocidad] ?? VELOCIDADES.normal

    // Si la persona pidió "menos movimiento" en su equipo, no animamos
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    let avance = 0 // cuánto se ha movido la cinta
    let cuadro = 0 // cuántos cuadros van (para chispas, gotas, baliza...)
    let idAnimacion = 0 // número para poder detener la animación

    // En reparación la cinta está quieta; en CIP avanza despacito (se está lavando)
    const cintaQuieta = pausada || modo === "reparacion"
    const paso = modo === "cip" ? VELOCIDADES.lenta : pasoPorCuadro
    // CIP y reparación tienen movimiento propio aunque la cinta no avance
    const hayMovimiento = !sinMovimiento && (!cintaQuieta || modo !== "produccion" || alertaMerma || baliza)

    // Dibuja UN cuadro de la animación
    function dibujarCuadro() {
      if (!ctx) return
      ctx.clearRect(0, 0, ANCHO, alto)
      if (conPatas) dibujarPatas(ctx, alto)
      dibujarCinta(ctx, avance)
      if (modo !== "cip" && conEnvases) dibujarJugos(ctx, jugo, avance, separacion, alertaMerma && modo === "produccion", alto)
      dibujarBaranda(ctx)
      if (modo === "cip") dibujarCIP(ctx, cuadro, avance)
      if (modo === "reparacion") dibujarReparacion(ctx, cuadro, alto)
      if (alertaMerma && modo === "produccion") {
        dibujarTachoFrente(ctx, alto)
        dibujarBaliza(ctx, cuadro)
      } else if (baliza) {
        dibujarBaliza(ctx, cuadro)
      }
    }

    // Repite: dibuja, avanza un poquito, y pide el siguiente cuadro
    function animar() {
      dibujarCuadro()
      if (!cintaQuieta) avance += paso
      cuadro++
      idAnimacion = requestAnimationFrame(animar)
    }

    if (hayMovimiento) animar()
    else dibujarCuadro() // un solo dibujo, quieto

    // Cuando el componente se quita de la pantalla, paramos la animación
    return () => cancelAnimationFrame(idAnimacion)
  }, [presentacion, familia, sabor, velocidad, pausada, conPatas, separacion, alto, modo, alertaMerma, baliza, conEnvases])

  return (
    <canvas
      ref={canvasRef}
      width={ANCHO}
      height={alto}
      aria-hidden="true"
      className={cn("block h-auto w-full", className)}
      style={{ imageRendering: "pixelated" }} // mantiene el estilo pixel art (sin borroso)
    />
  )
}

// ---------- LOS ENVASES ----------
//  Si hay alerta de merma, 1 de cada 3 envases sale aplastado y, al llegar
//  al tacho, se cae adentro (y vuelve a aparecer al dar la vuelta).
function dibujarJugos(
  ctx: CanvasRenderingContext2D,
  jugo: HTMLCanvasElement,
  avance: number,
  separacion: number,
  conMerma: boolean,
  alto: number,
) {
  const anchoEnvase = jugo.width
  const arriba = ALTURA_CINTA - jugo.height // así todos se paran sobre la cinta

  // Distancia entre envases (el ancho del envase + el espacio que elegiste)
  const paso = anchoEnvase + separacion
  // Cuántos envases caben para llenar la cinta sin huecos
  const cantidad = Math.ceil((ANCHO + anchoEnvase) / paso) + 1
  const recorrido = cantidad * paso

  for (let i = 0; i < cantidad; i++) {
    // El "%" hace que al salir por la derecha vuelva a entrar por la izquierda
    const x = Math.round(((i * paso + avance) % recorrido) - anchoEnvase)
    const defectuoso = conMerma && i % 3 === 1

    if (!defectuoso) {
      rectangulo(ctx, x + 1, ALTURA_CINTA, anchoEnvase - 2, 1, METAL_OSCURO) // sombrita
      ctx.drawImage(jugo, x, arriba)
      continue
    }

    // --- Envase defectuoso: aplastado (más bajito) ---
    const aplastado = Math.round(jugo.height * 0.3)
    const centro = x + anchoEnvase / 2
    // ¿Ya llegó al tacho? Entonces se va cayendo
    let caida = 0
    if (centro > TACHO.x) caida = Math.min(alto, (centro - TACHO.x) * 1.6)
    if (centro > TACHO.x + TACHO.ancho) continue // ya está dentro del tacho: no se dibuja

    if (caida === 0) rectangulo(ctx, x + 1, ALTURA_CINTA, anchoEnvase - 2, 1, METAL_OSCURO)
    ctx.drawImage(jugo, x, arriba + aplastado + caida, anchoEnvase, jugo.height - aplastado)
    // abolladura: una rayita oscura cruzada
    ctx.fillStyle = "rgba(0,0,0,0.45)"
    for (let k = 0; k < anchoEnvase - 4; k++) ctx.fillRect(x + 2 + k, arriba + aplastado + caida + 6 + (k % 3), 1, 1)
    // jugo derramándose en la cinta (solo mientras va sobre la cinta)
    if (caida === 0) rectangulo(ctx, x - 2, ALTURA_CINTA, 3, 1, "#e0a82e")
  }
}

// ---------- LA CINTA (la superficie que se mueve) ----------
function dibujarCinta(ctx: CanvasRenderingContext2D, avance: number) {
  const y = ALTURA_CINTA
  rectangulo(ctx, 0, y, ANCHO, 3, METAL)

  // Rayitas de la cinta que se mueven (dan la sensación de movimiento)
  const mover = Math.floor(avance)
  for (let x = 0; x < ANCHO; x++) {
    if ((x - mover) % 6 === 0) rectangulo(ctx, x, y, 1, 3, METAL_OSCURO)
  }

  // Estructura de metal debajo de la cinta
  rectangulo(ctx, 0, y + 3, ANCHO, 1, METAL_CLARO)
  rectangulo(ctx, 0, y + 4, ANCHO, 4, METAL)
  rectangulo(ctx, 0, y + 8, ANCHO, 1, METAL_OSCURO)

  // Agujeros alargados de la estructura
  for (let x = 4; x < ANCHO; x += 12) rectangulo(ctx, x, y + 5, 6, 2, METAL_MUY_OSCURO)
}

// ---------- LAS PATAS DE LA MÁQUINA ----------
function dibujarPatas(ctx: CanvasRenderingContext2D, alto: number) {
  const largo = alto - ALTURA_CINTA - 10
  for (const x of [30, 100, 170]) {
    rectangulo(ctx, x, ALTURA_CINTA + 9, 3, largo, METAL)
    rectangulo(ctx, x, ALTURA_CINTA + 9, 1, largo, METAL_CLARO)
    rectangulo(ctx, x + 2, ALTURA_CINTA + 9, 1, largo, METAL_OSCURO)
    rectangulo(ctx, x - 2, alto - 2, 7, 2, METAL_MUY_OSCURO) // pie
  }
}

// ---------- LA BARANDA (el tubo que va delante de los envases) ----------
function dibujarBaranda(ctx: CanvasRenderingContext2D) {
  const y = ALTURA_CINTA - 6
  for (let x = 10; x < ANCHO; x += 45) rectangulo(ctx, x, y, 2, 6, METAL_OSCURO) // soportes
  rectangulo(ctx, 0, y, ANCHO, 1, METAL_CLARO)
  rectangulo(ctx, 0, y + 1, ANCHO, 1, METAL_OSCURO)
}
