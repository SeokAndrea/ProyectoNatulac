import { supabase } from "@/lib/supabase"
import { mapearTurno, mermaCorrida, type FilaTurno, type TurnoActivo } from "@/lib/turno"
import type { PresentacionLive } from "@/lib/catalogosLive"

/*
 * Panel de Producción: estado actual de la planta (o histórico por
 * fecha/tipo, ver supabase/migrations/20260906090000_panel_produccion.sql).
 * Reutiliza mapearTurno() de turno.tsx — es el mismo objeto
 * TurnoActivo que usa Comenzar/Finalizar Turno, solo que acá puede
 * ser de CUALQUIER supervisor, no del usuario logueado.
 */
export async function obtenerEstadoPlantaActual(areaCodigo: string | null): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("estado_planta_actual", { p_area_codigo: areaCodigo })
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}

/**
 * Producción HECHA en toda la jornada (los 3 turnos con esa
 * turnos.fecha en el área), por sabor + presentación. El banner del
 * Panel usa esto para las cifras "del día" en vez de las del turno en
 * vivo — que arrancan en 0 cada vez que un supervisor abre su turno.
 * Mismo criterio de nombre (sabor_display) que obtenerProgramacionDia(),
 * así el carrusel cruza plan vs. hecho por la misma clave.
 */
export interface ProduccionDiaItem {
  saborNombre: string
  presentacionMl: number | null
  cajas: number
  litros: number
}

export async function obtenerProduccionDia(areaCodigo: string, fecha: string): Promise<ProduccionDiaItem[]> {
  const { data, error } = await supabase.rpc("produccion_dia_de", { p_area_codigo: areaCodigo, p_fecha: fecha })
  if (error || !data) return []
  return (data as Array<{ sabor_nombre: string | null; presentacion_volumen_ml: number | null; cajas: number | string; litros: number | string }>).map(
    (r) => ({
      saborNombre: r.sabor_nombre ?? "—",
      presentacionMl: r.presentacion_volumen_ml ?? null,
      cajas: Number(r.cajas) || 0,
      litros: Number(r.litros) || 0,
    }),
  )
}

export interface AjusteSemielaborado {
  lote: string | null
  sabor: string
  volumenTeorico: number
  volumenReal: number
  /** real − teórico. Negativo = faltaron litros ("al aire"). */
  diferencia: number
  usuarioNombre: string | null
  creadoEn: string
}

/** Correcciones manuales de volumen de lote del turno (teórico vs. real). [] si la migración 20260988 no está aplicada. */
export async function ajustesSemielaboradoTurno(turnoId: string): Promise<AjusteSemielaborado[]> {
  const { data, error } = await supabase.rpc("ajustes_semielaborado_turno", { p_turno_id: turnoId })
  if (error || !data) return []
  return (
    data as Array<{
      lote: string | null
      sabor: string
      volumen_teorico: number | string
      volumen_real: number | string
      diferencia: number | string
      usuario_nombre: string | null
      creado_en: string
    }>
  ).map((r) => ({
    lote: r.lote,
    sabor: r.sabor,
    volumenTeorico: Number(r.volumen_teorico) || 0,
    volumenReal: Number(r.volumen_real) || 0,
    diferencia: Number(r.diferencia) || 0,
    usuarioNombre: r.usuario_nombre,
    creadoEn: r.creado_en,
  }))
}

/** Cargo (rótulo del puesto) de un usuario, para mostrarlo junto al nombre del supervisor. null si no tiene o si el RPC no existe todavía. */
export async function cargoDeUsuario(usuario: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("cargo_de_usuario", { p_usuario: usuario })
  if (error) return null
  return (data as string | null) ?? null
}

/**
 * Lecturas de Servicios Industriales (Temperatura del Quantum, Agua
 * Osmotizada) que se muestran arriba de la grilla de Tanques en el
 * Panel — meramente informativas, no alimentan ningún cálculo.
 */
export interface LecturaServiciosIndustriales {
  temperaturaQuantum: number | null
  aguaOsmotizada: number | null
  actualizadoEn: string
  actualizadoPorNombre: string | null
}

export async function obtenerLecturaServiciosIndustriales(): Promise<LecturaServiciosIndustriales | null> {
  const { data, error } = await supabase.rpc("lectura_servicios_industriales_actual")
  if (error || !data) return null
  const r = data as {
    temperatura_quantum: number | string | null
    agua_osmotizada: number | string | null
    actualizado_en: string
    actualizado_por_nombre: string | null
  }
  return {
    temperaturaQuantum: r.temperatura_quantum === null ? null : Number(r.temperatura_quantum),
    aguaOsmotizada: r.agua_osmotizada === null ? null : Number(r.agua_osmotizada),
    actualizadoEn: r.actualizado_en,
    actualizadoPorNombre: r.actualizado_por_nombre,
  }
}

