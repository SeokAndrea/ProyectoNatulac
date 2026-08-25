import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { HistorialDiaSupervisor } from "@/components/HistorialDiaSupervisor"
import { Users } from "lucide-react"
import { useAuth } from "@/lib/auth"

/*
 * Historial del Día: tarjeta propia en el hub (no vive dentro de
 * Status ni de ninguna otra pantalla) — qué hizo cada supervisor del
 * área, por hora, para revisar rápido sin reconstruir la historia a
 * mano. La lógica real está en src/components/HistorialDiaSupervisor.tsx.
 */
export default function HistorialDia() {
  const { session } = useAuth()

  if (!session?.area) {
    return (
      <AppShell title="Historial del Día" description="Acciones del día por supervisor">
        <EmptyState
          icon={Users}
          title="Sin área asignada"
          description="Esta vista necesita un área asignada a tu usuario."
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Historial del Día" description="Acciones del día por supervisor">
      <div className="mx-auto max-w-4xl">
        <HistorialDiaSupervisor areaCodigo={session.area} />
      </div>
    </AppShell>
  )
}
