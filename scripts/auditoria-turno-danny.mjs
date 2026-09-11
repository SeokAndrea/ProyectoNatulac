/*
 * SOLO LECTURA. Trae la auditoría del 2026-09-10 y filtra lo relacionado
 * al turno de Danny (TURNO_2, A20260910_T2G2) y sus dos lotes (0004,
 * 0005) para explicar la merma de semielaborado.
 *
 *   node auditoria-turno-danny.mjs <usuario_superadmin>
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
  console.error("Uso: node auditoria-turno-danny.mjs <usuario_superadmin>")
  process.exit(1)
}

const TURNO_ID = "31aef589-9ae6-4b1c-ab1d-5ec958700bad"
const LOTES = new Set(["9a2edba5", "9317bd67", "9f049209"])

async function main() {
  const { data, error } = await supabase.rpc("listar_auditoria", {
    p_usuario: USUARIO,
    p_fecha_desde: "2026-09-09",
    p_fecha_hasta: "2026-09-11",
  })
  if (error) return console.error("listar_auditoria:", error.message)

  console.log(`${data.length} registros de auditoría entre 09-09 y 09-11.\n`)

  const relevantes = data.filter((r) => {
    if (r.turno_id === TURNO_ID) return true
    const idShort = (r.entidad_id || "").slice(0, 8)
    return LOTES.has(idShort)
  })

  relevantes.sort((a, b) => new Date(a.ocurrido_en) - new Date(b.ocurrido_en))

  for (const r of relevantes) {
    console.log(`${r.ocurrido_en}  [${r.usuario}]  ${r.accion}  (${r.entidad} ${((r.entidad_id || "")).slice(0, 8)})  pagina=${r.pagina}`)
    console.log(`  resumen: ${r.resumen}`)
    if (r.antes || r.despues) {
      console.log(`  antes:   ${JSON.stringify(r.antes)}`)
      console.log(`  despues: ${JSON.stringify(r.despues)}`)
    }
    console.log()
  }
}

main().catch((e) => console.error(e))
