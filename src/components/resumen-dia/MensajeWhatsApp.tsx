import { useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import { ItemValidar } from "@/components/resumen-dia/ItemValidar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { nombrePresentacion, pasosCambioPresentacion, type ItemDia, type ItemTurno } from "@/lib/resumenDia"

type Resultado = { ok: true } | { ok: false; error: string }
const miles = (n: number) => n.toLocaleString("es-CO")

/*
 * Solo la analista (permiso VALIDAR): cada sabor + presentación se confirma
 * o se corrige POR TURNO (dueña, 2026-10-08); el número oficial del día es
 * la suma de los turnos y el mensaje se arma solo, listo para WhatsApp.
 */
export function MensajeWhatsApp({
  dia,
  turnos,
  etiquetaTurno,
  volumenes,
  mensaje,
  validar,
  onCambio,
}: {
  dia: ItemDia[]
  turnos: ItemTurno[]
  /** "T1 · Javier Bello" */
  etiquetaTurno: (turnoId: string) => string
  volumenes: number[]
  mensaje: string
  validar: (turnoId: string, saborNombre: string, volumenMl: number, cajas: number | null, nota: string) => Promise<Resultado>
  onCambio: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const totalOficial = dia.reduce((a, i) => a + i.cajasOficiales, 0)
  const revisadas = turnos.filter((t) => t.estado !== "PENDIENTE").length

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
        {turnos.length > 0 && (
          <Badge variant={revisadas === turnos.length ? "default" : "outline"}>
            {revisadas} de {turnos.length} revisadas
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          {dia.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin producción registrada en esta jornada.</p>
          ) : (
            <>
              {dia.map((d) => {
                const propios = turnos.filter((t) => t.saborNombre === d.saborNombre && t.volumenMl === d.volumenMl)
                return (
                  <div key={`${d.saborNombre}|${d.volumenMl}`} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold text-foreground">
                        {d.saborNombre} · {nombrePresentacion(d.volumenMl)}
                      </span>
                      <span className="num font-bold text-foreground">{miles(d.cajasOficiales)} cajas</span>
                    </div>
                    {propios.map((t) => (
                      <ItemValidar
                        key={`${t.turnoId}|${t.saborNombre}|${t.volumenMl}`}
                        item={t}
                        etiqueta={etiquetaTurno(t.turnoId)}
                        volumenes={volumenes}
                        guardar={(cajas, nota) => validar(t.turnoId, t.saborNombre, t.volumenMl, cajas, nota)}
                        moverA={async (volumenMl, cajas, nota) => {
                          // Se cargó en una presentación y era otra: en ESTE turno la fila queda en 0 y el destino suma las cajas.
                          const delTurno = turnos.filter((x) => x.turnoId === t.turnoId)
                          for (const paso of pasosCambioPresentacion(delTurno, t, volumenMl, cajas, nota)) {
                            const r = await validar(t.turnoId, t.saborNombre, paso.volumenMl, paso.cajas, paso.nota)
                            if (!r.ok) return r
                          }
                          return { ok: true }
                        }}
                        onCambio={onCambio}
                      />
                    ))}
                  </div>
                )
              })}
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
