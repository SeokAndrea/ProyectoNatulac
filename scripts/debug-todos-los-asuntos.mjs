/*
 * SOLO LECTURA. Barre los turnos reales de ASEPTICO y busca, para cada
 * lote, la firma de cada uno de los "asuntos" identificados en el plan.
 * No escribe nada. Usa las mismas RPC que el frontend (anon key de
 * .env.local) + listar_auditoria (necesita un usuario SUPERADMIN).
 *
 *   node scripts/debug-todos-los-asuntos.mjs <usuario_superadmin> [dias]
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const ROOT = process.cwd()
const env = {}
for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const USUARIO = process.argv[2]
const DIAS = Number(process.argv[3]) || 25
if (!USUARIO) {
  console.error("Uso: node scripts/debug-todos-los-asuntos.mjs <usuario_superadmin> [dias]")
  process.exit(1)
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

async function barrerTurnos() {
  const turnos = []
  const hoy = new Date()
  for (let i = 0; i < DIAS; i++) {
    const d = new Date(hoy)
    d.setUTCDate(d.getUTCDate() - i)
    const fecha = ymd(d)
    for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
      const { data, error } = await supabase.rpc("turno_de_fecha_tipo", {
        p_fecha: fecha,
        p_turno_tipo: tipo,
        p_area_codigo: "ASEPTICO",
      })
      if (error || !data) continue
      turnos.push(data)
    }
  }
  return turnos
}

async function main() {
  console.log(`Barriendo ${DIAS} días de turnos ASEPTICO...\n`)
  const turnos = await barrerTurnos()
  console.log(`${turnos.length} turnos encontrados.\n`)

  // Todas las preparaciones vistas en cualquier turno, dedupe por id, quedándonos con la versión más "fresca".
  const prepsPorId = new Map()
  for (const t of turnos) {
    for (const p of t.preparaciones || []) {
      prepsPorId.set(p.id, p)
    }
  }
  const preps = [...prepsPorId.values()]

  // ================= ASUNTO 1: preparar sobre LISTO con producto (negativo) =================
  console.log("========== ASUNTO 1 — Preparar sobre un tanque con producto adentro (resto descartado) ==========")
  const porTanque = new Map()
  for (const p of preps) {
    const k = p.numero_tanque
    if (!porTanque.has(k)) porTanque.set(k, [])
    porTanque.get(k).push(p)
  }
  let casos1 = 0
  for (const [tanque, lista] of porTanque) {
    lista.sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en))
    for (let i = 0; i < lista.length - 1; i++) {
      const actual = lista[i]
      const siguiente = lista[i + 1]
      if (!actual.cerrado_en) continue
      const gapMin = (new Date(siguiente.creado_en) - new Date(actual.cerrado_en)) / 60000
      // La preparación se cerró casi al mismo tiempo (o después) de que naciera la siguiente,
      // y le quedaba volumen adentro -> resto descartado.
      if (Math.abs(gapMin) < 5 && Number(actual.volumen_l) > 0) {
        casos1++
        console.log(
          `  Tanque ${tanque}: lote "${actual.lote}" cerró con ${actual.volumen_l} L adentro, ${gapMin.toFixed(1)} min de la nueva prep "${siguiente.lote}" (${siguiente.creado_en})`,
        )
      }
    }
  }
  console.log(`Total: ${casos1} caso(s) de resto descartado por preparar encima.\n`)

  // ================= ASUNTO 2: lote cerrado con residuo sin rastro claro =================
  console.log("========== ASUNTO 2 — Lote cerrado con volumen_l > 0 (residuo) ==========")
  const cerradosConResto = preps.filter((p) => p.cerrado_en && Number(p.volumen_l) > 0)
  for (const p of cerradosConResto) {
    console.log(`  Tanque ${p.numero_tanque}, lote "${p.lote}": quedó ${p.volumen_l} L al cerrar (${p.cerrado_en})`)
  }
  console.log(`Total: ${cerradosConResto.length} lote(s) cerrados con residuo — cada uno necesita el rastro de a dónde fue (transferencia / tobos / se tiró).\n`)

  // ================= ASUNTO 3: transferencia "deshecha" por una corrección =================
  console.log("========== ASUNTO 3 — Transferencia movida y después corregida al valor anterior ==========")
  const { data: auditoria, error: errAud } = await supabase.rpc("listar_auditoria", {
    p_usuario: USUARIO,
    p_fecha_desde: ymd(new Date(Date.now() - DIAS * 86400000)),
    p_fecha_hasta: null,
  })
  if (errAud) {
    console.log(`  (no se pudo leer auditoría: ${errAud.message} — revisar el usuario)`)
  } else {
    const prepAud = auditoria.filter((r) => r.entidad === "preparaciones" && r.antes && r.despues)
    const porId = new Map()
    for (const r of prepAud) {
      if (!porId.has(r.entidad_id)) porId.set(r.entidad_id, [])
      porId.get(r.entidad_id).push(r)
    }
    let casos3 = 0
    for (const [id, filas] of porId) {
      filas.sort((a, b) => new Date(a.ocurrido_en) - new Date(b.ocurrido_en))
      for (let i = 0; i < filas.length - 1; i++) {
        const a = filas[i]
        const b = filas[i + 1]
        const dInicialA = Number(a.despues.volumen_inicial_l) - Number(a.antes.volumen_inicial_l || 0)
        const dVolA = Number(a.despues.volumen_l || 0) - Number(a.antes.volumen_l || 0)
        const dInicialB = Number(b.despues.volumen_inicial_l || 0) - Number(b.antes.volumen_inicial_l || 0)
        const dVolB = Number(b.despues.volumen_l || 0) - Number(b.antes.volumen_l || 0)
        // Firma de transferencia: inicial y volumen se mueven JUNTOS por el mismo monto.
        const esTransferenciaA = dInicialA !== 0 && dInicialA === dVolA
        const esReversaB = dInicialB !== 0 && dInicialB === dVolB && Math.sign(dInicialB) === -Math.sign(dInicialA)
        if (esTransferenciaA && esReversaB) {
          casos3++
          console.log(
            `  Lote ${id.slice(0, 8)}: ${a.ocurrido_en} recibió +${dInicialA} (transferencia), y ${b.ocurrido_en} (${b.usuario}) lo devolvió ${dInicialB} — el líquido no se puede "deshacer", solo el papel.`,
          )
        }
      }
    }
    console.log(`Total: ${casos3} caso(s) de transferencia movida y después corregida de vuelta.\n`)
  }

  // ================= RESUMEN =================
  console.log("========== RESUMEN ==========")
  console.log(`Asunto 1 (preparar sobre LISTO con producto): ${casos1} caso(s)`)
  console.log(`Asunto 2 (lote cerrado con residuo, necesita rastro): ${cerradosConResto.length} caso(s)`)
  console.log(`Asunto 3 (transferencia deshecha por corrección): ver arriba`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
