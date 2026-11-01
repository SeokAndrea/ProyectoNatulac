import { AppShell } from "@/components/AppShell"
import { PersonalPantalla } from "@/components/personal/PersonalPantalla"

/* Organigrama por nivel; el menú de áreas, el panel de la persona y las reglas están en components/personal. */
export default function Personal() {
  return (
    <AppShell title="Personal" description="Personas, puestos y permisos" fullWidth>
      <PersonalPantalla pagina="/personal" />
    </AppShell>
  )
}
