import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ParadasPorTurno } from "@/components/paradas/ParadasPorTurno"
import type { Parada } from "@/lib/paradas"
import type { ParadaDelDia } from "@/lib/resumenDiario"

/** Las paradas que más minutos quitaron en el día y, con "Ver paradas", todas por turno (dueña, 2026-10-14). */
export function ParadasDelDia({ paradas, todas, nombreLinea }: { paradas: ParadaDelDia[]; todas: Parada[]; nombreLinea: (codigo: string) => string }) {
  const [verTodas, setVerTodas] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paradas que más tiempo quitaron</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin paradas registradas en esta jornada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parada</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Veces</TableHead>
                <TableHead className="text-right">Min</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paradas.map((p) => (
                <TableRow key={`${p.codigo ?? p.nombre}|${p.lineaCodigo}`}>
                  <TableCell className="whitespace-normal">
                    {p.nombre}
                    {p.codigo && <span className="text-muted-foreground"> ({p.codigo})</span>}
                  </TableCell>
                  <TableCell>{nombreLinea(p.lineaCodigo)}</TableCell>
                  <TableCell className="num text-right">{p.veces}</TableCell>
                  <TableCell className="num text-right">{p.minutos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {todas.length > 0 && (
          <>
            <Button variant="outline" size="sm" className="gap-1 self-start" aria-expanded={verTodas} onClick={() => setVerTodas((v) => !v)}>
              <ChevronDown className={`size-4 transition-transform ${verTodas ? "rotate-180" : ""}`} />
              {verTodas ? "Ocultar paradas" : `Ver paradas (${todas.length})`}
            </Button>
            {verTodas && <ParadasPorTurno paradas={todas} />}
          </>
        )}
      </CardContent>
    </Card>
  )
}
