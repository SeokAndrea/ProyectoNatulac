import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { duracionMin, fmtDuracion, nombreLineaParada, type Parada } from "@/lib/paradas"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"

const ORIGEN: Record<Parada["origen"], { texto: string; variante: "info" | "muted" | "warning" }> = {
  SHEET: { texto: "Sheet de Mantenimiento", variante: "info" },
  MANTENIMIENTO: { texto: "App · con horas", variante: "muted" },
  MANUAL: { texto: "App · supervisor", variante: "muted" },
}

/*
 * Panel de Paradas: cada parada que suma en el período filtrado, con su
 * nombre, código, minutos y de dónde viene (dueña, 2026-10-08: para ver
 * cuáles entran, sobre todo las del Sheet de Mantenimiento).
 */
export function DetalleParadas({ paradas, ahora }: { paradas: Parada[]; ahora: Date }) {
  const [abierto, setAbierto] = useState(false)
  const delSheet = paradas.filter((p) => p.origen === "SHEET").length

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-between gap-2 text-left"
        aria-expanded={abierto}
      >
        <span className="text-sm font-semibold text-foreground">
          Detalle de paradas ({paradas.length}
          {delSheet > 0 ? ` · ${delSheet} del Sheet` : ""})
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto &&
        (paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay paradas en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead>Parada</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead>Viene de</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paradas.map((p) => {
                const codigo = codigoDeParadaLive(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="num whitespace-nowrap">
                      <span className="text-muted-foreground">{p.inicio.slice(8, 10)}/{p.inicio.slice(5, 7)} </span>
                      {p.inicio.slice(11, 16)}
                      {p.fin ? `–${p.fin.slice(11, 16)}` : "–…"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{nombreLineaParada(p.lineaCodigo)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {p.tipoNombre}
                      {codigo && <span className="text-muted-foreground"> ({codigo})</span>}
                      {p.nota && <div className="text-xs text-muted-foreground">{p.nota}</div>}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{p.pendiente ? "Sin completar" : p.fin ? fmtDuracion(duracionMin(p, ahora)) : "en curso"}</TableCell>
                    <TableCell>
                      <Badge variant={ORIGEN[p.origen].variante}>{ORIGEN[p.origen].texto}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ))}
    </section>
  )
}
