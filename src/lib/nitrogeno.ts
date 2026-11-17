/*
 * Nitrógeno del turno (migración 20261116290000, Alexander 2026-11-17):
 * bombonas LLENAS al recibir el turno (Comenzar Turno) y al entregarlo
 * (Finalizar Turno), más las que llegaron durante el turno.
 *
 *   Consumo del turno = recibidas + llegaron − entregadas
 *
 * No se puede entregar más llenas de las que hubo (ej. recibe 3 y entrega 5):
 * hay que anotar las que llegaron (al menos 2) o corregir los conteos. La
 * misma regla la aplica guardar_nitrogeno_turno() en el servidor.
 * Solo los turnos abiertos después de la migración lo piden (nitrogeno_aplica).
 */

/** Lo cargado en el turno. Sin fila en la base: null. */
export interface NitrogenoTurno {
  /** Bombonas llenas al recibir el turno. */
  inicio: number | null
  /** Bombonas que llegaron durante el turno. */
  llegaron: number
  /** Bombonas llenas al entregar el turno. */
  fin: number | null
}

/** Lo que lleva el acta (1.6 y 1.8). */
export interface NitrogenoActa {
  /** false: turno anterior a la migración, el acta no muestra las filas. */
  aplica: boolean
  datos: NitrogenoTurno | null
  /** Lo que entregó el turno anterior del área (para comparar con lo recibido). */
  turnoAnterior: number | null
}

/** Forma cruda en turno_json(). */
export interface FilaNitrogeno {
  nitrogeno_aplica?: boolean
  nitrogeno?: { inicio: number | null; llegaron: number | null; fin: number | null } | null
  nitrogeno_turno_anterior?: number | null
}

export function mapearNitrogeno(fila: FilaNitrogeno): NitrogenoActa {
  const n = fila.nitrogeno
  return {
    aplica: fila.nitrogeno_aplica ?? false,
    datos: n ? { inicio: n.inicio, llegaron: n.llegaron ?? 0, fin: n.fin } : null,
    turnoAnterior: fila.nitrogeno_turno_anterior ?? null,
  }
}

/** Recibidas + llegaron − entregadas. null mientras falte el inicio o el fin. */
export function consumoNitrogeno(n: NitrogenoTurno | null): number | null {
  if (!n || n.inicio === null || n.fin === null) return null
  return n.inicio + n.llegaron - n.fin
}

/**
 * ¿Cuadran los conteos? null si sí (o si falta un dato). Mismo texto que el servidor
 * para que el supervisor lo vea antes de guardar.
 */
export function errorNitrogeno(inicio: number | null, llegaron: number, fin: number | null): string | null {
  if (inicio === null || fin === null || fin <= inicio + llegaron) return null
  return `Entregas ${fin} bombonas llenas, pero recibiste ${inicio} y anotaste ${llegaron} que llegaron en el turno. Si llegaron bombonas, anota cuántas en «Llegaron en el turno» (al menos ${fin - inicio}); si no, revisa los conteos.`
}

/** Texto de un número entero de bombonas escrito por el supervisor; null si no es válido. */
export function leerBombonas(texto: string): number | null {
  const t = texto.trim()
  if (!/^\d{1,3}$/.test(t)) return null
  return Number(t)
}

export const textoBombonas = (n: number) => `${n} ${n === 1 ? "bombona" : "bombonas"}`
