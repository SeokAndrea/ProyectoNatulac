import { BarChart3, PinIcon, UserRound } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/*
 * Esta página tiene DOS secciones separadas:
 *   1. Dashboard de Planta: indicadores generales de la planta
 *      (todas las líneas/turnos), siempre visible arriba de todo.
 *   2. Mis Estadísticas: el rendimiento personal del supervisor.
 * Ambas están vacías por ahora (esperando que definamos los KPIs y
 * conectemos Supabase). Cuando haya datos reales, cada sección va a
 * necesitar su propia consulta: el dashboard de planta agrega datos
 * de todos los turnos/áreas, mientras que "Mis Estadísticas" filtra
 * solo por el usuario logueado.
 */
export default function MisEstadisticas() {
  return (
    <AppShell title="Mis Estadísticas" description="Rendimiento y métricas de planta">
      <div className="flex flex-col gap-6">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PinIcon className="size-4 text-primary" />
              Dashboard de Planta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={BarChart3}
              title="Todavía no hay nada por aquí"
              description="Indicadores generales de la planta (todas las líneas y turnos). Estará disponible próximamente."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4 text-muted-foreground" />
              Mis Estadísticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={BarChart3}
              title="Todavía no hay nada por aquí"
              description="Aquí se podrá consultar el rendimiento personal del turno. Estará disponible próximamente."
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
