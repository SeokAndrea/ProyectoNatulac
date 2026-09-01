import path from "node:path"
import { defineConfig } from "vitest/config"

// https://vitest.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
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
