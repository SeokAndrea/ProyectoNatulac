import { useEffect, useRef, useState } from "react"
import { Beaker, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { LineaCodigo } from "@/lib/catalogos"
import { MOTIVOS_CIP, type Corrida, type MotivoCip } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"
import { Input } from "@/components/ui/input"
import { BuscadorParada } from "@/components/catalogo-fallas/BuscadorParada"
import { leerFallasDeParadas, type FallasDeParada } from "@/lib/catalogoFallas/paradas"
import { ahoraPlanta, conSegundos, sumarMinutos } from "@/components/paradas/FormCompletarParada"
import { nuevaOperacionParada } from "@/lib/operacionParada"

const nombreMotivo = (m: MotivoCip) => MOTIVOS_CIP.find((x) => x.codigo === m)?.nombre ?? m

/**
 * Formulario de CIP, paso a paso (docs/plan-lineas-pt-paradas.md, sección C):
 * motivo → (con corrida) ¿el lote sigue? → descripción opcional →
 * confirmar dos veces. Cada respuesta reemplaza a su pregunta (lo
 * respondido queda en una línea); Cancelar borra todo.
 */
export function FormCipLinea({
  lineaCodigo,
  corrida,
  areaCodigo,
  paradas = [],
  ponerEnCip,
  onCerrar,
}: {
  lineaCodigo: LineaCodigo
  /** Corrida corriendo o en pausa que entra al CIP; null = línea sin corrida. */
  corrida: Corrida | null
  areaCodigo?: string | null
  paradas?: { id: string; nombre: string; tipo?: string | null }[]
  ponerEnCip: AccionesLinea["ponerEnCip"]
  onCerrar: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoCip | null>(null)
  const [loteSigue, setLoteSigue] = useState<boolean | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [confirmar, setConfirmar] = useState(false)
  const [inicioReal, setInicioReal] = useState("")
  const [empezoAntes, setEmpezoAntes] = useState(false)
  const [fallaElegida, setFallaElegida] = useState<string>()
  const [paradaElegida, setParadaElegida] = useState("")
  const [fallas, setFallas] = useState<Map<string, FallasDeParada> | null>(null)
  const operacion = useRef<{ datos: string; id: string } | null>(null)
  const { enviando, error, ejecutar } = useAccion()

  const lote = corrida?.lote ?? ""
  const ids = paradas.map((p) => p.id).join(",")
  useEffect(() => {
    if (motivo !== "FALLA_MECANICA" || !ids) return
    let vivo = true
    void leerFallasDeParadas(ids.split(",")).then((datos) => { if (vivo) setFallas(datos) })
    return () => { vivo = false }
  }, [ids, motivo])
  const candidatas = paradas.filter((p) => motivo === "FALLA_MECANICA"
    ? fallas?.has(p.id)
    : motivo === "SUMINISTRO_ELECTRICO" && p.tipo === "FALLA_SUMINISTRO_ELECTRICO")
  const parada = candidatas.length === 1 ? candidatas[0] : candidatas.find((p) => p.id === paradaElegida)
  const diagnostico = parada && fallas?.get(parada.id)
  const fallaId = motivo === "FALLA_MECANICA" ? diagnostico?.fallaFinalId ?? diagnostico?.fallaProduccionId ?? fallaElegida : undefined
  const listo = motivo !== null && (!corrida || loteSigue !== null)
    && (!empezoAntes || Boolean(inicioReal && inicioReal <= ahoraPlanta()))
    && (candidatas.length < 2 || Boolean(parada))
    && (motivo !== "FALLA_MECANICA" || Boolean(fallaId))

  async function enviar() {
    if (!motivo || !listo || enviando) return
    if (!confirmar) {
      setConfirmar(true)
      return
    }
    const datos = {
        linea: lineaCodigo,
        motivo,
        descripcion,
        corridaId: corrida?.id ?? null,
        loteSigue: corrida ? loteSigue : null,
        inicioReal: empezoAntes ? conSegundos(inicioReal) : null,
        fallaId,
        paradaId: parada?.id,
    }
    const clave = JSON.stringify(datos)
    if (operacion.current?.datos !== clave) operacion.current = { datos: clave, id: nuevaOperacionParada() }
    const operacionId = operacion.current.id
    const ok = await ejecutar(() => ponerEnCip({ ...datos, operacionId }))
    if (ok) onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-foreground">Poner en CIP</p>
      {motivo === null ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Motivo del CIP</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_CIP.map((m) => (
              <Button key={m.codigo} size="sm" variant="outline" onClick={() => setMotivo(m.codigo)}>
                {m.nombre}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Motivo: <span className="font-medium text-foreground">{nombreMotivo(motivo)}</span>
        </p>
      )}

      {candidatas.length > 1 && (
        <label className="grid gap-1 text-xs">
          Parada que originó el CIP
          <select value={paradaElegida} onChange={(e) => { setParadaElegida(e.target.value); setConfirmar(false) }}>
            <option value="">Elige una parada</option>
            {candidatas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
      )}
      {parada && <p className="text-xs">Se conserva la parada «{parada.nombre}».</p>}
      {motivo === "FALLA_MECANICA" && candidatas.length === 0 && (!ids || fallas) && (
        <BuscadorParada lineaCodigo={lineaCodigo} area={areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"}
          presentacionMl={corrida ? Number(corrida.presentacion) : null} soloFallas
          onElegir={(e) => { setFallaElegida(e?.falla?.falla.id); setConfirmar(false) }} />
      )}

      {corrida && motivo !== null && (
        loteSigue === null ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">¿El Lote {lote} sigue después del CIP?</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLoteSigue(true)}>
                Sí, sigue
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLoteSigue(false)}>
                No, termina aquí
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Lote {lote}: <span className="font-medium text-foreground">{loteSigue ? "sigue después del CIP" : "termina aquí"}</span>
          </p>
        )
      )}

      {motivo !== null && (empezoAntes ? (
        <label className="grid gap-1 text-xs">
          Inicio real del lavado
          <Input type="datetime-local" value={inicioReal} max={ahoraPlanta()}
            onChange={(e) => { setInicioReal(e.target.value); setConfirmar(false) }} />
          {inicioReal && <span>Fin previsto {sumarMinutos(inicioReal, 180).replace("T", " ")}</span>}
        </label>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => {
          setEmpezoAntes(true)
          setInicioReal(ahoraPlanta())
          setConfirmar(false)
        }}>El lavado empezó antes</Button>
      ))}

      {listo && (
        <>
          <Textarea
            value={descripcion}
            onChange={(e) => {
              setDescripcion(e.target.value.slice(0, 140))
              setConfirmar(false)
            }}
            maxLength={140}
            rows={2}
            placeholder="Descripción breve (opcional: ya está el motivo)"
            className="text-sm"
          />
          {confirmar && (
            <p className="rounded-md bg-muted/60 p-2 text-xs text-foreground">
              {corrida
                ? loteSigue
                  ? `La línea queda en CIP. El Lote ${lote} queda en pausa.`
                  : `La corrida del Lote ${lote} se detiene y queda esperando su Producto Terminado.`
                : "La línea queda en CIP."}{" "}
              El lavado se cuenta desde su hora de inicio. ¿Confirmas?
            </p>
          )}
        </>
      )}

      <MensajeError error={error} />
      <div className="flex flex-wrap gap-2">
        {listo && (
          <Button size="sm" variant={confirmar ? "destructive" : "default"} onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
            {confirmar ? "Sí, poner en CIP" : "Poner en CIP"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
