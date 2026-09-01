import { AppShell } from "@/components/AppShell"
import { PersonalPanel } from "@/components/PersonalPanel"

/*
 * Gestión de personal para ADMINISTRADOR_AREA: alta, edición,
 * restablecer contraseña y baja, acotado a la propia área (el
 * personal se comparte entre todos los administradores de una misma
 * área). SUPERADMINISTRADOR usa la misma lista pero con todas las
 * áreas, desde la pestaña "Personal" de Edición de Datos
 * (src/pages/apps/EdicionDatos.tsx) — ambas páginas reutilizan
 * <PersonalPanel />; el filtro real por área lo hace Postgres según
 * quién llama, no esta página.
 */
export default function Personal() {
  return (
    <AppShell title="Personal" description="Alta, edición y baja de personal de tu área">
      <div className="mx-auto max-w-3xl">
        <PersonalPanel pagina="Personal" />
      </div>
    </AppShell>
  )
}
