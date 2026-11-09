import type { CargaPlc, DesgloseLote as Desglose } from "@/lib/preparacion/plc"
import { horaPlanta } from "@/lib/tiempoPlanta"
import { cifra } from "./constantes"

const kitsTexto = (n: number) => `${cifra(n)} ${n === 1 ? "kit" : "kits"}`
const conSigno = (litros: number) => `${litros < 0 ? "−" : "+"}${cifra(Math.abs(litros))} L`
const hora = (iso: string) => horaPlanta(new Date(iso))

function Renglon({ etiqueta, monto, total = false, nota }: { etiqueta: string; monto: string; total?: boolean; nota?: string }) {
  return (
    <div data-renglon className={total ? "flex justify-between gap-2 border-t border-border pt-1 font-semibold" : "flex justify-between gap-2"}>
      <span>
        {etiqueta}
        {nota && <span className="text-muted-foreground"> {nota}</span>}
      </span>
      <span className="num whitespace-nowrap">{monto}</span>
    </div>
  )
}

/** Ajustes del PLC que terminaron con el lote ya liberado: se ven, pero no sumaron. */
export function AjustesNoSumados({ cargaDelLote }: { cargaDelLote: CargaPlc | null }) {
  const noSumados = (cargaDelLote?.ajustes ?? []).filter((a) => a.noSumadoMotivo)
  if (noSumados.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {noSumados.map((a) => (
        <p key={a.id}>{`Ajuste del PLC después de liberar, no se sumó: ${conSigno(a.litros)} · ${hora(a.hechoEn ?? a.iniciadoEn)}`}</p>
      ))}
    </div>
  )
}

/**
 * De dónde salen los litros del lote En Preparación: kits × litros por kit,
 * agua, resto del lote anterior, desvase y cada ajuste (del PLC o a mano),
 * con el total. Si el supervisor corrigió los kits, dice cuántos marcó el PLC.
 */
export function DesgloseLote({
  desglose,
  cargaDelLote,
  ajusteEnCurso,
}: {
  desglose: Desglose
  cargaDelLote: CargaPlc | null
  /** Litros del ajuste que el PLC está metiendo ahora (todavía no se suma). */
  ajusteEnCurso: number | null
}) {
  const ajustes = [...desglose.ajustes].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
  const kitsDelPlc = cargaDelLote?.kits ?? null
  const corregidos = kitsDelPlc != null && cargaDelLote?.kitsUsados != null && cargaDelLote.kitsUsados !== kitsDelPlc

  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/30 p-2 text-xs text-foreground">
      <Renglon
        etiqueta={desglose.litrosPorUnidad != null ? `${kitsTexto(desglose.unidades)} × ${cifra(desglose.litrosPorUnidad)} L` : kitsTexto(desglose.unidades)}
        monto={desglose.litrosPorUnidad != null ? `${cifra(desglose.unidades * desglose.litrosPorUnidad)} L` : "sin dato"}
      />
      {desglose.aguaL > 0 && <Renglon etiqueta="Agua" monto={`${cifra(desglose.aguaL)} L`} />}
      {desglose.restoL > 0 && <Renglon etiqueta="Resto del lote anterior" monto={`${cifra(desglose.restoL)} L`} />}
      {desglose.desvaseL > 0 && <Renglon etiqueta="Desvase" monto={`${cifra(desglose.desvaseL)} L`} />}
      {ajustes.map((a, i) => (
        <Renglon
          key={`${a.creadoEn}-${i}`}
          etiqueta={`Ajuste ${i + 1} · ${a.origen === "PLC" ? "PLC" : "a mano"} · ${hora(a.creadoEn)}`}
          monto={conSigno(a.litros)}
        />
      ))}
      {ajusteEnCurso != null && ajusteEnCurso > 0 && (
        <Renglon etiqueta="Ajuste en curso · PLC" nota="(se suma al terminar)" monto={conSigno(ajusteEnCurso)} />
      )}
      {desglose.totalL != null && <Renglon etiqueta="Total" monto={`${cifra(desglose.totalL)} L`} total />}
      {corregidos && <p className="mt-1 text-muted-foreground">{`El PLC marcó ${kitsTexto(kitsDelPlc)}.`}</p>}
      <AjustesNoSumados cargaDelLote={cargaDelLote} />
    </div>
  )
}
