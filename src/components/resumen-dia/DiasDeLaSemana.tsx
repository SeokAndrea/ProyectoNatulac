import { Desplegable } from "@/components/Desplegable"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { textoBombonas } from "@/lib/nitrogeno"
import type { ResumenDeDia } from "@/lib/resumenSemana"

const miles = (n: number) => n.toLocaleString("es-CO")

/** Vista Semana: una fila por día con las cajas oficiales, si la analista lo validó y el nitrógeno consumido. Tocar el día abre su resumen. */
export function DiasDeLaSemana({ dias, onVerDia }: { dias: ResumenDeDia[]; onVerDia: (fecha: string) => void }) {
  const total = dias.reduce((a, d) => a + d.cajas, 0)
  const consumos = dias.map((d) => d.nitrogenoConsumo).filter((c): c is number => c !== null)
  const sinValidar = dias.filter((d) => d.sinValidar > 0).length
  return (
    <Desplegable
      titulo="Días de la semana"
      inicial
      resumen={
        sinValidar > 0 ? (
          <span className="text-warning-foreground">
            {sinValidar} {sinValidar === 1 ? "día sin validar" : "días sin validar"}
          </span>
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Día</TableHead>
            <TableHead className="text-right">Cajas</TableHead>
            <TableHead>Validación</TableHead>
            <TableHead className="text-right">Nitrógeno</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dias.map((d) => (
            <TableRow key={d.fecha}>
              <TableCell>
                {d.futuro ? (
                  <span className="text-muted-foreground">{d.etiqueta}</span>
                ) : (
                  <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => onVerDia(d.fecha)}>
                    {d.etiqueta}
                  </button>
                )}
              </TableCell>
              <TableCell className="num text-right">{d.cajas > 0 ? miles(d.cajas) : "--"}</TableCell>
              <TableCell>
                {d.futuro || d.items === 0 ? (
                  <span className="text-muted-foreground">--</span>
                ) : d.sinValidar > 0 ? (
                  <Badge variant="warning">Sin validar ({d.sinValidar})</Badge>
                ) : (
                  <Badge variant="success">Validado</Badge>
                )}
              </TableCell>
              <TableCell className="num text-right">{d.nitrogenoConsumo !== null ? textoBombonas(d.nitrogenoConsumo) : "--"}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell>Semana</TableCell>
            <TableCell className="num text-right">{miles(total)}</TableCell>
            <TableCell />
            <TableCell className="num text-right">{consumos.length > 0 ? textoBombonas(consumos.reduce((a, c) => a + c, 0)) : "--"}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Desplegable>
  )
}
