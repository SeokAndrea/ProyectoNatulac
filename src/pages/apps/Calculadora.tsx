import { Calculator } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"

/*
 * Calculadora de Producción Aséptico.
 *
 * Esta página está pensada para reemplazar el EmptyState de abajo por
 * un formulario con las fórmulas del área (velocidad de llenadora,
 * sabores, presentaciones, mermas, etc.). Cuando se definan esas
 * fórmulas junto con la base de datos:
 *   1. Crear un archivo src/lib/calculos.ts con una función por
 *      fórmula (recibe los valores de entrada, devuelve el resultado).
 *      Mantener las fórmulas separadas del componente hace más fácil
 *      ajustarlas o testearlas sin tocar la interfaz.
 *   2. Traer aquí los inputs necesarios (Input/Select de shadcn, ver
 *      ejemplos en Login.tsx) y mostrar el resultado usando esas
 *      funciones.
 *   3. Si un valor depende de datos guardados en Supabase (por
 *      ejemplo la velocidad estándar de un sabor/presentación), traerlo
 *      con una consulta al cliente de Supabase en vez de hardcodearlo.
 */
export default function Calculadora() {
  return (
    <AppShell title="Calculadora" description="Herramienta de cálculo para producción">
      <EmptyState
        icon={Calculator}
        title="Todavía no hay nada por aquí"
        description="Esta calculadora de producción está en construcción. Estará disponible próximamente."
      />
    </AppShell>
  )
}
