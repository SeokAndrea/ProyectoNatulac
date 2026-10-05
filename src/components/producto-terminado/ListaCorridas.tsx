import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { agruparPorSaborYLote } from "@/lib/agruparProduccion"
import { nombrePorCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import { cn } from "@/lib/utils"
import { infoSabor } from "./calculosPT"
import { FilaProductoTerminado } from "./FilaProductoTerminado"
import type { AccionesPT } from "./tipos"

export interface DatosListaCorridas {
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  lineas: LineaLive[]
  presentaciones: PresentacionLive[]
  acciones: AccionesPT
  /** Turno ya cerrado (gracia o corrección) — solo Paletas/Cajas sueltas, sin Contador ni Terminar/Entregar línea. */
  soloPT?: boolean
}

/**
 * Corridas en 3 niveles — Sabor → Lote → Línea — porque un sabor puede
 * tener varios lotes a lo largo del turno, y un lote puede estar
 * alimentando varias líneas a la vez. Si hay un solo sabor (o lote) se
 * abre solo.
 */
export function ListaCorridas({
  corridas,
  contadores,
  productoTerminado,
  tanques,
  preparaciones,
  lineas,
  presentaciones,
  acciones,
  soloPT = false,
}: DatosListaCorridas) {
  const grupos = agruparPorSaborYLote(corridas)
  const [saborAbierto, setSaborAbierto] = useState<string | null>(grupos.length === 1 ? grupos[0].key : null)
  const [loteAbierto, setLoteAbierto] = useState<string | null>(null)

  const grupoSabor = grupos.find((g) => g.key === saborAbierto) ?? null
  const loteEfectivo = loteAbierto ?? (grupoSabor?.lotes.length === 1 ? grupoSabor.lotes[0].key : null)
  const grupoLote = grupoSabor?.lotes.find((l) => l.key === loteEfectivo) ?? null

  function abrirSabor(key: string) {
    setSaborAbierto((actual) => (actual === key ? null : key))
    setLoteAbierto(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        {grupos.map((g) => {
          const { color, Icono } = infoSabor(g.saborNombre)
          const totalLineas = g.lotes.reduce((a, l) => a + l.corridas.length, 0)
          const abierto = saborAbierto === g.key
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => abrirSabor(g.key)}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-3 py-6 text-center transition-colors",
                abierto ? "border-primary bg-primary/10 text-primary" : "border-foreground/25 bg-muted/30 text-foreground hover:bg-muted/60",
              )}
            >
              <Icono className="size-8" style={{ color: abierto ? undefined : color }} />
              <span className="text-base font-semibold uppercase tracking-wide">{g.saborNombre ?? "Sin sabor"}</span>
              <span className="text-xs text-muted-foreground">
                {g.lotes.length} {g.lotes.length === 1 ? "lote" : "lotes"} · {totalLineas} {totalLineas === 1 ? "línea" : "líneas"}
              </span>
            </button>
          )
        })}
      </div>

      {grupoSabor && (
        <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {grupoSabor.lotes.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLoteAbierto((actual) => (actual === l.key ? null : l.key))}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-6 text-center transition-colors",
                loteEfectivo === l.key ? "border-primary bg-primary/10 text-primary" : "border-foreground/25 bg-muted/30 text-foreground hover:bg-muted/60",
              )}
            >
              <span className="text-base font-semibold uppercase tracking-wide">Lote {l.lote ?? "sin código"}</span>
              <span className="text-xs text-muted-foreground">
                {l.corridas.length} {l.corridas.length === 1 ? "línea" : "líneas"}
              </span>
            </button>
          ))}
        </div>
      )}

      {grupoLote && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {grupoLote.corridas.map((l) => {
            const contadoresCorrida = contadores.filter((c) => c.corridaId === l.id)
            return (
              <FilaProductoTerminado
                key={l.id}
                corrida={l}
                nombreLinea={nombrePorCodigo(lineas, l.linea)}
                contadorActual={contadoresCorrida.reduce((a, c) => a + c.envasesLlenadora, 0)}
                contadorBuenosActual={contadoresCorrida.reduce((a, c) => a + (c.envasesBuenos ?? 0), 0)}
                presentaciones={presentaciones}
                tanques={tanques}
                preparaciones={preparaciones}
                registro={productoTerminado.find((p) => p.corridaId === l.id) ?? null}
                acciones={acciones}
                soloPT={soloPT}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Corridas ya finalizadas: colapsadas por defecto detrás de un toggle, para no tener que scrollear entre ellas para llegar a las que sí necesitan carga. */
export function CorridasCerradas(props: DatosListaCorridas) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`size-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
        {abierto ? "Ocultar" : "Ver"} corridas cerradas ({props.corridas.length})
      </button>
      {abierto && <ListaCorridas {...props} />}
    </div>
  )
}
