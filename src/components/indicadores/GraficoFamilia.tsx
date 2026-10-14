import { capital, nombreMes, type PuntoSerie } from "@/lib/indicadores/calculos"
import { useTamano } from "@/components/indicadores/useTamano"
import { fmt } from "@/components/indicadores/formato"

/**
 * Rendimiento de un producto en barras (3 meses) contra el 100 %. El eje
 * arranca en 90 % (o más abajo si hace falta): desde 0 % no se verían las
 * diferencias. Un mes sin dato es un hueco punteado con "—".
 */
export function GraficoFamilia({ serie }: { serie: PuntoSerie[] }) {
  const { ref, ancho: W, alto: H } = useTamano<HTMLDivElement>()
  const ml = 34, mr = 8, mt = 22, mb = 24
  const valores = serie.flatMap((p) => (p.valor == null ? [] : [p.valor]))
  const lo = Math.min(90, Math.floor(Math.min(100, ...valores) / 5) * 5 - 5)
  const hi = 100.6
  const y = (v: number) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb)
  const paso = (W - ml - mr) / serie.length
  const bw = Math.min(64, paso * (paso < 90 ? 0.74 : 0.56))
  const letra = (elegido: boolean) => Math.min(elegido ? 16 : 13, bw / 3.5)

  return (
    <div ref={ref} className="relative min-h-[140px] flex-1">
      {W > 0 && H > 0 && (
        <svg width={W} height={H} className="absolute inset-0" role="img" aria-label="Rendimiento por mes">
          {[lo, (lo + 100) / 2, 100].map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className="stroke-border" />
              <text x={ml - 5} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                {fmt(t)}
              </text>
            </g>
          ))}
          {serie.map((p, i) => {
            const elegido = i === serie.length - 1
            const cx = ml + i * paso + paso / 2
            const etiqueta = (
              <text x={cx} y={H - 7} textAnchor="middle" className={elegido ? "fill-foreground text-xs font-bold" : "fill-muted-foreground text-[10.5px]"}>
                {capital(nombreMes(p.mes))}
              </text>
            )
            if (p.valor == null) {
              const tope = y(lo + (100 - lo) * 0.45)
              return (
                <g key={p.mes}>
                  <rect x={cx - bw / 2} y={tope} width={bw} height={y(lo) - tope} rx={4} fill="none" strokeDasharray="4 4" className="stroke-muted-foreground opacity-60" />
                  <text x={cx} y={(tope + y(lo)) / 2 + 6} textAnchor="middle" className="fill-muted-foreground font-mono text-lg">
                    —
                  </text>
                  {etiqueta}
                </g>
              )
            }
            const v = Math.max(lo, Math.min(100, p.valor))
            const alto = y(lo) - y(v)
            const dentro = alto > 30
            return (
              <g key={p.mes}>
                <title>{`${capital(nombreMes(p.mes))}\nRendimiento: ${fmt(p.valor, 1)} %\nMerma: ${fmt(100 - p.valor, 1)} %`}</title>
                <rect x={cx - bw / 2} y={y(v)} width={bw} height={alto} rx={4} fill="var(--c)" opacity={elegido ? 1 : 0.45} />
                <text
                  x={cx}
                  y={dentro ? y(v) + 20 : y(v) - 6}
                  textAnchor="middle"
                  className="font-mono font-bold"
                  style={{ fontSize: letra(elegido), fill: dentro && elegido ? "var(--c-cab)" : "var(--foreground)" }}
                >
                  {fmt(p.valor, 1)}%
                </text>
                {etiqueta}
              </g>
            )
          })}
          <line x1={ml} x2={W - mr} y1={y(100)} y2={y(100)} strokeDasharray="5 4" className="stroke-muted-foreground" />
          <text x={W - mr} y={12} textAnchor="end" className="fill-muted-foreground text-[10.5px]">
            - - Estándar 100 %
          </text>
        </svg>
      )}
    </div>
  )
}
