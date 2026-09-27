import { AppShell } from "@/components/AppShell"
import { PersonalPanel } from "@/components/PersonalPanel"

/*
 * Personal suelto, para quien tiene PERSONAL_GESTIONAR sin entrar a
 * Edición de Datos (ej. Jefe de Producción). El Super Administrador
 * también lo tiene como pestaña dentro de Edición de Datos.
 */
export default function Personal() {
  return (
    <AppShell title="Personal" description="Altas, roles y permisos del personal">
      <PersonalPanel pagina="Personal" />
    </AppShell>
  )
}
