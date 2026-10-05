import { useEffect, useState } from "react"
import { nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { ajustesSemielaboradoTurno, type AjusteSemielaborado } from "@/lib/panelProduccion"
import type { DesvaseLoteRegistro, PreparacionRegistro, TransferenciaRegistro } from "@/lib/preparacion/tipos"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { desglosarCalculos } from "@/lib/reportes"

/**
 * Los mismos números que verifica src/lib/reportes/pruebas.test.ts, pero
 * sobre el turno que se está viendo: envases de llenadora vs. Producto
 * Terminado por corrida, litros consumidos vs. producidos, cajas reales
 * vs. esperadas. Se muestra en Aséptico y en el Área de Pruebas.
 */
export function DesgloseCalculosPanel({
  turnoId,
  horaInicio,
  estado,
  horaFin,
  preparaciones,
  corridas,
  productoTerminado,
  contadores,
  transferencias,
  desvases,
}: {
  turnoId: string
  horaInicio: string
  estado: "ABIERTO" | "CERRADO"
  horaFin: string | null
  preparaciones: PreparacionRegistro[]
  corridas: Corrida[]
  productoTerminado: ProductoTerminadoRegistro[]
  contadores: ContadorRegistro[]
  transferencias: TransferenciaRegistro[]
  desvases: DesvaseLoteRegistro[]
}) {
  const { lineas, presentaciones, cargando } = useCatalogosLive()
  const d = desglosarCalculos(
    turnoId,
    horaInicio,
    estado,
    horaFin,
    preparaciones,
    corridas,
    productoTerminado,
    contadores,
    presentaciones,
    transferencias,
    desvases,
  )
  const [ajustes, setAjustes] = useState<AjusteSemielaborado[]>([])

  useEffect(() => {
    let vivo = true
    ajustesSemielaboradoTurno(turnoId).then((a) => {
      if (vivo) setAjustes(a)
    })
    return () => {
      vivo = false
    }
  }, [turnoId])

  const totalAjuste = ajustes.reduce((a, x) => a + x.diferencia, 0)

  const fmt = (n: number | null, suf = "") => (n === null ? "—" : `${n.toLocaleString("es-CO")}${suf}`)
  const fmtSigno = (n: number, suf = "") => `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("es-CO")}${suf}`

  if (cargando) {
    return <p className="text-sm text-muted-foreground">Cargando catálogos…</p>
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Horas transcurridas del turno: <span className="num font-semibold text-foreground">{d.horasTranscurridas}</span>{" "}
        {estado === "CERRADO" ? "(hasta la hora de cierre)" : "(hasta ahora)"}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3 font-semibold">Corrida</th>
              <th className="py-1.5 pr-3 font-semibold">Lote</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Env. llenadora</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Env. prod. term.</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Merma envase</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Cajas reales</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Cajas esperadas</th>
            </tr>
          </thead>
          <tbody>
            {d.porCorrida.map((c) => (
              <tr key={c.corridaId} className="border-b border-border/60">
                <td className="py-1.5 pr-3">
                  {nombrePorCodigo(lineas, c.linea)}
                  {c.presentacionMl ? <span className="text-muted-foreground"> · {c.presentacionMl} ml</span> : null}
                  {!c.activa ? <span className="text-muted-foreground"> · finalizada</span> : null}
                </td>
                <td className="py-1.5 pr-3">{c.lote ?? "—"}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.envasesLlenadora)}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.envasesProductoTerminado)}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.mermaEnvasePct, " %")}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.cajasReales)}</td>
                <td className="num py-1.5 pr-3 text-right">{fmt(c.cajasEsperadas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <DesgloseDato etiqueta="Merma de envase — turno" valor={fmt(d.mermaEnvaseTurnoPct, " %")} formula="1 − (Σ envases prod. term. ÷ Σ envases llenadora)" />
        <DesgloseDato
          etiqueta="Consumo de semielaborado del turno"
          valor={fmt(d.volumenInicial, " L")}
          formula="Σ (volumen del lote al inicio del turno − al final)"
        />
        <DesgloseDato
          etiqueta="Litros de Producto Terminado del turno"
          valor={fmt(d.litrosProducidos, " L")}
          formula="Σ litros de Producto Terminado de todas las corridas del turno"
        />
        <DesgloseDato
          etiqueta="Rendimiento del semielaborado"
          valor={d.rendimientoTurnoPct === null ? "—" : `${Math.round((100 - d.rendimientoTurnoPct) * 100) / 100} %`}
          formula="litros de Producto Terminado del turno ÷ consumo del turno"
        />
        <DesgloseDato
          etiqueta="Merma de semielaborado"
          valor={d.rendimientoTurnoPct === null ? "—" : fmt(d.rendimientoTurnoPct, " %")}
          formula="1 − (Producto Terminado del turno ÷ consumo del turno)"
        />
        {ajustes.length > 0 && (
          <DesgloseDato
            etiqueta="Ajuste teórico vs. real"
            valor={fmtSigno(totalAjuste, " L")}
            formula="correcciones manuales de volumen de lote (negativo = litros que faltaron)"
          />
        )}
        <DesgloseDato
          etiqueta="Cajas reales / esperadas"
          valor={`${fmt(d.cajasRealesTotal)} / ${fmt(d.cajasEsperadasTotal)}`}
          formula="corridas activas: velocidad ÷ envases por caja × horas"
        />
        <DesgloseDato etiqueta="Cumplimiento de meta" valor={fmt(d.cumplimientoTurnoPct, " %")} formula="cajas reales ÷ cajas esperadas" />
      </div>

      {ajustes.length > 0 && (
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Correcciones de volumen (teórico → real)</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-xs">
            {ajustes.map((a, i) => (
              <li key={i} className="text-foreground">
                {a.sabor}
                {a.lote ? ` · Lote ${a.lote}` : ""}: {Math.round(a.volumenTeorico).toLocaleString("es-CO")} L →{" "}
                {Math.round(a.volumenReal).toLocaleString("es-CO")} L{" "}
                <span className={a.diferencia < 0 ? "text-danger" : "text-muted-foreground"}>({fmtSigno(a.diferencia, " L")})</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {a.usuarioNombre ?? "—"} · {new Date(a.creadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DesgloseDato({ etiqueta, valor, formula }: { etiqueta: string; valor: string; formula: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="num mt-1 text-xl font-bold leading-none text-foreground">{valor}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{formula}</p>
    </div>
  )
}