export async function registrarLecturaServiciosIndustriales(
  usuario: string,
  temperaturaQuantum: number | null,
  aguaOsmotizada: number | null,
): Promise<{ ok: true; lectura: LecturaServiciosIndustriales } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("registrar_lectura_servicios_industriales", {
    p_usuario: usuario,
    p_temperatura_quantum: temperaturaQuantum,
    p_agua_osmotizada: aguaOsmotizada,
  })
  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo guardar. Intenta de nuevo." }
  }
  const r = data as {
    temperatura_quantum: number | string | null
    agua_osmotizada: number | string | null
    actualizado_en: string
    actualizado_por_nombre: string | null
  }
  return {
    ok: true,
    lectura: {
      temperaturaQuantum: r.temperatura_quantum === null ? null : Number(r.temperatura_quantum),
      aguaOsmotizada: r.agua_osmotizada === null ? null : Number(r.agua_osmotizada),
      actualizadoEn: r.actualizado_en,
      actualizadoPorNombre: r.actualizado_por_nombre,
    },
  }
}

export async function obtenerTurnoDeFechaTipo(fecha: string, turnoTipo: string, areaCodigo: string | null): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("turno_de_fecha_tipo", {
    p_fecha: fecha,
    p_turno_tipo: turnoTipo,
    p_area_codigo: areaCodigo,
  })
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}

/*
 * Meta: cajas que DEBERÍAN haber salido de cada línea activa, según
 * la velocidad elegida en Comenzar Turno y las horas transcurridas
 * del turno — no un número fijo cargado a mano. Si en 3h debían salir
 * 3000 cajas y salieron 2000, no se cumplió — ahí es donde después se
 * van a poder cargar las paradas que lo explican (todavía sin
 * construir). Por ahora el cálculo no necesita paradas, solo mide el
 * resultado.
 */
export interface MetaLinea {
  linea: string
  cajasEsperadas: number
  cajasReales: number
}

export function calcularMeta(
  turno: TurnoActivo,
  presentaciones: PresentacionLive[],
): { porLinea: MetaLinea[]; totalEsperadas: number; totalReales: number; pctCumplimiento: number | null } {
  const horas = horasTranscurridasTurno(turno)

  // Solo las corridas ACTIVAS ahora mismo — turno.lineas trae también
  // las que ya se finalizaron durante este turno (historial), esas no
  // cuentan para la meta en curso.
  const porLinea: MetaLinea[] = turno.lineas
    .filter((l) => l.activa)
    .map((l) => {
      const pres = presentaciones.find((p) => p.codigo === l.presentacion)
      const cajasHora = pres && pres.envasesXCaja > 0 ? l.envasesHora / pres.envasesXCaja : 0
      const cajasEsperadas = Math.round(cajasHora * horas)

      const envasesLlenadora = turno.contadores
        .filter((c) => c.turnoLineaId === l.id && !c.parcial)
        .reduce((a, c) => a + c.envasesLlenadora, 0)
      const cajasReales = pres && pres.envasesXCaja > 0 ? Math.round(envasesLlenadora / pres.envasesXCaja) : 0

      return { linea: l.linea, cajasEsperadas, cajasReales }
    })

  const totalEsperadas = porLinea.reduce((a, m) => a + m.cajasEsperadas, 0)
  const totalReales = porLinea.reduce((a, m) => a + m.cajasReales, 0)
  const pctCumplimiento = totalEsperadas === 0 ? null : Math.round((totalReales / totalEsperadas) * 1000) / 10

  return { porLinea, totalEsperadas, totalReales, pctCumplimiento }
}

/** Horas transcurridas desde el inicio del turno (hasta ahora si sigue abierto, o hasta el cierre si ya cerró). */
export function horasTranscurridasTurno(turno: TurnoActivo): number {
  const [h1, m1] = turno.horaInicio.split(":").map(Number)
  // Turno cerrado: se mide hasta su hora de cierre (dato fijo), no
  // hasta "ahora". Así la meta de un turno viejo deja de moverse en
  // cada refresco del Panel y se puede reproducir/verificar contra un
  // valor cargado a mano (ver src/lib/calculosPruebas.ts y su CSV).
  const finReloj =
    turno.estado === "CERRADO" && turno.horaFin
      ? turno.horaFin
      : (() => {
          const ahora = new Date()
          return `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}:${String(ahora.getSeconds()).padStart(2, "0")}`
        })()
  const [h2, m2] = finReloj.split(":").map(Number)
  let minutos = h2 * 60 + m2 - (h1 * 60 + m1)
  if (minutos < 0) minutos += 24 * 60
  return Math.max(minutos / 60, 0.1)
}

