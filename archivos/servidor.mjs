// ============================================================
// ARCHIVOS — los PDF de las actas (reemplaza el Storage de Supabase)
// ============================================================
// Guarda y sirve los PDF en una carpeta del servidor, con las mismas
// rutas que tenían en el bucket "actas" (ÁREA/turno_id/CÓDIGO-hora.pdf,
// la que guarda actas.storage_path). Así los PDF bajados con
// scripts/descargar-actas.mjs se copian tal cual a esa carpeta.
// La lógica está en manejador.mjs.
//
// La app llega acá por /archivos/ (Vite reenvía, ver vite.config.ts).
// Sin dependencias: solo Node.
// ============================================================

import { createServer } from "node:http"
import { crearManejador } from "./manejador.mjs"

const PUERTO = Number(process.env.ARCHIVOS_PUERTO ?? 4038)
const CARPETA = process.env.ARCHIVOS_CARPETA ?? "/datos/actas"

createServer(crearManejador(CARPETA)).listen(PUERTO, () => {
  console.log(`archivos: puerto ${PUERTO}, carpeta ${CARPETA}`)
})
