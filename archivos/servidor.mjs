// ============================================================
// ARCHIVOS — los PDF de las actas (reemplaza el Storage de Supabase)
// ============================================================
// Guarda y sirve los PDF en una carpeta del servidor, con las mismas
// rutas que tenían en el bucket "actas" (ÁREA/turno_id/CÓDIGO-hora.pdf,
// la que guarda actas.storage_path). Así los PDF bajados con
// scripts/descargar-actas.mjs se copian tal cual a esa carpeta.
//
//   GET /actas/<ruta>  → el PDF (lectura libre, como el bucket público)
//   PUT /actas/<ruta>  → lo guarda; no pisa uno que ya exista
//
// La app llega acá por /archivos/ (Vite reenvía, ver vite.config.ts).
// Sin dependencias: solo Node.
// ============================================================

import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { dirname, resolve, sep } from "node:path"

const PUERTO = Number(process.env.ARCHIVOS_PUERTO ?? 4038)
const CARPETA = resolve(process.env.ARCHIVOS_CARPETA ?? "/datos/actas")
const MAX_BYTES = 25 * 1024 * 1024

mkdirSync(CARPETA, { recursive: true })

/** Ruta en disco de /actas/<ruta>, o null si sale de la carpeta o no es un PDF. */
function rutaEnDisco(urlPath) {
  if (!urlPath.startsWith("/actas/")) return null
  let relativa
  try {
    relativa = decodeURIComponent(urlPath.slice("/actas/".length))
  } catch {
    return null
  }
  if (!relativa.toLowerCase().endsWith(".pdf") || relativa.includes("\0")) return null
  const absoluta = resolve(CARPETA, relativa)
  return absoluta.startsWith(CARPETA + sep) ? absoluta : null
}

function responder(res, codigo, texto) {
  res.writeHead(codigo, { "Content-Type": "text/plain; charset=utf-8" })
  res.end(texto)
}

createServer((req, res) => {
  const ruta = rutaEnDisco(new URL(req.url ?? "/", "http://x").pathname)
  if (!ruta) return responder(res, 404, "No encontrado.")

  if (req.method === "GET" || req.method === "HEAD") {
    if (!existsSync(ruta)) return responder(res, 404, "El PDF del acta no está en el servidor.")
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": statSync(ruta).size,
      "Cache-Control": "public, max-age=31536000, immutable",
    })
    if (req.method === "HEAD") return res.end()
    return createReadStream(ruta).pipe(res)
  }

  if (req.method === "PUT") {
    if (existsSync(ruta)) return responder(res, 409, "Ya existe un PDF con ese nombre.")
    const partes = []
    let total = 0
    req.on("data", (parte) => {
      total += parte.length
      if (total > MAX_BYTES) {
        responder(res, 413, "El PDF es demasiado grande.")
        req.destroy()
      } else partes.push(parte)
    })
    req.on("end", () => {
      if (res.writableEnded) return
      const cuerpo = Buffer.concat(partes)
      if (cuerpo.subarray(0, 5).toString() !== "%PDF-") return responder(res, 400, "El archivo no es un PDF.")
      try {
        mkdirSync(dirname(ruta), { recursive: true })
        writeFileSync(ruta, cuerpo, { flag: "wx" })
        responder(res, 201, "Guardado.")
      } catch (e) {
        responder(res, e.code === "EEXIST" ? 409 : 500, e.code === "EEXIST" ? "Ya existe un PDF con ese nombre." : "No se pudo guardar el PDF.")
      }
    })
    return
  }

  responder(res, 405, "Método no permitido.")
}).listen(PUERTO, () => {
  console.log(`archivos: puerto ${PUERTO}, carpeta ${CARPETA}`)
})
