import { supabase } from "@/lib/supabase"
import type { PresentacionLive } from "@/lib/catalogosLive"
import { listarActas } from "@/lib/historialTurnos"
import { mapearNovedadTurno, type NovedadTurno } from "@/lib/novedades"
import { duracionMin, type Parada } from "@/lib/paradas"
import { cargarParadasDelTurno, codigoDeParadaLive } from "@/lib/paradasCatalogo"
import { pctRendimiento } from "@/lib/reportes/teorico"
import type { ItemDia } from "@/lib/resumenDia"
import { mapearTurno, type FilaTurno, type TurnoActivo } from "@/lib/turno"
import { nombreGrupo, type GrupoCodigo } from "@/lib/catalogos"

/*
 * Resumen Diario (boceto aprobado por la dueña, 2026-10-08): lo ven el Jefe
 * y la Analista de Producción (permiso RESUMEN_VER). Solo los turnos CON
 * datos de la jornada (7:00 a 7:00, por turnos.fecha): sus actas, cajas por
 * sabor y presentación por turno, por línea (cajas, merma del día,
 * paradas), las paradas que más tiempo quitaron, las novedades y, para la
 * analista, las cajas por grupo y el mensaje de WhatsApp (src/lib/resumenDia.ts).
 * Datos: turnos_de_fecha_tipo (turno_json), resumen_produccion_dia_por_turno
 * (migración 20261108390000), listar_actas y las paradas de cada turno.
 */

const TIPOS = ["TURNO_1", "TURNO_2", "TURNO_3"] as const

/** Cajas que cargaron los supervisores de un turno: sabor + presentación + línea. */
export interface FilaPorTurno {
  turnoId: string
  saborNombre: string
  volumenMl: number
  lineaCodigo: string
  cajas: number
}

export interface TurnoDelDia {
  turno: TurnoActivo
  /** "T1", "T2", "T3"; si un tipo tiene dos turnos con datos (12x12, reinicio), lleva la hora: "T2 19:30". */
  etiqueta: string
  novedades: NovedadTurno[]
  /** Acta vigente (null: todavía no se generó, ej. turno abierto). */
  actaStoragePath: string | null
  cajas: number
}

export interface DatosResumenDiario {
  turnos: TurnoDelDia[]
  porTurno: FilaPorTurno[]
  paradas: Parada[]
}

/** Turnos de la jornada que tienen producción, en orden (T1, T2, T3), con su acta, novedades y paradas. */
export async function cargarResumenDiario(usuario: string, area: string, fecha: string): Promise<DatosResumenDiario | { error: string }> {
  const [porTurnoRes, actas, ...porTipo] = await Promise.all([
    supabase.rpc("resumen_produccion_dia_por_turno", { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha }),
    listarActas(usuario, { areaCodigo: area, fechaDesde: fecha, fechaHasta: fecha }),
    ...TIPOS.map((tipo) => supabase.rpc("turnos_de_fecha_tipo", { p_fecha: fecha, p_turno_tipo: tipo, p_area_codigo: area })),
  ])
  if (porTurnoRes.error) return { error: porTurnoRes.error.message || "No se pudo cargar el resumen diario." }
  const caidaTipo = porTipo.find((r) => r.error)
  if (caidaTipo?.error) return { error: caidaTipo.error.message || "No se pudieron cargar los turnos del día." }

  const porTurno: FilaPorTurno[] = (
    (porTurnoRes.data ?? []) as { turno_id: string; sabor_nombre: string | null; presentacion_volumen_ml: number; linea_codigo: string; cajas: number }[]
  ).map((f) => ({
    turnoId: f.turno_id,
    saborNombre: f.sabor_nombre ?? "Sin sabor",
    volumenMl: f.presentacion_volumen_ml,
    lineaCodigo: f.linea_codigo,
    cajas: Number(f.cajas),
  }))

  const filas = porTipo.flatMap((r) => (Array.isArray(r.data) ? (r.data as (FilaTurno & { novedades?: unknown[] })[]) : []))
  const conDatos = filas
    .map((fila) => ({ fila, cajas: porTurno.filter((p) => p.turnoId === fila.id).reduce((a, p) => a + p.cajas, 0) }))
    .filter((t) => t.cajas > 0)

  const vigentes = new Map(actas.filter((a) => a.estado === "VIGENTE").map((a) => [a.turnoId, a.storagePath]))
  const turnos = etiquetar(conDatos.map((t) => mapearTurno(t.fila))).map((x, i) => ({
    turno: x.turno,
    etiqueta: x.etiqueta,
    novedades: ((conDatos[i].fila.novedades ?? []) as Parameters<typeof mapearNovedadTurno>[0][]).map(mapearNovedadTurno),
    actaStoragePath: vigentes.get(x.turno.id) ?? null,
    cajas: conDatos[i].cajas,
  }))
  const paradas = (await Promise.all(turnos.map((t) => cargarParadasDelTurno(t.turno.id)))).flat()
  return { turnos, porTurno, paradas }
}

/** "T1", "T2"…; si un tipo se repite, cada uno lleva su hora de inicio. Respeta el orden recibido. */
export function etiquetar(turnos: TurnoActivo[]): { turno: TurnoActivo; etiqueta: string }[] {
  return turnos.map((turno) => {
    const base = turno.turnoTipo.replace("TURNO_", "T")
    const repetido = turnos.filter((t) => t.turnoTipo === turno.turnoTipo).length > 1
    return { turno, etiqueta: repetido ? `${base} ${turno.horaInicio.slice(0, 5)}` : base }
  })
}