export interface MermaEnvasesTurno {
  pct: number | null
}

/**
 * Merma de ENVASES sumando SOLO las corridas que ya tienen los dos
 * lados cargados (contador Y Producto Terminado), reusando
 * mermaCorrida() de turno.tsx. Una corrida con contador pero sin PT
 * todavía NO cuenta como "100% de merma": queda afuera hasta que se
 * cargue el PT. Si ninguna corrida es comparable todavía → null ("—").
 *
 * Antes se sumaban TODOS los contadores del turno contra el PT que
 * hubiera cargado en ese momento, con la única guarda de que el total
 * de contadores no fuera 0. Mientras faltaba PT, el número saltaba a
 * ~100% y volvía a ~1.5% solo cuando estaba todo cargado.
 */
function mermaEnvasesDeCorridas(
  turnoLineaIds: Iterable<string>,
  turno: Pick<TurnoActivo, "contadores" | "productoTerminado">,
  presentaciones: PresentacionLive[],
): { pct: number | null } {
  let llenadora = 0
  let reales = 0
  let algunaComparable = false

  for (const id of new Set(turnoLineaIds)) {
    const m = mermaCorrida(id, turno, presentaciones)
    if (!m) continue
    algunaComparable = true
    llenadora += m.envasesLlenadora
    reales += m.envasesProductoTerminado
  }

  const pct = !algunaComparable || llenadora === 0 ? null : Math.round((1 - reales / llenadora) * 10000) / 100
  return { pct }
}

/**
 * Merma de ENVASES de todo el turno (todas las corridas juntas):
 * envases de Producto Terminado contra los que sumaron los
 * contadores. Ya no existe una "merma teórica" aparte (dependía de
 * envases_desechados, columna que se sacó de Contadores) — queda una
 * sola merma, la misma que se calcula por corrida en mermaCorrida()
 * de turno.tsx.
 */
export function mermaEnvasesTurno(turno: TurnoActivo, presentaciones: PresentacionLive[]): MermaEnvasesTurno {
  const corridaIds = turno.contadores.map((c) => c.turnoLineaId).filter((id): id is string => id !== null)
  return mermaEnvasesDeCorridas(corridaIds, turno, presentaciones)
}

/**
 * Merma de ENVASES de una línea puntual, agregando TODAS sus corridas
 * del turno que ya sean comparables (contador + PT), mismo criterio
 * que mermaEnvasesTurno() pero acotado a esa línea. Si la línea ya
 * cerró un lote y arrancó uno nuevo en el mismo turno (ej. preparó
 * encima de un tanque en Standby), la corrida nueva todavía sin PT no
 * arrastra la merma a ~100%: simplemente no suma hasta tener sus dos
 * lados, y la línea muestra la merma real que ya lleva acumulada.
 */
export function mermaLineaTurno(turno: TurnoActivo, lineaCodigo: string, presentaciones: PresentacionLive[]): { pct: number | null } {
  const corridaIds = turno.lineas.filter((l) => l.linea === lineaCodigo).map((l) => l.id)
  return mermaEnvasesDeCorridas(corridaIds, turno, presentaciones)
}

export interface MermaSemielaboradoTurno {
  pct: number | null
  /** Denominador: Σ (inicio − fin) SOLO de los lotes con tramo de consumo confiable. */
  consumo: number
  /** Numerador: Σ litros de PT SOLO de los lotes que entraron al denominador (mismo conjunto). */
  litrosProducidos: number
  /** Alias de `consumo` — se mantiene por compatibilidad con el desglose. */
  litrosConsumidos: number
  /** true si algún lote que el turno tocó sigue abierto. Informativo: la merma se muestra igual (mide el tramo de este turno, no espera a que el lote se drene). */
  hayLoteAbierto: boolean
  /** Litros de PT que quedaron fuera del %: lotes sin `inicio`, con `fin ≥ inicio`, con PT que excede el volumen preparado, o sin lote asociado. */
  litrosSinContraste: number
  /** true si hubo producción que no se pudo contrastar contra un tramo de consumo confiable — el % mostrado es PARCIAL. */
  hayLoteSinContraste: boolean
}

