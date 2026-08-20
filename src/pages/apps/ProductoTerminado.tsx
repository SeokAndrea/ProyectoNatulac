import { PackageCheck } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"

/*
 * Todavía por definir qué registra esta pantalla exactamente (ej.
 * cajas/paletas finales usando los datos de PRESENTACIONES en
 * catalogos.ts). El conteo de envases por línea (llenadora / buenos
 * / desechados) es "Contadores y Merma", una página aparte —
 * ver src/pages/apps/ContadoresMerma.tsx.
 */
export default function ProductoTerminado() {
  return (
    <AppShell title="Producto Terminado" description="Carga de lotes de producto terminado">
      <EmptyState
        icon={PackageCheck}
        title="Todavía no hay nada por aquí"
        description="Esta aplicación permitirá registrar los lotes de producto terminado. Estará disponible próximamente."
      />
    </AppShell>
  )
}
