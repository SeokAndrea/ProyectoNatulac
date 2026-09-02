/*
 * SOLO LECTURA. Trae el registro de auditoría (listar_auditoria) y
 * filtra los cambios de volumen_inicial_l / volumen_l sobre
 * preparaciones — para reconstruir el valor original de cada lote
 * antes de que una corrección lo pisara.
 *
 *   node scripts/dump-auditoria-preparaciones.mjs <usuario> [dias_hacia_atras]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const ROOT = "c:/Users/andre/OneDrive/Documents/PROYECTO"
const OUT = "c:/Users/andre/AppData/Local/Temp/claude/c--Users-andre-OneDrive-Documents-PROYECTO/2ace472d-d75d-4722-bbcf-235a344b6a60/scratchpad/aseptico"
mkdirSync(OUT, { recursive: true })

const env = {}
for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const USUARIO = process.argv[2]
if (!USUARIO) {
  console.error("Falta el usuario. Uso: node scripts/dump-auditoria-preparaciones.mjs <usuario> [dias]")
  process.exit(1)
}
const DIAS = Number(process.argv[3]) || 30
const desde = new Date()
desde.setUTCDate(desde.getUTCDate() - DIAS)
const fechaDesde = desde.toISOString().slice(0, 10)

async function main() {
  const { data, error } = await supabase.rpc("listar_auditoria", {
    p_usuario: USUARIO,
    p_fecha_desde: fechaDesde,
    p_fecha_hasta: null,
  })
  if (error) {
    console.error("listar_auditoria error:", error.message)
    process.exit(1)
  }
  writeFileSync(`${OUT}/_auditoria_cruda.json`, JSON.stringify(data, null, 2))
  console.log(`auditoría cruda: ${data.length} registros (desde ${fechaDesde}) → _auditoria_cruda.json`)

  const entidades = {}
  for (const r of data) entidades[r.entidad] = (entidades[r.entidad] || 0) + 1
  console.log("por entidad:", JSON.stringify(entidades, null, 2))

  const preps = data.filter(
    (r) =>
      /prepar/i.test(r.entidad || "") ||
      (r.antes && ("volumen_inicial_l" in r.antes || "volumen_l" in r.antes)) ||
      (r.despues && ("volumen_inicial_l" in r.despues || "volumen_l" in r.despues)),
  )

  const movInicial = preps
    .map((r) => ({
      ocurrido_en: r.ocurrido_en,
      usuario: r.usuario,
      accion: r.accion,
      pagina: r.pagina,
      entidad: r.entidad,
      entidad_id: r.entidad_id,
      resumen: r.resumen,
      inicial_antes: r.antes?.volumen_inicial_l ?? null,
      inicial_despues: r.despues?.volumen_inicial_l ?? null,
      vol_antes: r.antes?.volumen_l ?? null,
      vol_despues: r.despues?.volumen_l ?? null,
      tambores_antes: r.antes?.tambores ?? null,
      tambores_despues: r.despues?.tambores ?? null,
    }))
    .filter(
      (r) =>
        r.inicial_antes !== r.inicial_despues ||
        r.vol_antes !== r.vol_despues ||
        r.tambores_antes !== r.tambores_despues,
    )

  writeFileSync(`${OUT}/_auditoria_preparaciones.json`, JSON.stringify(movInicial, null, 2))
  console.log(`\ncambios de volumen/tambores sobre preparaciones: ${movInicial.length}\n`)
  console.log(JSON.stringify(movInicial, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
