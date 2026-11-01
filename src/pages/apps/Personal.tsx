import { Users } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"

/* Personal se está rehaciendo con áreas y puestos (reemplazo en la Task 7). */
export default function Personal() {
  return (
    <AppShell title="Personal" description="Personas, puestos y permisos">
      <EmptyState icon={Users} title="Personal se está rehaciendo" description="Vuelve en unos días." />
    </AppShell>
  )
}
