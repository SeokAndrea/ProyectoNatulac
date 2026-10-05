import { Grid3x3 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { nombreGrupo } from "@/lib/catalogos"
import type { FilaEstadistica } from "@/lib/estadisticas"

/** Matriz supervisor × grupo: litros producidos, con intensidad de color según el máximo de la matriz. */
export function MatrizGrupoSupervisor({ filas }: { filas: FilaEstadistica[] }) {
  const grupos = [...new Set(filas.map((f) => f.grupo))].sort((a, b) => nombreGrupo(a).localeCompare(nombreGrupo(b)))

  const supervisores = [...new Set(filas.map((f) => f.supervisorUsuario))]
    .map((usuario) => {
      const filasSup = filas.filter((f) => f.supervisorUsuario === usuario)
      return {
        usuario,
        nombre: filasSup[0]?.supervisorNombre ?? usuario,
        total: filasSup.reduce((a, f) => a + f.litrosProducidos, 0),
        porGrupo: Object.fromEntries(
          grupos.map((g) => [g, filasSup.filter((f) => f.grupo === g).reduce((a, f) => a + f.litrosProducidos, 0)]),
        ) as Record<string, number>,
      }
    })
    .sort((a, b) => b.total - a.total)

  const maxCelda = Math.max(1, ...supervisores.flatMap((s) => grupos.map((g) => s.porGrupo[g] ?? 0)))

  return (
    <Card className="shadow-panel gap-0 overflow-hidden border-border py-0">
      <div className="border-b border-border/70 bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Grid3x3 className="size-4 text-primary" />
          Matriz supervisor × grupo
        </p>
        <p className="mt-1 text-xs text-muted-foreground/80">Litros producidos por cruce; más intenso = más volumen.</p>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[520px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Supervisor</th>
              {grupos.map((g) => (
                <th key={g} className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {nombreGrupo(g)}
                </th>
              ))}
              <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {supervisores.map((s) => (
              <tr key={s.usuario}>
                <td className="truncate pr-2 text-sm font-medium text-foreground">{s.nombre}</td>
                {grupos.map((g) => {
                  const v = s.porGrupo[g] ?? 0
                  const intensidad = Math.round((v / maxCelda) * 100)
                  return (
                    <td key={g} className="p-0">
                      <div
                        className="num grid h-10 place-items-center rounded-lg border border-border/60 text-xs font-semibold text-foreground transition-colors duration-300"
                        style={{
                          backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(intensidad * 0.55)}%, var(--background))`,
                        }}
                        title={`${s.nombre} · ${nombreGrupo(g)}: ${v.toLocaleString("es-CO")} L`}
                      >
                        {v > 0 ? v.toLocaleString("es-CO") : "·"}
                      </div>
                    </td>
                  )
                })}
                <td className="num pl-2 text-right text-sm font-bold text-foreground">{s.total.toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