/**
 * Merma de SEMIELABORADO — modelo REPARTIDO POR TURNO
 * (ver plan-debug-merma-semielaborado.md §23, §33, §41; decisión de la jefa: opción b).
 *
 *   consumo(turno)  = Σ_lotes  (volumen al INICIO del turno − volumen al FINAL del turno)
 *   merma(turno)    = consumo(turno) − PT(turno)
 *   merma %         = merma(turno) ÷ consumo(turno)
 *
 * Cada turno se lleva SOLO el tramo que consumió, no el lote entero.
 * Así:
 *  - un lote heredado ya no le carga su volumen inicial completo al
 *    turno que lo produjo a medias (antes: merma inflada / "—"),
 *  - una relectura de volumen del tanque deja de "borrar" la merma
 *    (antes: volumen_inicial_l se pisaba con PT + real; ahora es
 *    inmutable — ver migración 20260989),
 *  - las transferencias internas se cancelan solas al sumar por turno.
 *
 * Datos (los pone turno_json, migración 20260992):
 *  - `volumenLInicio`: volumen_l del lote cuando este turno empezó a
 *    tocarlo. Si el lote nació en este turno → su volumen inicial
 *    preparado. Si es heredado → el volumen_l congelado al cierre del
 *    último turno anterior que lo tenía.
 *  - `volumenL`: volumen_l al final. Para un turno CERRADO viene
 *    congelado (turnos.volumenes_lote_cierre); para el turno en vivo
 *    es el valor actual.
 *
 * Nota: si en un turno nadie llegó a medir el tanque, `volumenL` sigue
 * siendo un derivado del PT y el consumo de ese tramo da ≈ PT (merma
 * ≈ 0). No se pierde: la pérdida aparece en el turno que sí mide, o
 * cuando el lote se cierra drenado.
 *
 * Guardrail (plan-rework-auditoria.md §7, caso turno de Javier): el
 * numerador y el denominador tienen que cubrir LOS MISMOS lotes. Un
 * lote cuyo tramo de consumo no es confiable —`inicio` null, `fin ≥
 * inicio` (transferencia entrante / re-medición al alza / heredado sin
 * congelar), o PT que excede el volumen preparado— queda fuera de los
 * dos lados y sus litros van a `litrosSinContraste`. Así el % nunca
 * sale negativo por la asimetría; cuando algo quedó afuera, `pct` es
 * PARCIAL (`hayLoteSinContraste`).
 *
 * El PT de un lote no puede superar el volumen que ese lote tuvo
 * (`volumen_inicial_l`, que ya incluye los ajustes de jugo/agua hechos
 * con "Ajustar" — ver ajustar_preparacion). MARGEN_REDONDEO cubre el
 * ruido de litros_x_caja y paletas parciales; si el PT lo supera, o es
 * un duplicado, o se agregó jugo sin registrarlo con "Ajustar".
 *
 * ...o se rellenó el tanque a mitad de corrida (transferir_tanque
 * hasta 30.000 L, ver 20261008090000) — un relleno legítimo se ve
 * IGUAL que un duplicado desde acá (el PT supera lo que ese lote tenía
 * preparado originalmente). Para no perder esa producción real, un PT
 * que excede vi se sigue contando si el Contador 2 (envases buenos —
 * ver ContadorRegistro.envasesBuenos, lectura de la llenadora,
 * independiente de la medición del tanque) coincide con ese PT dentro
 * de TOLERANCIA_ENVASES_BUENOS: es evidencia de que el PT es real, no
 * inventado. Sin Contador 2 cargado para esa corrida, el
 * comportamiento es idéntico al de antes (se descarta).
 */
const MARGEN_REDONDEO = 1.05
const TOLERANCIA_ENVASES_BUENOS = 0.05

/**
 * Litros "buenos" (Contador 2) de todas las corridas de ESTE turno que
 * alimentaron `loteId`, convertidos por la presentación de cada
 * corrida. null si ninguna trajo esa lectura (nada que corroborar).
 */
function litrosBuenosDeLote(
  loteId: string,
  turno: Pick<TurnoActivo, "lineas" | "contadores">,
  presentaciones: PresentacionLive[],
): number | null {
  let litros = 0
  let algunaLectura = false
  for (const corrida of turno.lineas) {
    if (corrida.loteId !== loteId) continue
    const pres = presentaciones.find((p) => p.codigo === corrida.presentacion)
    if (!pres) continue
    for (const c of turno.contadores) {
      if (c.turnoLineaId !== corrida.id || c.parcial || c.envasesBuenos === null) continue
      litros += (c.envasesBuenos * pres.volumenMl) / 1000
      algunaLectura = true
    }
  }
  return algunaLectura ? litros : null
}