const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

/** Una fila de "Cajas por sabor y presentación": cajas de cada turno (lo de los supervisores) y el número oficial del día. */
export interface FilaCajasDia {
  saborNombre: string
  volumenMl: number
  porTurno: number[]
  oficial: number
  supervisores: number
  corregida: boolean
}

/** Sigue el orden de itemsDelDia (por sabor, de 1000 a 200). */
export function cajasPorSaborYTurno(items: ItemDia[], porTurno: FilaPorTurno[], turnos: TurnoDelDia[]): FilaCajasDia[] {
  return items.map((i) => ({
    saborNombre: i.saborNombre,
    volumenMl: i.volumenMl,
    porTurno: turnos.map((t) =>
      porTurno
        .filter((p) => p.turnoId === t.turno.id && p.saborNombre === i.saborNombre && p.volumenMl === i.volumenMl)
        .reduce((a, p) => a + p.cajas, 0),
    ),
    oficial: i.cajasOficiales,
    supervisores: i.cajasSupervisor,
    corregida: i.estado === "EDITADO" && i.cajasOficiales !== i.cajasSupervisor,
  }))
}

export interface LineaDelDia {
  codigo: string
  nombre: string
  cajas: number
  /** Merma de envase del día: 1 − envases empacados ÷ contador de llenadora, con las corridas comparables de todos los turnos. */
  mermaPct: number | null
  paradasMin: number
}

export function lineasDelDia(
  lineas: { codigo: string; nombre: string }[],
  turnos: TurnoDelDia[],
  porTurno: FilaPorTurno[],
  paradas: Parada[],
  presentaciones: PresentacionLive[],
): LineaDelDia[] {
  return lineas.map((l) => {
    const n = numeroLinea(l.codigo)
    let llenadora = 0
    let empacados = 0
    for (const { turno } of turnos) {
      for (const corrida of turno.lineas.filter((c) => numeroLinea(c.linea) === n)) {
        const envasesLlenadora = turno.contadores.filter((c) => c.turnoLineaId === corrida.id).reduce((a, c) => a + c.envasesLlenadora, 0)
        const pts = turno.productoTerminado.filter((p) => p.turnoLineaId === corrida.id)
        // Solo corridas comparables (contador Y PT), como mermaEnvasesDeCorridas.
        if (envasesLlenadora === 0 || pts.length === 0) continue
        llenadora += envasesLlenadora
        for (const p of pts) {
          const pres = presentaciones.find((x) => x.codigo === p.presentacion)
          empacados += (p.paletas * (pres?.cajasXPaleta ?? 0) + p.cajasSueltas) * (pres?.envasesXCaja ?? 0)
        }
      }
    }
    return {
      codigo: l.codigo,
      nombre: l.nombre,
      cajas: porTurno.filter((p) => numeroLinea(p.lineaCodigo) === n).reduce((a, p) => a + p.cajas, 0),
      mermaPct: llenadora > 0 ? pctRendimiento(llenadora, empacados) : null,
      paradasMin: paradas.filter((p) => numeroLinea(p.lineaCodigo) === n).reduce((a, p) => a + duracionMin(p), 0),
    }
  })
}

export interface ParadaDelDia {
  nombre: string
  codigo: string | null
  lineaCodigo: string
  veces: number
  minutos: number
}

/** Las paradas que más minutos quitaron en el día, sumadas por tipo y línea. Las que no tienen minutos no entran. */
export function paradasQueMasQuitaron(paradas: Parada[], cuantas = 6): ParadaDelDia[] {
  const m = new Map<string, ParadaDelDia>()
  for (const p of paradas) {
    const minutos = duracionMin(p)
    if (minutos <= 0) continue
    const codigo = codigoDeParadaLive(p)
    const clave = `${p.tipoCodigo ?? p.tipoNombre}|${numeroLinea(p.lineaCodigo)}`
    const actual = m.get(clave) ?? { nombre: p.tipoNombre, codigo, lineaCodigo: p.lineaCodigo, veces: 0, minutos: 0 }
    actual.veces += 1
    actual.minutos += minutos
    m.set(clave, actual)
  }
  return [...m.values()].sort((a, b) => b.minutos - a.minutos).slice(0, cuantas)
}

export interface GrupoDelDia {
  grupo: GrupoCodigo
  nombre: string
  turnos: string[]
  supervisores: string[]
  cajas: number
}

/** Cajas por grupo: el grupo es el del turno. Ordenado por grupo. */
export function cajasPorGrupo(turnos: TurnoDelDia[]): GrupoDelDia[] {
  const m = new Map<GrupoCodigo, GrupoDelDia>()
  for (const t of turnos) {
    const g = m.get(t.turno.grupo) ?? { grupo: t.turno.grupo, nombre: nombreGrupo(t.turno.grupo), turnos: [], supervisores: [], cajas: 0 }
    g.turnos.push(t.etiqueta)
    if (!g.supervisores.includes(t.turno.supervisorNombre)) g.supervisores.push(t.turno.supervisorNombre)
    g.cajas += t.cajas
    m.set(t.turno.grupo, g)
  }
  return [...m.values()].sort((a, b) => a.grupo.localeCompare(b.grupo))
}
