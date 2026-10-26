import { Input } from "@/components/ui/input"
import { ausentismoTotal } from "@/lib/indicadores/calculos"
import { ausentismoVacio, type Ausentismo, type AusentismoGrupo, type DatosMes } from "@/lib/indicadores/tipos"
import { CampoNumero } from "@/components/indicadores/editor/CampoNumero"
import { fmt } from "@/components/indicadores/formato"

/** Pestaña de ausentismo: horas del mes y, por grupo, su %, su parte de las horas perdidas y quién incidió más. */
export function EditorAusentismo({ datos, onCambio }: { datos: DatosMes; onCambio: (d: DatosMes) => void }) {
  const a = datos.ausentismo ?? ausentismoVacio()
  const cambiar = (cambio: Partial<Ausentismo>) => onCambio({ ...datos, ausentismo: { ...a, ...cambio } })
  const cambiarGrupo = (grupo: string, cambio: Partial<AusentismoGrupo>) => cambiar({ grupos: a.grupos.map((g) => (g.grupo === grupo ? { ...g, ...cambio } : g)) })
  const total = ausentismoTotal(a.horasPerdidas, a.horasTeoricas)
  const suma = a.grupos.reduce((s, g) => s + (g.partePerdidas ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <CampoNumero etiqueta="Horas teóricas (planificadas del período)" valor={a.horasTeoricas} onCambio={(v) => cambiar({ horasTeoricas: v })} className="w-64" />
        <CampoNumero etiqueta="Horas perdidas" valor={a.horasPerdidas} onCambio={(v) => cambiar({ horasPerdidas: v })} className="w-44" />
        <span className="pb-2 text-sm text-muted-foreground">
          Ausentismo total: <b className="font-mono text-foreground">{total == null ? "—" : `${fmt(total, 2)} %`}</b>
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {a.grupos.map((g) => (
          <section key={g.grupo} style={{ borderColor: `var(--ind-g${g.grupo})` }} className="flex flex-col gap-2 rounded-xl border-2 bg-card p-3">
            <b className="text-lg">Grupo {g.grupo}</b>
            <div className="grid grid-cols-2 gap-2">
              <CampoNumero etiqueta="% ausentismo" valor={g.porcentaje} sufijo="%" onCambio={(v) => cambiarGrupo(g.grupo, { porcentaje: v })} />
              <CampoNumero etiqueta="% de las horas perdidas" valor={g.partePerdidas} sufijo="%" onCambio={(v) => cambiarGrupo(g.grupo, { partePerdidas: v })} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Quién incidió más
                <Input value={g.quien} onChange={(e) => cambiarGrupo(g.grupo, { quien: e.target.value })} placeholder="Nombre y apellido" />
              </label>
              <CampoNumero etiqueta="Días" entero valor={g.dias} onCambio={(v) => cambiarGrupo(g.grupo, { dias: v })} />
            </div>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Los "% de las horas perdidas" de los 3 grupos suman <b className="font-mono">{fmt(suma, 2)} %</b> (tienen que dar 100 %). Vacío = sin dato.
      </p>
    </div>
  )
}
