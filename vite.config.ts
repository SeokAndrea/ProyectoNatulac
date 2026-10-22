import path from "node:path"
import { execSync } from "node:child_process"
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
 * Versión del build: el hash corto del commit (o la hora, si no hay git
 * a mano) al momento de compilar. Se hornea en el bundle como
 * __APP_VERSION__ (ver src/vite-env.d.ts) Y se escribe aparte como
 * dist/version.json — src/components/VersionChecker.tsx compara las
 * dos: si alguien tiene una pestaña abierta desde ANTES de un deploy,
 * su __APP_VERSION__ (ya cargado en el JS) queda vieja apenas
 * version.json cambia en el servidor, y le avisa que actualice. Esto
 * es lo que probablemente le pasó a Deivis (ver plan de errores,
 * migración 20261047090000): el frontend nuevo pisó al viejo justo
 * antes de que la migración terminara de aplicarse.
 */
function versionDeBuild(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim()
  } catch {
    return String(Date.now())
  }
}
const appVersion = versionDeBuild()
/**
 * Fecha y hora (planta) en que se armó: se ve en el encabezado para saber
 * si el servidor ya sirve lo último (dueña, 2026-10-14). En Docker no hay
 * .git (ver .dockerignore), así que ahí la versión es solo esta hora.
 */
const appBuild = new Intl.DateTimeFormat("es-VE", {
  timeZone: "America/Caracas",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date())

function escribirVersionJson(): Plugin {
  return {
    name: "escribir-version-json",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: appVersion }) })
    },
  }
}

/*
 * La app le pide todo al mismo servidor que la sirve (sin CORS):
 *   /api/      → PostgREST (la base, ver src/lib/supabase.ts)
 *   /archivos/ → los PDF de actas (ver archivos/servidor.mjs)
 * En Docker los destinos son los otros contenedores (docker-compose.yml
 * pasa API_DESTINO / ARCHIVOS_DESTINO); en el PC, por defecto, los
 * puertos publicados del servidor de planta.
 */
const proxy = {
  "/api": {
    target: process.env.API_DESTINO ?? "http://192.168.10.143:4037",
    changeOrigin: true,
    rewrite: (ruta: string) => ruta.replace(/^\/api/, ""),
  },
  "/archivos": {
    target: process.env.ARCHIVOS_DESTINO ?? "http://192.168.10.143:4038",
    changeOrigin: true,
    rewrite: (ruta: string) => ruta.replace(/^\/archivos/, ""),
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), escribirVersionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD__: JSON.stringify(appBuild),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy,
  },
  preview: {
    host: true,
    allowedHosts: true,
    proxy,
  },
})
