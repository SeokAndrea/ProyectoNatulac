import { FastForward } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { LineaCard } from "@/components/lineas/LineaCard"
import { PanelParadasVista } from "@/components/PanelParadasVista"
import { Button } from "@/components/ui/button"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useTiposActivos } from "@/lib/paradasCatalogo"
import { useParadasDemo } from "@/lib/paradasDemo"

/*
 * DEMO (2026-10-06): cómo quedarían las paradas desde Líneas y el Panel de
 * Paradas en vivo, con datos inventados en memoria. No guarda nada. Si se
 * aprueba, se conecta a la base (plan, Fase 2) y esta página se borra.
 */
export default function ParadasDemo() {
  const { lineas, presentaciones, velocidades } = useCatalogosLive()
  const tipos = useTiposActivos()
  const demo = useParadasDemo(tipos)
  const nombreDe = (codigo: string) => lineas.find((l) => l.codigo === codigo)?.nombre ?? codigo.replace("LINEA_", "Línea ")

  return (
    <AppShell title="Paradas en vivo (demo)" description="Datos de muestra: nada de esto se guarda" fullWidth>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft/30 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            Demo: aprieta <b>Parada</b> en una línea, elige el tipo y escribe el comentario. Abajo se ve en el Panel de Paradas.
          </span>
          <Button size="sm" variant="outline" onClick={() => demo.adelantar(15)}>
            <FastForward className="size-3.5" />
            Adelantar 15 min
          </Button>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Líneas</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {demo.corridas.map((c) => (
              <LineaCard
                key={c.id}
                lineaCodigo={c.linea}
                nombreLinea={nombreDe(c.linea)}
                modo="preparacion"
                areaCodigo="ASEPTICO"
                lineaTurno={c}
                corridaEsperandoPt={null}
                lineaEstado={demo.lineasEstado.find((e) => e.linea === c.linea) ?? null}
                tanquesListos={[]}
                presentaciones={presentaciones}
                velocidades={velocidades}
                paradaQueDetiene={null}
                paradaActual={demo.paradaActual(c.id)}
                acciones={demo.acciones}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Panel de Paradas</h2>
          <PanelParadasVista cargarParadas={demo.cargarParadas} estadoLineas={demo.estadoLineas} cargarOee={demo.cargarOee} />
        </section>
      </div>
    </AppShell>
  )
}