export function mermaSemielaboradoTurno(turno: TurnoActivo, presentaciones: PresentacionLive[]): MermaSemielaboradoTurno {
  // Lotes que este turno tocó: los que alimentaron una corrida, más
  // los que nacieron en el turno (preparados aunque todavía sin correr).
  const loteIds = new Set<string>()
  for (const l of turno.lineas) if (l.loteId !== null) loteIds.add(l.loteId)
  for (const p of turno.preparaciones) if (p.turnoId === turno.id) loteIds.add(p.id)

  // Litros de PT atribuidos a cada lote (PT → turno_linea → lote_id).
  // Lo que no se puede atribuir (corrida sin lote_id) queda sin contraste.
  const ptPorLote = new Map<string, number>()
  let ptSinLote = 0
  for (const pt of turno.productoTerminado) {
    const corrida = pt.turnoLineaId ? turno.lineas.find((l) => l.id === pt.turnoLineaId) : null
    const loteId = corrida?.loteId ?? null
    if (loteId === null) {
      ptSinLote += pt.litrosProducidos
      continue
    }
    ptPorLote.set(loteId, (ptPorLote.get(loteId) ?? 0) + pt.litrosProducidos)
    loteIds.add(loteId)
  }

  let consumo = 0
  let producido = 0
  let litrosSinContraste = ptSinLote
  let hayLoteAbierto = false

  for (const loteId of loteIds) {
    const lote = turno.preparaciones.find((p) => p.id === loteId)
    const ptLote = ptPorLote.get(loteId) ?? 0
    if (!lote) {
      litrosSinContraste += ptLote
      continue
    }
    if (lote.cerradoEn === null) hayLoteAbierto = true

    const inicio = lote.volumenLInicio ?? lote.volumenInicialL
    const fin = lote.volumenL ?? 0
    const vi = lote.volumenInicialL // volumen preparado, para el chequeo físico
    const tramo = inicio === null ? null : inicio - fin
    const ptExcedeVi = vi !== null && vi > 0 && ptLote > vi * MARGEN_REDONDEO

    let ptExcedeViCorroborado = false
    if (ptExcedeVi) {
      const litrosBuenos = litrosBuenosDeLote(loteId, turno, presentaciones)
      ptExcedeViCorroborado = litrosBuenos !== null && Math.abs(litrosBuenos - ptLote) <= ptLote * TOLERANCIA_ENVASES_BUENOS
    }

    if (tramo === null || tramo <= 0 || (ptExcedeVi && !ptExcedeViCorroborado)) {
      litrosSinContraste += ptLote
      continue
    }
    consumo += tramo
    producido += ptLote
  }

  const pct = consumo <= 0 ? null : Math.round((1 - producido / consumo) * 10000) / 100

  return {
    pct,
    consumo,
    litrosProducidos: producido,
    litrosConsumidos: consumo,
    hayLoteAbierto,
    litrosSinContraste: Math.round(litrosSinContraste),
    hayLoteSinContraste: litrosSinContraste > 0,
  }
}

/**
 * El último turno CERRADO de esta área (sin contar el turno en vivo
 * actual), mapeado igual que el turno en vivo — para mostrarlo como
 * referencia ("cómo terminó el turno pasado") al lado del turno en
 * curso.
 *
 * El Panel corre sobre este objeto las MISMAS funciones
 * (mermaEnvasesTurno/mermaSemielaboradoTurno) que usa para el turno
 * actual, y las corre EN EL RENDER, con el catálogo de presentaciones
 * ya cargado — así "turno pasado" y "turno actual" son literalmente el
 * mismo cálculo en el mismo momento y no pueden divergir.
 *
 * Antes esta función devolvía la merma YA calculada (una sola vez, al
 * cargar). Si `presentaciones` todavía no había resuelto en ese
 * instante, mermaEnvasesTurno() no encontraba la presentación, caía a
 * envasesXCaja = 0 y "turno pasado" mostraba 100% de merma de envase
 * hasta el próximo refresco (o para siempre en vista histórica). Y más
 * atrás todavía se calculaba a mano desde estadisticas_produccion()
 * (contador × volumenMl), una fórmula DISTINTA a la del turno actual
 * que podía pasarse de 100% de Rendimiento sin sentido físico.
 */
export async function obtenerTurnoAnterior(
  areaCodigo: string,
  turnoActualId: string | null,
): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("turno_anterior_json", {
    p_area_codigo: areaCodigo,
    p_turno_actual_id: turnoActualId,
  })
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}
