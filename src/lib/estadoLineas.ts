import { useEffect, useRef, useState } from "react"
import type { EstadoLinea, LineaConEstado } from "@/components/panel/calculosPanel"
import type { ParadaEnVivo } from "@/lib/paradasEnVivo"
import { supabase } from "@/lib/supabase"

/*
 * ESTADO DE LÍNEA DESDE LA BASE — Fase 2 de
 * docs/superpowers/specs/2026-11-05-estado-linea-unico-design.md.
 *
 * estado_lineas() (migración 20261114790000) devuelve el estado ya decidido
 * de cada línea del área. La tarjeta de Líneas, el Modo Paradas y los dos
 * paneles lo piden cada 15 s: todos muestran la misma respuesta, y cuando
 * cambia (otra corrida, una pausa, otro turno…) recargan sus datos solos.
 *
 * Si la base no responde (sin conexión, o la migración todavía no se aplicó),
 * cada pantalla usa su cálculo de respaldo (estadoDeLineas +
 * aplicarParadasEnVivo, calculosPanel.ts), que sigue la misma regla.
 */

export const REFRESCO_ESTADO_MS = 15 * 1000

export interface ParadaDeLaBase {
  id: string | null
  inicio: string
  tipoNombre: string | null
  nota: string | null
  deMantenimiento: boolean
  lineaNoProgramada: boolean
  visible: boolean
}

export interface EstadoLineaDeLaBase {
  linea: string
  nombre: string
  estado: EstadoLinea
  corridaId: string | null
  pausadaEn: string | null
  loteTerminado: boolean
  condicion: string | null
  observacion: string | null
  parada: ParadaDeLaBase | null
}

export interface EstadoLineasDeLaBase {
  areaCodigo: string
  turnoId: string | null
  calculadoEn: string
  lineas: EstadoLineaDeLaBase[]
}

const ESTADOS: readonly EstadoLinea[] = [
  "activa",
  "parada",
  "detenida_por_parada",
  "cambio_presentacion",
  "cip",
  "sin_programacion",
  "libre",
]

interface FilaParada {
  id: string | null
  inicio: string
  tipo_nombre: string | null
  nota: string | null
  de_mantenimiento: boolean
  linea_no_programada: boolean
  visible: boolean
}

interface FilaLinea {
  linea_codigo: string
  linea_nombre: string
  estado: string
  corrida_id: string | null
  pausada_en: string | null
  lote_terminado: boolean
  condicion: string | null
  observacion: string | null
  parada: FilaParada | null
}

/** La respuesta de estado_lineas(); null si no tiene la forma esperada. */
export function mapearEstadoLineas(data: unknown): EstadoLineasDeLaBase | null {
  const d = data as { area_codigo?: string; turno_id?: string | null; calculado_en?: string; lineas?: FilaLinea[] } | null
  if (!d || !Array.isArray(d.lineas)) return null
  const lineas: EstadoLineaDeLaBase[] = []
  for (const l of d.lineas) {
    // Un estado que esta versión de la app no conoce: mejor el cálculo propio que mostrar cualquier cosa.
    if (!ESTADOS.includes(l.estado as EstadoLinea)) return null
    lineas.push({
      linea: l.linea_codigo,
      nombre: l.linea_nombre,
      estado: l.estado as EstadoLinea,
      corridaId: l.corrida_id ?? null,
      pausadaEn: l.pausada_en ?? null,
      loteTerminado: !!l.lote_terminado,
      condicion: l.condicion ?? null,
      observacion: l.observacion ?? null,
      parada: l.parada
        ? {
            id: l.parada.id ?? null,
            inicio: l.parada.inicio,
            tipoNombre: l.parada.tipo_nombre ?? null,
            nota: l.parada.nota ?? null,
            deMantenimiento: !!l.parada.de_mantenimiento,
            lineaNoProgramada: !!l.parada.linea_no_programada,
            visible: !!l.parada.visible,
          }
        : null,
    })
  }
  return { areaCodigo: d.area_codigo ?? "", turnoId: d.turno_id ?? null, calculadoEn: d.calculado_en ?? "", lineas }
}

/** Lee estado_lineas(). null = la base no respondió (o falta la migración). */
export async function leerEstadoLineas(area: string | null): Promise<EstadoLineasDeLaBase | null> {
  try {
    const { data, error } = await supabase.rpc("estado_lineas", { p_area_codigo: area })
    if (error) return null
    return mapearEstadoLineas(data)
  } catch {
    return null
  }
}

