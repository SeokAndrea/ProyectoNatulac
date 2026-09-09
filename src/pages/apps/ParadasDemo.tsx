import { ParadasLista } from "@/components/ParadasLista"
import { TopFallasPanel } from "@/components/TopFallasPanel"
import { paradasDemo } from "@/lib/paradasDemoFixture"
import { fechaLocal } from "@/lib/turno"
import { LINEAS_PARADAS } from "@/lib/paradas"

/*
 * Preview sin login ni base (ruta /paradas-demo) de la página Paradas +
 * el bloque "Top Fallas" que va en el Panel de Producción. Datos de
 * prueba de un export real del Sheet de Mantenimiento. Las páginas
 * reales son Paradas.tsx y PanelProduccion.tsx; esto sirve para iterar
 * el diseño sin Supabase. Se puede borrar.
 */
export default function ParadasDemo() {
  const todas = paradasDemo()
  const hoy = fechaLocal(new Date())
  // para el preview del Panel: las paradas de HOY, Turno 3 (el que más suele tener)
  const delTurno = todas.filter((p) => p.inicio.slice(0, 10) === hoy && p.turnoTipo === "TURNO_3")

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 bg-background px-4 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-warning-foreground uppercase">Preview con datos de prueba</p>
        <h1 className="text-xl font-semibold text-foreground">Paradas — vista de Mantenimiento</h1>
        <p className="text-sm text-muted-foreground">
          Downtime de las líneas. 3 categorías: <b>Operacional</b> y <b>Externa</b> (las carga el supervisor) y{" "}
          <b>Mecánica</b> (Mantenimiento, del Sheet). Filtro por fecha / categoría / línea / equipo, frecuencia por código de
          subsistema, tendencia y el detalle de cada parada. La duración la calcula el sistema (fin − inicio); un corte de
          luz asume 180 min por el CIP forzado.
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-4">
        <h2 className="text-sm font-semibold text-foreground">Así se ve en el Panel de Producción — «Top Fallas»</h2>
        <p className="text-xs text-muted-foreground">Bloque colapsable del Panel, con las paradas del turno en curso.</p>
        <div className="mt-1">
          <TopFallasPanel paradas={delTurno} lineas={[...LINEAS_PARADAS]} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Página completa</h2>
        <ParadasLista paradas={todas} presetInicial="DIAS_7" />
      </section>
    </div>
  )
}
