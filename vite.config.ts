import path from "node:path"
import { execSync } from "node:child_process"
import { defineConfig, loadEnv, type Connect, type Plugin, type ProxyOptions } from 'vite'
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
 *
 * Producción (sin SUPABASE_URL): en Docker los destinos son los otros
 * contenedores (docker-compose.yml pasa API_DESTINO / ARCHIVOS_DESTINO);
 * en el PC, por defecto, los puertos publicados del servidor de planta.
 *
 * Pruebas (SUPABASE_URL y SUPABASE_ANON_KEY en .env.local o .env.pruebas,
 * `npm run dev -- --mode pruebas`): /api va a la API de Supabase con su
 * clave, y los PDF de actas se guardan en la carpeta local .actas-pruebas/.
 * La clave no llega al navegador: la pone este reenvío.
 */
function destinoApi(env: Record<string, string>): ProxyOptions {
  if (env.SUPABASE_URL) {
    return {
      target: `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1`,
      changeOrigin: true,
      rewrite: (ruta: string) => ruta.replace(/^\/api/, ""),
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    }
  }
  return {
    target: process.env.API_DESTINO ?? "http://192.168.10.143:4037",
    changeOrigin: true,
    rewrite: (ruta: string) => ruta.replace(/^\/api/, ""),
  }
}

/** Pruebas: /archivos lo atiende el mismo Vite con la carpeta local (sin el contenedor de archivos). */
function actasLocales(carpeta: string): Plugin {
  const montar = async (middlewares: Connect.Server) => {
    const { crearManejador } = await import("./archivos/manejador.mjs")
    middlewares.use("/archivos", crearManejador(carpeta))
  }
  return {
    name: "actas-locales",
    configureServer: (server) => montar(server.middlewares),
    configurePreviewServer: (server) => montar(server.middlewares),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const pruebas = Boolean(env.SUPABASE_URL)
  if (pruebas && !env.SUPABASE_ANON_KEY) throw new Error("Modo pruebas: falta SUPABASE_ANON_KEY junto a SUPABASE_URL.")

  const proxy: Record<string, ProxyOptions> = { "/api": destinoApi(env) }
  if (!pruebas) {
    proxy["/archivos"] = {
      target: process.env.ARCHIVOS_DESTINO ?? "http://192.168.10.143:4038",
      changeOrigin: true,
      rewrite: (ruta: string) => ruta.replace(/^\/archivos/, ""),
    }
  }

  const plugins = [react(), tailwindcss(), escribirVersionJson()]
  if (pruebas) plugins.push(actasLocales(path.resolve(import.meta.dirname, ".actas-pruebas")))

  return {
    base: '/',
    plugins,
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
  }
})
