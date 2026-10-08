import { useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import { ItemValidar } from "@/components/resumen-dia/ItemValidar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { pasosCambioPresentacion, type ItemDia } from "@/lib/resumenDia"

type Resultado = { ok: true } | { ok: false; error: string }
const miles = (n: number) => n.toLocaleString("es-CO")

/*
 * Solo la analista (permiso VALIDAR): cada sabor + presentación se confirma
 * o se corrige (número oficial del día) y el mensaje se arma solo, listo
 * para copiar y pegar en WhatsApp. Mismo funcionamiento que tenía el
 * Resumen del Día.
 */
export function MensajeWhatsApp({
  items,
  volumenes,
  mensaje,
  validar,
  onCambio,
}: {
  items: ItemDia[]
  volumenes: number[]
  mensaje: string
  validar: (saborNombre: string, volumenMl: number, cajas: number | null, nota: string) => Promise<Resultado>
  onCambio: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const totalOficial = items.reduce((a, i) => a + i.cajasOficiales, 0)
  const validadas = items.filter((i) => i.estado !== "PENDIENTE").length

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
    } catch {
      // Sin permiso de portapapeles: se selecciona el texto para copiarlo a mano.
      textoRef.current?.select()
      document.execCommand("copy")
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <Card id="mensaje-whatsapp">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Mensaje para WhatsApp</CardTitle>
        {items.length > 0 && (
          <Badge variant={validadas === items.length ? "default" : "outline"}>
            {validadas} de {items.length} revisadas
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin producción registrada en esta jornada.</p>
          ) : (
            <>
              {items.map((i) => (
                <ItemValidar
                  key={`${i.saborNombre}|${i.volumenMl}`}
                  item={i}
                  volumenes={volumenes}
                  guardar={(cajas, nota) => validar(i.saborNombre, i.volumenMl, cajas, nota)}
                  moverA={async (volumenMl, cajas, nota) => {
                    // Se cargó en una presentación y era otra: esta fila queda en 0 y el destino suma las cajas.
                    for (const paso of pasosCambioPresentacion(items, i, volumenMl, cajas, nota)) {
                      const r = await validar(i.saborNombre, paso.volumenMl, paso.cajas, paso.nota)
                      if (!r.ok) return r
                    }
                    return { ok: true }
                  }}
                  onCambio={onCambio}
                />
              ))}
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="font-semibold text-foreground">Total del día</span>
                <span className="num font-bold text-foreground">{miles(totalOficial)} cajas</span>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Textarea ref={textoRef} readOnly value={mensaje} rows={Math.min(18, mensaje.split("\n").length + 1)} className="text-sm" />
          <Button className="self-start" onClick={copiar}>
            {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiado ? "Copiado" : "Copiar mensaje"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
