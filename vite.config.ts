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

function escribirVersionJson(): Plugin {
  return {
    name: "escribir-version-json",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: appVersion }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), escribirVersionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
})
