import { PenLine } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Corrida } from "@/lib/produccion/tipos"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import { CabeceraFila } from "./CabeceraFila"

/** Ya cerrada (Terminó Corrida o Entregada): solo lectura. Sin PT todavía (ej. entregada sola en el cambio de turno) se ofrece cargarlo; con PT, corregirlo. */
export function VistaCorridaCerrada({
  corrida,
  nombreLinea,
  presentacionNombre,
  registro,
  contadorActual,
  deltaEnvases,
  onEditar,
}: {
  corrida: Corrida
  nombreLinea: string
  presentacionNombre: string
  registro: ProductoTerminadoRegistro | null
  contadorActual: number
  /** |buenos − envases del PT|, null si falta alguno. */
  deltaEnvases: number | null
  onEditar: () => void
}) {
  return (
    <Card>
      <CabeceraFila nombreLinea={nombreLinea} lote={corrida.lote} derecha={<Badge variant="muted">Cerrada</Badge>} descripcion={presentacionNombre} />
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Contador acumulado</p>
            <p className="font-medium text-foreground">{contadorActual.toLocaleString("es-CO")} envases</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paletas · Cajas sueltas</p>
            <p className="font-medium text-foreground">{registro ? `${registro.paletas} · ${registro.cajasSueltas}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Litros producidos</p>
            <p className="font-medium text-foreground">{(registro?.litrosProducidos ?? 0).toLocaleString("es-CO")} L</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estado</p>
            <p className="font-medium text-foreground">
              {corrida.entregadaEn
                ? `${corrida.entregaAutomatica ? "Entregada sola (cambio de turno)" : "Entregada"} a las ${horaCortaPlanta(corrida.entregadaEn, corrida.entregadaEn)}`
                : "Sabor terminado"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Δ envases (buenos vs. PT)</p>
            <p className="font-medium text-foreground">{deltaEnvases !== null ? deltaEnvases.toLocaleString("es-CO") : "—"}</p>
          </div>
        </div>

        <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={onEditar}>
          <PenLine className="size-3.5" />
          {registro ? "Editar un error" : "Cargar Producto Terminado"}
        </Button>
      </CardContent>
    </Card>
  )
}
