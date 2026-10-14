import path from "node:path"
import { defineConfig } from "vitest/config"

// https://vitest.dev/config/
export default defineConfig({
  // Las mismas constantes que hornea vite.config.ts (el encabezado muestra la versión).
  define: {
    __APP_VERSION__: JSON.stringify("test"),
    __APP_BUILD__: JSON.stringify("01/01, 00:00"),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // jsdom para poder testear componentes (render + queries del DOM);
    // los tests de fórmulas puras andan igual.
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // Las fórmulas bajo prueba son puras, pero importar la cadena
    // panelProduccion -> turno -> supabase ejecuta src/lib/supabase.ts,
    // que lanza si faltan estas variables. Valores de relleno: los
    // tests nunca tocan la red.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
})
