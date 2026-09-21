/*
 * SOLO LECTURA. ¿Por qué T2 (Javier) ahora ve inicio=2000 Y fin=2000
 * para el lote 0002 (tramo=0), si el fix debía corregir el "fin"? La
 * hipótesis: T1 (Danny) NUNCA tuvo una entrada congelada para este
 * lote en volumenes_lote_cierre — su "fin" se lee EN VIVO, así que
 * hoy muestra el valor actual (2000) sin importar qué vio Danny de
 * verdad al cerrar su turno. Confirmarlo con hechos crudos.
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

const USUARIO = process.argv[2] || "agomez"
const LOTE_ID = "aea3ca6b-33f8-42f7-8ce8-c97866cc3ef4"
const T1 = "de8fa8b3-1488-4330-bcd8-a4f0c2c55283"

async function main() {
  // 1) Auditoría cruda de la fila preparaciones, ya la tenemos de antes
  //    (creación 13:53, corrección a 18260 a las 15:23, caida a 2960 a
  //    las 22:28, corrección a 2000 a las 22:31). Repetimos acá por si
  //    hay algo nuevo (el cierre del lote, por ejemplo).
  const { data: aud, error: e1 } = await supabase.rpc("listar_auditoria", {
    p_usuario: USUARIO,
    p_fecha_desde: "2026-09-15",
    p_fecha_hasta: "2026-09-16",
  })
  if (e1) return console.error("listar_auditoria:", e1.message)
  const filas = aud.filter((r) => r.entidad === "preparaciones" && String(r.entidad_id) === LOTE_ID)
  filas.sort((a, b) => new Date(a.ocurrido_en) - new Date(b.ocurrido_en))
  console.log(`== Historial completo de ediciones a preparaciones/${LOTE_ID.slice(0, 8)} ==`)
  for (const r of filas) {
    console.log(`  ${r.ocurrido_en} — ${r.usuario} — ${r.accion}`, { antes: r.antes, despues: r.despues })
  }

  // 2) Auditoría de turno_lineas: cuándo se creó/tocó la corrida que
  //    apunta a este lote_id, y en qué turno.
  const filasTL = aud.filter((r) => r.entidad === "turno_lineas")
  console.log(`\n== Cambios a turno_lineas ese día (${filasTL.length}) — buscamos las que tengan este lote_id en antes/despues ==`)
  for (const r of filasTL) {
    const tocaLote =
      (r.antes && r.antes.lote_id === LOTE_ID) || (r.despues && r.despues.lote_id === LOTE_ID) ||
      (r.antes && r.antes.lote === "0002") || (r.despues && r.despues.lote === "0002")
    if (tocaLote) {
      console.log(`  ${r.ocurrido_en} — ${r.usuario} — ${r.accion} — entidad_id=${r.entidad_id}`, { antes: r.antes, despues: r.despues })
    }
  }

  // 3) Auditoría de producto_terminado ese día, buscando montos que
  //    coincidan con lo que vimos atribuido a T1 (~14280 L).
  const filasPT = aud.filter((r) => r.entidad === "producto_terminado")
  console.log(`\n== producto_terminado ese día (${filasPT.length}) ==`)
  for (const r of filasPT) {
    console.log(`  ${r.ocurrido_en} — ${r.usuario} — ${r.accion} — entidad_id=${r.entidad_id}`, { antes: r.antes, despues: r.despues })
  }

  // 4) turno_detalle de T1 tal cual hoy, para ver el lote 0002 desde su lado.
  const { data: t1, error: e2 } = await supabase.rpc("turno_detalle", { p_usuario: USUARIO, p_turno_id: T1 })
  if (e2) return console.error("turno_detalle T1:", e2.message)
  console.log("\n== T1 (Danny) — cabecera ==")
  console.log({ estado: t1.estado, hora_inicio: t1.hora_inicio, hora_fin: t1.hora_fin, cierre_automatico: t1.cierre_automatico })
  console.log("== T1 — lote 0002 visto desde T1 ==")
  console.log((t1.preparaciones ?? []).find((p) => p.lote === "0002"))
  console.log("== T1 — corridas (lineas) ==")
  for (const c of t1.lineas ?? []) console.log(" ", { id: c.id.slice(0, 8), linea: c.linea_codigo, lote: c.lote, lote_id: c.lote_id?.slice(0, 8), activada_en: c.activada_en, finalizada_en: c.finalizada_en })
  console.log("== T1 — producto_terminado ==")
  for (const p of t1.producto_terminado ?? []) console.log(" ", { turno_linea_id: p.turno_linea_id?.slice(0, 8), litros_producidos: p.litros_producidos, creado_en: p.creado_en })
}

main().catch((e) => console.error(e))
