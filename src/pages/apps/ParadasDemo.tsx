import { PanelParadasVista } from "@/components/PanelParadasVista"
import { RegistroParadas } from "@/components/RegistroParadas"
import { TopFallasPanel } from "@/components/TopFallasPanel"
import { paradasDemo } from "@/lib/paradasDemoFixture"
import { fechaLocal } from "@/lib/turno"
import { LINEAS_PARADAS } from "@/lib/paradas"

/*
 * Preview sin login ni base (ruta /paradas-demo) del módulo Paradas:
 * la página de Registro, el Panel de Paradas y el bloque "Top Fallas"
 * que va en el Panel de Producción. Datos de prueba del modelo nuevo
 * (PROGRAMADA / NO_PROGRAMADA / OCIOSO). Las páginas reales son
 * Paradas.tsx, PanelParadas.tsx y PanelProduccion.tsx. Se puede borrar.
 */
export default function ParadasDemo() {
  const todas = paradasDemo()
  const hoy = fechaLocal(new Date())
  // para el preview del Panel de Producción: las paradas de HOY, Turno 1
  const delTurno = todas.filter((p) => p.inicio.slice(0, 10) === hoy && p.turnoTipo === "TURNO_1")

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 bg-background px-4 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-warning-foreground uppercase">Preview con datos de prueba</p>
        <h1 className="text-xl font-semibold text-foreground">Paradas — módulo nuevo</h1>
        <p className="text-sm text-muted-foreground">
          Eje <b>Programada</b> / <b>No programada</b> / <b>Ocioso</b>. Programada y Ocioso los carga el supervisor a
          mano; No programada es solo lectura (llega del Sheet de Mantenimiento). Cada tipo trae un <b>tiempo guía</b> y
          el desvío (real − guía) alimenta la eficiencia.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Registrar Paradas — vista del supervisor</h2>
        <RegistroParadas paradas={todas} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Panel de Paradas — dashboard</h2>
        <PanelParadasVista paradas={todas} />
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-4">
        <h2 className="text-sm font-semibold text-foreground">Así se ve en el Panel de Producción — «Top Fallas»</h2>
        <p className="text-xs text-muted-foreground">Bloque colapsable del Panel, con las paradas del turno en curso.</p>
        <div className="mt-1">
          <TopFallasPanel paradas={delTurno} lineas={[...LINEAS_PARADAS]} />
        </div>
      </section>
    </div>
  )
}
