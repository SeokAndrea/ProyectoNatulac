/*
 * SOLO LECTURA. Rastrea via listar_auditoria() todos los cambios a la
 * fila `preparaciones` del lote aea3ca6b (0002, tanque 3) entre el
 * 2026-09-15 y 2026-09-16, para ver qué acción subió su volumen_l de
 * 2000 a 2960 durante el Turno 2 de Javier.
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
const LOTE_ID = "aea3ca6b-".slice(0, 8) // solo para mostrar; filtramos por prefijo abajo

async function main() {
  const { data, error } = await supabase.rpc("listar_auditoria", {
    p_usuario: USUARIO,
    p_fecha_desde: "2026-09-15",
    p_fecha_hasta: "2026-09-16",
  })
  if (error) return console.error("listar_auditoria:", error.message)

  const filas = data.filter((r) => r.entidad === "preparaciones" && String(r.entidad_id).startsWith("aea3ca6b"))
  filas.sort((a, b) => new Date(a.ocurrido_en) - new Date(b.ocurrido_en))
  console.log(`Cambios a preparaciones/aea3ca6b (lote 0002, tanque 3): ${filas.length}`)
  for (const r of filas) {
    console.log(`\n${r.ocurrido_en} — ${r.usuario} — ${r.accion} — pagina: ${r.pagina}`)
    console.log("  antes:", r.antes)
    console.log("  despues:", r.despues)
  }
}

main().catch((e) => console.error(e))
