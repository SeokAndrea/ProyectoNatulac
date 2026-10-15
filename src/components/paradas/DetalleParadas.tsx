import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { duracionMin, esDeMantenimiento, fmtDuracion, nombreLineaParada, type Parada } from "@/lib/paradas"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"
import { Desplegable } from "@/components/paradas/Desplegable"
import { ParadasPorTurno } from "@/components/paradas/ParadasPorTurno"

const ORIGEN: Record<Parada["origen"], { texto: string; variante: "info" | "muted" | "warning" }> = {
  SHEET: { texto: "Sheet de Mantenimiento", variante: "info" },
  MANTENIMIENTO: { texto: "App · con horas", variante: "muted" },
  MANUAL: { texto: "App · supervisor", variante: "muted" },
}

/*
 * Panel de Paradas: cada parada que suma en el período filtrado, con su
 * nombre, código, minutos y de dónde viene (dueña, 2026-10-08: para ver
 * cuáles entran, sobre todo las del Sheet de Mantenimiento). Cerrado por
 * defecto, con el resumen en el título (dueña, 2026-10-15: que se vea limpio
 * al abrir el panel). Un solo día va por turno; varios días, en tabla.
 */
export function DetalleParadas({ paradas, ahora, unDia }: { paradas: Parada[]; ahora: Date; unDia: boolean }) {
  const deMtto = paradas.filter(esDeMantenimiento).length
  const resumen = paradas.length === 0 ? "Sin paradas" : [`${paradas.length} ${paradas.length === 1 ? "parada" : "paradas"}`, deMtto > 0 && `${deMtto} de Mantenimiento`].filter(Boolean).join(" · ")

  return (
    <Desplegable titulo={unDia ? "Paradas del día, por turno" : "Detalle de paradas"} resumen={resumen}>
      {paradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay paradas en este período.</p>
      ) : unDia ? (
        <ParadasPorTurno paradas={paradas} ahora={ahora} />
      ) : (
        <div className="overflow-x-auto">
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
        </div>
      )}
    </Desplegable>
  )
}
