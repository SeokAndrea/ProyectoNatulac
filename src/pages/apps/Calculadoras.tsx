import { AppCard } from "@/components/AppCard"
import { AppShell } from "@/components/AppShell"
import { appsCalculadoras } from "@/lib/apps"

/*
 * Agrupa las 3 calculadoras (Bobina, Fórmula, Conteo por Peso) bajo
 * una sola tarjeta en el Hub, en vez de mostrarlas sueltas.
 */
export default function Calculadoras() {
  return (
    <AppShell title="Calculadoras" description="Fórmula de producto, bobina y conteo por peso">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {appsCalculadoras.map((app) => (
          <AppCard key={app.slug} app={app} turnoActivo={true} />
        ))}
      </div>
    </AppShell>
  )
}
