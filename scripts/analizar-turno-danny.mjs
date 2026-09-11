/*
 * SOLO LECTURA. Busca el/los turnos de "Danny" del 2026-09-10 en ASEPTICO
 * (listar_turnos_historial + turno_detalle, las mismas RPC que usa
 * Auditoría) y reproduce el cálculo ACTUAL de merma de semielaborado
 * (calcularConsumoYProducido de src/lib/reportes/realidadPreparacion.ts +
 * mermaSemielaboradoTurno de src/lib/reportes/index.ts), lote por lote,
 * para ver de dónde sale el 48%.
 *
 *   node analizar-turno-danny.mjs <usuario_superadmin>
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const ROOT = "C:/Users/JefeAseptico/Documents/natulac-aseptico"
const env = {}
for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const USUARIO = process.argv[2]
if (!USUARIO) {
  console.error("Uso: node analizar-turno-danny.mjs <usuario_superadmin>")
  process.exit(1)
}

const n = (x) => (x === null || x === undefined ? 0 : Number(x))
const r2 = (x) => Math.round(x * 100) / 100

const MARGEN_REDONDEO = 1.05
const TOLERANCIA_ENVASES_BUENOS = 0.05

function pctRendimiento(esperado, real) {
  if (esperado <= 0) return null
  return Math.round((1 - real / esperado) * 10000) / 100
}

function litrosBuenosDeLote(loteId, corridas, contadores, presMap) {
  let litros = 0
  let algunaLectura = false
  for (const c of corridas) {
    if (c.lote_id !== loteId) continue
    const pres = presMap.get(Number(c.presentacion_volumen_ml))
    if (!pres) continue
    for (const ct of contadores) {
      if (ct.turno_linea_id !== c.id || ct.parcial || ct.envases_buenos === null) continue
      litros += (n(ct.envases_buenos) * pres.volumenMl) / 1000
      algunaLectura = true
    }
  }
  return algunaLectura ? litros : null
}

async function main() {
  const { data: turnos, error: e1 } = await supabase.rpc("listar_turnos_historial", {
    p_usuario: USUARIO,
    p_supervisor_usuario: null,
    p_fecha_desde: "2026-09-09",
    p_fecha_hasta: "2026-09-11",
  })
  if (e1) return console.error("listar_turnos_historial:", e1.message)

  const candidatos = (turnos ?? []).filter((t) => t.area_codigo === "ASEPTICO")
  console.log(`Turnos ASEPTICO entre 09-09 y 09-11:`)
  for (const t of candidatos) {
    console.log(`  ${t.fecha} ${t.turno_tipo_codigo} ${t.codigo} — ${t.supervisor_nombre} (${t.supervisor_usuario}) [${t.estado}] id=${t.turno_id}`)
  }

  const deDanny = candidatos.filter(
    (t) => t.fecha === "2026-09-10" && /danny|dany/i.test(t.supervisor_nombre + " " + t.supervisor_usuario),
  )
  if (deDanny.length === 0) {
    console.log("\nNo se encontró turno de Danny el 2026-09-10 en ASEPTICO con ese filtro. Revisa el listado de arriba.")
    return
  }

  const { data: presRaw } = await supabase.rpc("listar_presentaciones")
  const presMap = new Map(
    (presRaw ?? []).map((p) => [
      Number(p.volumen_ml),
      { volumenMl: Number(p.volumen_ml), envasesXCaja: n(p.envases_x_caja), cajasXPaleta: n(p.cajas_x_paleta) },
    ]),
  )

  for (const resumen of deDanny) {
    console.log(`\n${"=".repeat(70)}\nTURNO ${resumen.codigo} — ${resumen.fecha} ${resumen.turno_tipo_codigo} — ${resumen.supervisor_nombre}\n${"=".repeat(70)}`)

    const { data: t, error: e2 } = await supabase.rpc("turno_detalle", { p_usuario: USUARIO, p_turno_id: resumen.turno_id })
    if (e2) {
      console.error("  turno_detalle:", e2.message)
      continue
    }

    const preps = t.preparaciones ?? []
    const corridas = t.lineas ?? []
    const pts = t.producto_terminado ?? []
    const contadores = t.contadores ?? []

    console.log("\n-- PREPARACIONES (lotes) --")
    for (const p of preps) {
      console.log(" ", p.lote, {
        id: p.id.slice(0, 8),
        tanque: p.numero_tanque,
        sabor: p.sabor_nombre,
        turno_propio: p.turno_id === t.id,
        volumen_l_inicio: p.volumen_l_inicio,
        volumen_inicial_l: p.volumen_inicial_l,
        volumen_l_ahora: p.volumen_l,
        liberado: !!p.liberado_en,
        cerrado: !!p.cerrado_en,
      })
    }

    console.log("\n-- CORRIDAS --")
    for (const c of corridas) {
      console.log(" ", c.linea_codigo, {
        id: c.id.slice(0, 8),
        pres_ml: c.presentacion_volumen_ml,
        lote: c.lote,
        lote_id: c.lote_id ? c.lote_id.slice(0, 8) : null,
        activa: c.activa,
        finalizada: !!c.finalizada_en,
      })
    }

    console.log("\n-- PRODUCTO TERMINADO --")
    for (const p of pts) {
      console.log("  corrida", (p.turno_linea_id || "—").slice(0, 8), {
        pres_ml: p.presentacion_volumen_ml,
        paletas: n(p.paletas),
        cajas_sueltas: n(p.cajas_sueltas),
        litros_producidos: n(p.litros_producidos),
        retenido: p.producto_retenido,
      })
    }

    // ---- calcularConsumoYProducido, tal cual src/lib/reportes/realidadPreparacion.ts ----
    const loteIds = new Set()
    for (const c of corridas) if (c.lote_id !== null) loteIds.add(c.lote_id)
    for (const p of preps) if (p.turno_id === t.id) loteIds.add(p.id)

    const ptPorLote = new Map()
    let ptSinLote = 0
    for (const pt of pts) {
      const corrida = pt.turno_linea_id ? corridas.find((c) => c.id === pt.turno_linea_id) : null
      const loteId = corrida?.lote_id ?? null
      if (loteId === null) {
        ptSinLote += n(pt.litros_producidos)
        continue
      }
      ptPorLote.set(loteId, (ptPorLote.get(loteId) ?? 0) + n(pt.litros_producidos))
      loteIds.add(loteId)
    }

    let consumo = 0
    let producido = 0
    let litrosSinContraste = ptSinLote
    let hayLoteAbierto = false

    console.log("\n-- CÁLCULO DE MERMA SEMIELABORADO (lote por lote) --")
    for (const loteId of loteIds) {
      const lote = preps.find((p) => p.id === loteId)
      const ptLote = ptPorLote.get(loteId) ?? 0
      if (!lote) {
        litrosSinContraste += ptLote
        console.log(`  lote ${loteId.slice(0, 8)} → SIN FILA DE PREPARACIÓN → PT ${r2(ptLote)} sin contraste`)
        continue
      }
      if (lote.cerrado_en === null) hayLoteAbierto = true

      const inicio = lote.volumen_l_inicio ?? lote.volumen_inicial_l
      const fin = n(lote.volumen_l)
      const vi = lote.volumen_inicial_l
      const tramo = inicio === null || inicio === undefined ? null : n(inicio) - fin
      const ptExcedeVi = vi != null && n(vi) > 0 && ptLote > n(vi) * MARGEN_REDONDEO

      let ptExcedeViCorroborado = false
      let litrosBuenos = null
      if (ptExcedeVi) {
        litrosBuenos = litrosBuenosDeLote(loteId, corridas, contadores, presMap)
        ptExcedeViCorroborado = litrosBuenos !== null && Math.abs(litrosBuenos - ptLote) <= ptLote * TOLERANCIA_ENVASES_BUENOS
      }

      const ptExcedeTramo = tramo !== null && tramo > 0 && ptLote > tramo * MARGEN_REDONDEO && !ptExcedeViCorroborado

      const detalle = {
        lote: lote.lote,
        inicio: n(inicio),
        fin,
        vi: n(vi),
        ptLote: r2(ptLote),
        tramo: tramo === null ? null : r2(tramo),
        ptExcedeVi,
        litrosBuenos: litrosBuenos === null ? null : r2(litrosBuenos),
        ptExcedeViCorroborado,
        ptExcedeTramo,
      }

      if (tramo === null || tramo <= 0 || (ptExcedeVi && !ptExcedeViCorroborado) || ptExcedeTramo) {
        litrosSinContraste += ptLote
        const motivo = tramo === null ? "sin inicio" : tramo <= 0 ? `tramo<=0 (${r2(tramo)})` : ptExcedeVi ? "PT excede volumen preparado, sin corroborar" : "PT excede tramo consumido"
        console.log(`  lote ${loteId.slice(0, 8)} (${lote.lote}) → FUERA (${motivo})`, detalle)
        continue
      }
      consumo += tramo
      producido += ptLote
      console.log(`  lote ${loteId.slice(0, 8)} (${lote.lote}) → DENTRO`, detalle)
    }

    const pctCrudo = pctRendimiento(consumo, producido)
    const pct = pctCrudo !== null && pctCrudo < 0 ? 0 : pctCrudo

    console.log("\n-- RESULTADO --")
    console.log({
      consumo_litrosConsumidos: r2(consumo),
      producido_litrosProducidos: r2(producido),
      litrosSinContraste: Math.round(litrosSinContraste),
      hayLoteAbierto,
      merma_semielaborado_pct: pct,
    })
  }
}

main().catch((e) => console.error(e))