/**
 * El estado de las líneas según la base, releído cada 15 s y al volver a la
 * pestaña. Un corte pasajero no borra lo último que llegó. null = nunca
 * respondió: la pantalla usa su cálculo de respaldo.
 */
export function useEstadoLineas(area: string | null, habilitado = true): EstadoLineasDeLaBase | null {
  const [leido, setLeido] = useState<{ area: string | null; valor: EstadoLineasDeLaBase } | null>(null)

  useEffect(() => {
    if (!habilitado) return
    let vivo = true
    async function cargar() {
      if (document.visibilityState === "hidden") return
      const valor = await leerEstadoLineas(area)
      if (vivo && valor) setLeido({ area, valor })
    }
    void cargar()
    const id = setInterval(() => void cargar(), REFRESCO_ESTADO_MS)
    document.addEventListener("visibilitychange", cargar)
    return () => {
      vivo = false
      clearInterval(id)
      document.removeEventListener("visibilitychange", cargar)
    }
  }, [area, habilitado])

  return habilitado && leido?.area === area ? leido.valor : null
}

/** Lo que importa para saber si cambió algo: turno, corridas, pausas, condiciones y paradas. */
export function firmaEstadoLineas(e: EstadoLineasDeLaBase | null): string | null {
  if (!e) return null
  const lineas = e.lineas.map((l) =>
    [l.linea, l.estado, l.corridaId ?? "-", l.pausadaEn ?? "-", l.loteTerminado ? 1 : 0, l.condicion ?? "-", l.parada?.id ?? "-"].join(":"),
  )
  return [e.turnoId ?? "-", ...lineas].join("|")
}

/**
 * Cuando lo que dice la base cambia, la pantalla recarga sus datos (corridas,
 * PT, tanques…): así no queda mostrando datos viejos hasta que alguien toque
 * algo. La primera lectura no recarga (la pantalla acaba de cargar).
 */
export function useRecargarAlCambiar(estado: EstadoLineasDeLaBase | null, recargar: () => void) {
  const firma = firmaEstadoLineas(estado)
  const anterior = useRef<string | null>(null)
  const recargarRef = useRef(recargar)
  useEffect(() => {
    recargarRef.current = recargar
  })
  useEffect(() => {
    if (firma === null) return
    if (anterior.current !== null && anterior.current !== firma) recargarRef.current()
    anterior.current = firma
  }, [firma])
}

/** La parada en curso de la base, con los minutos del turno en curso (como en el resto de las pantallas). */
export function paradaEnVivoDeLaBase(p: ParadaDeLaBase, ahora: Date, desdeTurno: Date | null): ParadaEnVivo {
  const desde = Math.max(new Date(p.inicio).getTime(), desdeTurno?.getTime() ?? 0)
  return {
    minutos: Math.max(0, Math.round((ahora.getTime() - desde) / 60000)),
    deMantenimiento: p.deMantenimiento,
    tipoNombre: p.tipoNombre,
    visible: p.visible,
    lineaNoProgramada: p.lineaNoProgramada,
    nota: p.nota,
  }
}

/**
 * El estado de la base sobre lo que calculó la pantalla para UNA línea. Sin
 * dato de la base, queda lo calculado (respaldo). Si la base dice que no hay
 * corrida en marcha, la de la pantalla (vieja) no se muestra; si dice que la
 * hay, se usa la de la pantalla hasta que recargue.
 */
export function conEstadoDeLaBase(l: LineaConEstado, base: EstadoLineaDeLaBase | null | undefined, ahora: Date, desdeTurno: Date | null): LineaConEstado {
  if (!base) return l
  const conCorrida = base.corridaId !== null
  return {
    ...l,
    estado: base.estado,
    corrida: conCorrida ? l.corrida : null,
    observacion: base.observacion,
    paradaEnVivo: base.parada ? paradaEnVivoDeLaBase(base.parada, ahora, desdeTurno) : null,
  }
}

/** Lo mismo para todas las líneas de una pantalla. */
export function conEstadosDeLaBase(lineas: LineaConEstado[], base: EstadoLineasDeLaBase | null, ahora: Date, desdeTurno: Date | null): LineaConEstado[] {
  if (!base) return lineas
  return lineas.map((l) => conEstadoDeLaBase(l, base.lineas.find((b) => b.linea === l.codigo), ahora, desdeTurno))
}
