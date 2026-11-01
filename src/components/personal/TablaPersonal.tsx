import { agruparPorNivel } from "@/lib/estructura"
import type { PersonalRegistrado } from "@/lib/personal"
import { cn } from "@/lib/utils"

/** La misma gente del organigrama, en filas y agrupada por nivel. */
export function TablaPersonal({
  personas,
  elegida,
  resaltadas,
  onElegir,
}: {
  personas: PersonalRegistrado[]
  elegida: string | null
  resaltadas: Set<string>
  onElegir: (id: string) => void
}) {
  const grupos = agruparPorNivel(personas)
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold tracking-wide text-foreground uppercase">
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Puesto</th>
            <th className="px-3 py-2">Título</th>
            <th className="px-3 py-2">Usuario</th>
            <th className="px-3 py-2">Cédula</th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.nivel ?? "sin"}>
            <tr className="bg-muted">
              <th colSpan={5} scope="colgroup" className="px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-foreground uppercase">
                {g.nombre} · {g.items.length}
              </th>
            </tr>
            {g.items.map((p) => (
              <tr
                key={p.id}
                data-resaltada={resaltadas.has(p.id) ? "true" : undefined}
                onClick={() => onElegir(p.id)}
                className={cn(
                  "cursor-pointer border-b border-border/60 text-foreground last:border-0 hover:bg-muted/60",
                  elegida === p.id && "bg-muted",
                  resaltadas.has(p.id) && "bg-warning-soft",
                  !p.activo && "opacity-45",
                )}
              >
                <td className="px-3 py-2 font-medium">{p.nombre}</td>
                <td className="px-3 py-2">{p.puesto}</td>
                <td className="px-3 py-2">{p.titulo ?? "—"}</td>
                <td className="px-3 py-2">{p.usuario}</td>
                <td className="px-3 py-2 tabular-nums">{p.cedula ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
