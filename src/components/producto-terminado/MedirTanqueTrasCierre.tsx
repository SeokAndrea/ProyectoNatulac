import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import { useAccion } from "@/lib/useAccion"
import { CabeceraFila } from "./CabeceraFila"
import type { AccionesPT } from "./tipos"

/**
 * Tras cerrar una corrida (Terminar / Entregar) se pide medir el tanque de
 * ese lote — así deja de verse "lleno" y no se re-corre. Si quedó en cero,
 * el lote se cierra solo.
 */
export function MedirTanqueTrasCierre({
  corrida,
  nombreLinea,
  tanque,
  preparaciones,
  medirTanque,
  onListo,
}: {
  corrida: Corrida
  nombreLinea: string
  tanque: TanqueRecepcion
  preparaciones: PreparacionRegistro[]
  medirTanque: AccionesPT["medirTanque"]
  onListo: () => void
}) {
  const [valor, setValor] = useState("")
  const { enviando, error, ejecutar } = useAccion()
  const prepTanque = preparaciones.find((p) => p.numeroTanque === tanque.numeroTanque && p.cerradoEn === null)
  const n = Number(valor)
  const valida = valor.trim() !== "" && Number.isFinite(n) && n >= 0

  async function guardar() {
    if (!valida) return
    if (await ejecutar(() => medirTanque(tanque.numeroTanque, n))) onListo()
  }

  return (
    <Card>
      <CabeceraFila
        nombreLinea={nombreLinea}
        lote={corrida.lote}
        derecha={<Badge variant="warning">Medir Tanque {tanque.numeroTanque}</Badge>}
        descripcion="Se cargó el Producto Terminado"
      />
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Mide el Tanque {tanque.numeroTanque} y anota cuántos litros quedaron. Así el tanque deja de verse lleno y no se vuelve a
          correr por error; si quedó en cero, el lote se cierra solo.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`medicion-${corrida.id}`}>Litros en el Tanque {tanque.numeroTanque}</Label>
          <Input
            id={`medicion-${corrida.id}`}
            type="number"
            min={0}
            placeholder="Litros medidos"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          {prepTanque?.volumenActualL != null && (
            <p className="text-xs text-muted-foreground">Teórico ahora: {prepTanque.volumenActualL.toLocaleString("es-CO")} L</p>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={guardar} disabled={!valida || enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Guardar medición
          </Button>
          <Button size="sm" variant="ghost" disabled={enviando} onClick={onListo}>
            No medir ahora
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
