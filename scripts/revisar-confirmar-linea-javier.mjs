/*
 * SOLO LECTURA. Javier dice que intentó "Confirmar" una línea y no
 * pudo cargar PT ("Confirma el estado de esta línea antes de cargar
 * el Producto Terminado"). Buscamos su turno más reciente (hoy y
 * ayer), el estado de sus corridas (activa / confirmado_inicio_en) y
 * el historial de auditoría de "Confirmar inicio" para esa línea, para
 * ver si el UPDATE de confirmar_estado_linea encontró la fila `activa`
 * o si quedó pegado en 0 filas (posible: la corrida ya no estaba
 * `activa` en el momento del click, la actualización no lanza error
 * pero tampoco graba nada, y aun así queda auditoría de "éxito").
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

async function main() {
  for (const fecha of ["2026-09-17", "2026-09-16"]) {
    for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
      const { data: t, error } = await supabase.rpc("turno_de_fecha_tipo", {
        p_fecha: fecha,
        p_turno_tipo: tipo,
        p_area_codigo: "ASEPTICO",
      })
      if (error || !t) continue
      if (!(t.supervisor_nombre ?? "").toLowerCase().includes("javier")) continue

      console.log(`\n== ${t.codigo} — ${t.supervisor_nombre} — estado ${t.estado} ==`)
      for (const l of t.lineas ?? []) {
        console.log(`  corrida ${l.id.slice(0, 8)} linea=${l.linea_codigo} lote=${l.lote} activa=${l.activa} confirmado_inicio_en=${l.confirmado_inicio_en} activada_en=${l.activada_en} pausada_en=${l.pausada_en} finalizada_en=${l.finalizada_en} entregada_en=${l.entregada_en}`)
      }

      const { data: aud, error: e2 } = await supabase.rpc("listar_auditoria", {
        p_usuario: USUARIO,
        p_fecha_desde: fecha,
        p_fecha_hasta: fecha,
      })
      if (e2) { console.error("listar_auditoria:", e2.message); continue }
      const confirmaciones = aud.filter((r) => r.entidad === "turno_lineas" && (r.accion_detalle ?? r.detalle ?? "").toString().toLowerCase().includes("confirmar"))
      console.log(`  == auditoría "Confirmar" ese día (${confirmaciones.length}) ==`)
      for (const r of confirmaciones) {
        console.log(`    ${r.ocurrido_en} — ${r.usuario} — entidad_id=${r.entidad_id}`, r.despues ?? r.detalle)
      }
    }
  }
}

main().catch((e) => console.error(e))
