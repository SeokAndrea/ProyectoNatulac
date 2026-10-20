import { Desplegable } from "@/components/Desplegable"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LIMITE_MERMA } from "@/lib/turno"
import type { LineaDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")
const LIMITE_PCT = LIMITE_MERMA * 100

/** Por línea: cajas del día, merma de envase del día (todos los lotes juntos) y minutos de parada. */
export function LineasDelDia({ lineas }: { lineas: LineaDelDia[] }) {
  const altas = lineas.filter((l) => l.mermaPct !== null && l.mermaPct > LIMITE_PCT).length
  return (
    <Desplegable titulo="Por línea" resumen={altas > 0 ? <span className="font-semibold text-destructive">{altas} con merma alta</span> : undefined}>
      <span className="text-xs text-muted-foreground">Merma de envase del día · límite {LIMITE_PCT} %</span>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Línea</TableHead>
            <TableHead className="text-right">Cajas</TableHead>
            <TableHead className="text-right">Merma</TableHead>
            <TableHead className="text-right">Paradas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineas.map((l) => (
            <TableRow key={l.codigo}>
              <TableCell>{l.nombre}</TableCell>
              <TableCell className="num text-right">{l.cajas > 0 ? miles(l.cajas) : "--"}</TableCell>
              <TableCell className={`num text-right ${l.mermaPct !== null && l.mermaPct > LIMITE_PCT ? "font-semibold text-destructive" : ""}`}>
                {l.mermaPct !== null ? `${String(l.mermaPct).replace(".", ",")} %` : "--"}
              </TableCell>
              <TableCell className="num text-right">{l.paradasMin > 0 ? `${l.paradasMin} min` : "--"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Desplegable>
  )
}
