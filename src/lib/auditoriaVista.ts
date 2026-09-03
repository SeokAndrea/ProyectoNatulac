import { nombrePorCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import { construirHistorial, type EventoHistorial } from "@/lib/historial"
import { mermaSemielaboradoTurno } from "@/lib/panelProduccion"
import { fechaLocal, mermaCorrida, type ProductoTerminadoRegistro, type TurnoActivo } from "@/lib/turno"

/*
 * Helpers de la vista de Auditoría reworkeada (ver
 * plan-rework-auditoria.md): el resumen de un turno para los chips y
 * el filtro de texto libre.
 *
 *   Sabores: Fresa (lotes 0903-A1, 0903-A2), Durazno (lote 0903-A6)
 *   por línea: Línea · presentación · sabor · lote · cajas · merma de envases
 *   Cajas (total) · Litros consumidos → producidos · merma de semielaborado
 */
export interface SaborConLotes {
  sabor: string
  lotes: string[]
}

export interface LineaResumen {
  linea: string
  /** Nombre de la presentación, ej. "350 ml". */
  presentacion: string
  sabor: string | null
  lote: string | null
  /** Cajas de Producto Terminado de esa línea+lote+presentación (corridas duplicadas idénticas contadas una sola vez). */
  cajas: number
  /** Envases de la llenadora (contador definitivo, sin las lecturas parciales) de esa línea+lote+presentación. */
  contador: number
  /** Merma de envases (PT vs. contador de la llenadora). null hasta tener los dos datos. */
  mermaEnvasesPct: number | null
  /** true si dos o más corridas de esta línea+lote+presentación cargaron paletas y cajas idénticas — posible re-tipeo. */
  posibleDuplicado: boolean
}

export interface ResumenTurno {
  /** Sabores del turno, cada uno con los lotes que se le prepararon / corrieron. */
  sabores: SaborConLotes[]
  /** Todos los lotes del turno, planos — para el buscador. */
  lotes: string[]
  /** Una fila por línea+lote+presentación con producción. */
  porLinea: LineaResumen[]
  /** "Línea X · Lote Y" que se activaron pero no registraron producción (corridas stub / superadas). */
  corridasSinProduccion: string[]
  /** Total de cajas del turno. */
  cajas: number
  /** Litros de semielaborado que el turno sacó de los tanques (solo lotes con tramo de consumo confiable). */
  litrosConsumidos: number
  /** Litros que quedaron como Producto Terminado (solo los lotes que entraron al consumo). */
  litrosProducidos: number
  /** Merma de semielaborado del turno: 1 − producidos ÷ consumidos. null si no hubo consumo medible. */
  mermaSemielaboradoPct: number | null
  /** Litros de PT que no se pudieron contrastar → el % de arriba es PARCIAL. */
  litrosSinContraste: number
  /** true si `mermaSemielaboradoPct` es parcial (hubo producción sin tramo de consumo confiable). */
  mermaSemielaboradoParcial: boolean
}

/**
 * El lote de una fila de Producto Terminado no vive en la fila: sale
 * de la corrida que la generó (turnoLineaId → LineaEnTurno.lote).
 * Devuelve null si la corrida no está en este turno (nació en uno
 * anterior) o si nunca tuvo lote.
 */
export function loteDeProductoTerminado(turno: TurnoActivo, pt: ProductoTerminadoRegistro): string | null {
  if (!pt.turnoLineaId) return null
  return turno.lineas.find((l) => l.id === pt.turnoLineaId)?.lote ?? null
}

function unicos(valores: (string | null | undefined)[]): string[] {
  return [...new Set(valores.filter((v): v is string => !!v && v.trim() !== ""))]
}

export function resumenTurno(
  turno: TurnoActivo,
  lineas: LineaLive[],
  presentaciones: PresentacionLive[],
): ResumenTurno {
  const pres = (codigo: string) => presentaciones.find((pr) => pr.codigo === codigo)

  // Agrupar las corridas por línea + lote + presentación. Así una línea
  // que retomó el mismo lote no se ve como filas sueltas, y las
  // corridas stub (activadas sin producir) se absorben. Dentro de un
  // grupo, dos corridas con paletas y cajas idénticas se cuentan una
  // sola vez (posible re-tipeo — ver plan-rework-auditoria.md §7.4).
  const grupos = new Map<string, typeof turno.lineas>()
  for (const l of turno.lineas) {
    const k = `${l.linea}|${l.lote ?? ""}|${l.presentacion}`
    const g = grupos.get(k)
    if (g) g.push(l)
    else grupos.set(k, [l])
  }

  const porLinea: LineaResumen[] = []
  const corridasSinProduccion: string[] = []
  for (const corridas of grupos.values()) {
    const primera = corridas[0]
    const firmasVistas = new Set<string>()
    let posibleDuplicado = false
    let cajas = 0
    let contador = 0
    let llenadora = 0
    let envasesPt = 0

    for (const c of corridas) {
      const pt = turno.productoTerminado.find((p) => p.turnoLineaId === c.id)
      if (!pt) continue
      const info = pres(pt.presentacion)
      const cajasCorrida = pt.paletas * (info?.cajasXPaleta ?? 0) + pt.cajasSueltas
      if (cajasCorrida === 0) continue
      const firma = `${pt.paletas}|${pt.cajasSueltas}`
      if (firmasVistas.has(firma)) {
        posibleDuplicado = true
        continue // no sumar el duplicado idéntico
      }
      firmasVistas.add(firma)
      cajas += cajasCorrida
      contador += turno.contadores
        .filter((x) => x.turnoLineaId === c.id && !x.parcial)
        .reduce((a, x) => a + x.envasesLlenadora, 0)
      const m = mermaCorrida(c.id, turno, presentaciones)
      if (m) {
        llenadora += m.envasesLlenadora
        envasesPt += m.envasesProductoTerminado
      }
    }

    const etiqueta = `${nombrePorCodigo(lineas, primera.linea)}${primera.lote ? ` · Lote ${primera.lote}` : ""}`
    if (cajas === 0) {
      corridasSinProduccion.push(etiqueta)
      continue
    }
    porLinea.push({
      linea: nombrePorCodigo(lineas, primera.linea),
      presentacion: pres(primera.presentacion)?.nombre ?? `${primera.presentacion} ml`,
      sabor: primera.saborNombre,
      lote: primera.lote,
      cajas,
      contador,
      mermaEnvasesPct: llenadora > 0 ? Math.round((1 - envasesPt / llenadora) * 10000) / 100 : null,
      posibleDuplicado,
    })
  }
  const cajas = porLinea.reduce((t, l) => t + l.cajas, 0)

  const semi = mermaSemielaboradoTurno(turno)

  // Sabor → sus lotes. Se arma de las preparaciones (sabor + lote juntos)
  // y de las corridas; un sabor sin lote conocido queda igual, sin lista.
  const lotesPorSabor = new Map<string, Set<string>>()
  const registra = (sabor: string | null | undefined, lote: string | null | undefined) => {
    if (!sabor) return
    if (!lotesPorSabor.has(sabor)) lotesPorSabor.set(sabor, new Set())
    if (lote) lotesPorSabor.get(sabor)!.add(lote)
  }
  for (const p of turno.preparaciones) registra(p.saborNombre, p.lote)
  for (const l of turno.lineas) registra(l.saborNombre, l.lote)
  for (const p of turno.productoTerminado) registra(p.saborNombre, loteDeProductoTerminado(turno, p))
  for (const t of turno.tanques) registra(t.saborNombre, t.lote)
  const sabores: SaborConLotes[] = [...lotesPorSabor.entries()].map(([sabor, lotes]) => ({
    sabor,
    lotes: [...lotes],
  }))

  return {
    sabores,
    lotes: unicos([
      ...turno.preparaciones.map((p) => p.lote),
      ...turno.lineas.map((l) => l.lote),
      ...turno.productoTerminado.map((p) => loteDeProductoTerminado(turno, p)),
    ]),
    porLinea,
    corridasSinProduccion,
    cajas,
    litrosConsumidos: Math.round(semi.litrosConsumidos),
    litrosProducidos: Math.round(semi.litrosProducidos),
    mermaSemielaboradoPct: semi.pct,
    litrosSinContraste: semi.litrosSinContraste,
    mermaSemielaboradoParcial: semi.hayLoteSinContraste,
  }
}

/**
 * ¿El turno coincide con el texto libre del buscador? Matchea contra
 * supervisor, área/código, sabores, lotes y el texto (sección +
 * detalle) de cualquier evento de su línea de tiempo — así lo que se
 * ve en la fila de Producto Terminado (lote + sabor) también es
 * buscable. Vacío = todos.
 */
export function coincideBusqueda(
  turno: TurnoActivo,
  resumen: ResumenTurno,
  eventos: EventoHistorial[],
  areaNombre: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const heno = [
    turno.supervisorNombre,
    turno.supervisorUsuario,
    turno.codigo,
    areaNombre,
    ...resumen.sabores.map((s) => s.sabor),
    ...resumen.lotes,
    ...resumen.porLinea.flatMap((l) => [l.linea, l.presentacion]),
    ...eventos.map((e) => `${e.seccion} ${e.detalle}`),
  ]
    .join("  ")
    .toLowerCase()
  return heno.includes(q)
}

// ------------------------------------------------------------
// Filtro por fecha
// ------------------------------------------------------------
/*
 * "Día de producción" = turno.fecha. Los tres turnos de una jornada
 * (T1 7:00, T2 15:00, T3 22:30) comparten esa fecha, y un T3 que
 * cruza medianoche la conserva — así el corte de las 7:00 ya queda
 * hecho sin tener que mirar la hora. Por eso los presets se resuelven
 * a un rango de turno.fecha y nada más.
 */
export type PresetFecha = "HOY" | "AYER" | "DIAS_7" | "FECHA"

export interface RangoFecha {
  desde: string
  hasta: string
}

export function rangoDePreset(preset: PresetFecha, fechaEspecifica: string, hoy = new Date()): RangoFecha {
  const menosDias = (n: number) => {
    const d = new Date(hoy)
    d.setDate(d.getDate() - n)
    return fechaLocal(d)
  }
  switch (preset) {
    case "HOY":
      return { desde: fechaLocal(hoy), hasta: fechaLocal(hoy) }
    case "AYER":
      return { desde: menosDias(1), hasta: menosDias(1) }
    case "DIAS_7":
      return { desde: menosDias(6), hasta: fechaLocal(hoy) }
    case "FECHA":
      return { desde: fechaEspecifica, hasta: fechaEspecifica }
  }
}

/** ¿El turno cae en el rango [desde, hasta] (comparación de fechas ISO como texto) y, si se pidió, es de ese tipo de turno? */
export function turnoEnFiltro(
  fecha: string,
  turnoTipo: string,
  rango: RangoFecha,
  turnoTipoFiltro: string | null,
): boolean {
  if (rango.desde && fecha < rango.desde) return false
  if (rango.hasta && fecha > rango.hasta) return false
  if (turnoTipoFiltro && turnoTipo !== turnoTipoFiltro) return false
  return true
}

export { construirHistorial }
