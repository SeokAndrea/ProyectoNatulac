/*
 * SOLO LECTURA. El usuario dice que a Deivis le salió un error al
 * activar línea — se busca en errores_cliente (log nuevo, migración
 * 20261047) el/los errores de Deivis relacionados con activar_linea,
 * y se cruza con la auditoría de ese mismo día para reconstruir qué
 * hizo justo antes.
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

const USUARIO_ADMIN = process.argv[2] || "agomez"

async function main() {
  const { data: errores, error: errErrores } = await supabase.rpc("listar_errores_cliente", {
    p_usuario: USUARIO_ADMIN,
    p_limite: 500,
  })
  if (errErrores) {
    console.error("Error listando errores_cliente:", errErrores)
    return
  }

  const deErrores = (errores ?? []).filter((e) => (e.usuarioNombre ?? "").toLowerCase().includes("deivis"))
  const deActivarLinea = deErrores.filter((e) =>
    `${e.funcion} ${e.mensaje}`.toLowerCase().includes("activar_linea") ||
    `${e.funcion} ${e.mensaje}`.toLowerCase().includes("línea") ||
    `${e.funcion} ${e.mensaje}`.toLowerCase().includes("linea"),
  )

  console.log(`Errores totales de Deivis en el log: ${deErrores.length}`)
  console.log(`De esos, relacionados con línea/activar_linea: ${deActivarLinea.length}\n`)

  for (const e of deActivarLinea.length > 0 ? deActivarLinea : deErrores) {
    console.log("=".repeat(70))
    console.log("Cuándo:", e.creadoEn)
    console.log("Función RPC:", e.funcion)
    console.log("Mensaje:", e.mensaje)
    console.log("Contexto:", JSON.stringify(e.contexto, null, 2))
  }

  if (deActivarLinea.length === 0 && deErrores.length === 0) {
    console.log("No se encontró a Deivis en errores_cliente. Puede que el error no haya quedado registrado")
    console.log("(por ejemplo si pasó antes de la migración 20261047, o si el nombre está distinto).")
    return
  }

  // Auditoría del mismo día, para ver la secuencia de acciones antes del error.
  for (const e of (deActivarLinea.length > 0 ? deActivarLinea : deErrores).slice(0, 3)) {
    const fecha = e.creadoEn.slice(0, 10)
    console.log("\n" + "-".repeat(70))
    console.log(`Auditoría de Deivis el ${fecha} (error a las ${e.creadoEn.slice(11, 19)}):`)
    const { data: audit, error: errAudit } = await supabase.rpc("listar_auditoria", {
      p_usuario: USUARIO_ADMIN,
      p_fecha_desde: fecha,
      p_fecha_hasta: fecha,
    })
    if (errAudit) {
      console.error("Error listando auditoría:", errAudit)
      continue
    }
    const deDeivis = (audit ?? []).filter((a) => (a.usuario_nombre ?? "").toLowerCase().includes("deivis"))
    if (deDeivis.length === 0) {
      console.log("  (sin filas de auditoría para Deivis ese día)")
      continue
    }
    // listar_auditoria devuelve más reciente primero; se muestra en orden cronológico.
    for (const a of [...deDeivis].reverse()) {
      console.log(`  ${a.ocurrido_en.slice(11, 19)} · ${a.accion} · ${a.pagina ?? "?"} · ${a.resumen}`)
    }
  }
}

main()
