import { Fragment, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { AreaInventario, InventarioApi, ItemInventario } from "@/lib/inventario"
import { cn } from "@/lib/utils"
import { cantidadConUnidad, empaqueDe, fechaHoraCorta, NOMBRE_MOMENTO, saboresDe, textoDiferencia } from "./calculosInventario"
import { HistorialItem } from "./HistorialItem"

interface Props {
  api: InventarioApi
  usuario: string
  area: AreaInventario | null
  items: ItemInventario[]
}

/** Lo que hay ahora, en dos secciones. Un clic en una fila abre su historial. */
export function SaldosInventario(props: Props) {
  return (
    <div className="flex flex-col gap-4">
      <SaldosMateriaPrima {...props} />
      <SaldosEmpaque {...props} />
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{titulo}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">{children}</div>
    </section>
  )
}

const ultimoConteo = (it: ItemInventario | null) =>
  it?.ultimoEn ? `${fechaHoraCorta(it.ultimoEn)} · ${it.ultimoMomento ? NOMBRE_MOMENTO[it.ultimoMomento] : ""} · ${it.ultimoPor ?? "—"}` : "—"

function SaldosMateriaPrima({ api, usuario, area, items }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const sabores = saboresDe(items).filter((s) => s.pulpa.ultimoEn || s.kits.ultimoEn)

  return (
    <Seccion titulo="Materia prima">
      {sabores.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">Todavía no hay conteos de materia prima.</p>
      ) : (
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Sabor</th>
              <th className="px-3 py-2 text-right font-semibold">Pulpa (tambores)</th>
              <th className="px-3 py-2 text-right font-semibold">Kits</th>
              <th className="px-3 py-2 font-semibold">Último conteo</th>
            </tr>
          </thead>
          <tbody>
            {sabores.map((s) => {
              const esteAbierto = abierto === s.saborId
              const reciente = (s.pulpa.ultimoEn ?? "") >= (s.kits.ultimoEn ?? "") ? s.pulpa : s.kits
              return (
                <Fragment key={s.saborId}>
                  <tr
                    className={cn("cursor-pointer border-b border-border/60 hover:bg-muted/40", esteAbierto && "bg-muted/30")}
                    onClick={() => setAbierto(esteAbierto ? null : s.saborId)}
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      <span className="flex items-center gap-1.5">
                        {esteAbierto ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                        {s.nombre}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right">
                      <span className="text-base font-bold">{s.pulpa.saldo !== null ? s.pulpa.saldo.toLocaleString("es-CO") : "—"}</span>
                      {s.pulpa.consumido ? (
                        <span className="block text-[11px] text-muted-foreground">usó {cantidadConUnidad(s.pulpa.consumido, "tambores")}</span>
                      ) : null}
                      {s.pulpa.ultimaDiferencia ? (
                        <span className="block text-[11px] text-warning">{textoDiferencia(s.pulpa.ultimaDiferencia, "tambores")}</span>
                      ) : null}
                    </td>
                    <td className="num px-3 py-2 text-right">{s.kits.saldo !== null ? s.kits.saldo.toLocaleString("es-CO") : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{ultimoConteo(reciente)}</td>
                  </tr>
                  {esteAbierto && (
                    <tr className="border-b border-border/60 bg-muted/20">
                      <td colSpan={4} className="px-4 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pulpa</p>
                        <HistorialItem api={api} usuario={usuario} area={area} item={s.pulpa} />
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kits</p>
                        <HistorialItem api={api} usuario={usuario} area={area} item={s.kits} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </Seccion>
  )
}

function SaldosEmpaque({ api, usuario, area, items }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const empaque = empaqueDe(items)

  return (
    <Seccion titulo="Material de empaque">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Material</th>
            <th className="px-3 py-2 text-right font-semibold">Hay</th>
            <th className="px-3 py-2 font-semibold">Último conteo</th>
          </tr>
        </thead>
        <tbody>
          {empaque.map((it) => {
            const esteAbierto = abierto === it.item
            return (
              <Fragment key={it.item}>
                <tr
                  className={cn("cursor-pointer border-b border-border/60 hover:bg-muted/40", esteAbierto && "bg-muted/30")}
                  onClick={() => setAbierto(esteAbierto ? null : it.item)}
                >
                  <td className="px-3 py-2 font-medium text-foreground">{it.nombre}</td>
                  <td className="num px-3 py-2 text-right">{it.saldo !== null ? cantidadConUnidad(it.saldo, it.unidad) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{ultimoConteo(it)}</td>
                </tr>
                {esteAbierto && (
                  <tr className="border-b border-border/60 bg-muted/20">
                    <td colSpan={3} className="px-4 py-2">
                      <HistorialItem api={api} usuario={usuario} area={area} item={it} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </Seccion>
  )
}
