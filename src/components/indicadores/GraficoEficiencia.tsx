import { capital, nombreMes, type PuntoSerie } from "@/lib/indicadores/calculos"
import { useTamano } from "@/components/indicadores/useTamano"

const ESTANDAR = 85

/** Eficiencia de la línea en barras: el mes elegido fuerte, los 2 anteriores suaves, y la raya del 85 %. El % va dentro de la barra. */
export function GraficoEficiencia({ serie }: { serie: PuntoSerie[] }) {
  const { ref, ancho: W, alto: H } = useTamano<HTMLDivElement>()
  const ml = 30, mr = 84, mt = 14, mb = 22
  const y = (v: number) => mt + (1 - v / 100) * (H - mt - mb)
  const paso = (W - ml - mr) / serie.length
  const bw = Math.min(70, paso * 0.55)

  return (
    <div ref={ref} className="relative min-h-[120px] flex-1">
      {W > 0 && H > 0 && (
        <svg width={W} height={H} className="absolute inset-0" role="img" aria-label="Eficiencia por mes">
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className="stroke-border" />
              <text x={ml - 5} y={y(t) + 3.5} textAnchor="end" className="fill-foreground font-mono text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {serie.map((p, i) => {
            const elegido = i === serie.length - 1
            const cx = ml + i * paso + paso / 2
            const etiqueta = (
              <text x={cx} y={H - 6} textAnchor="middle" className={elegido ? "fill-foreground text-[11px] font-semibold" : "fill-foreground text-[11px]"}>
                {capital(nombreMes(p.mes))}
              </text>
            )
            if (p.valor == null) {
              return (
                <g key={p.mes}>
                  <rect x={cx - bw / 2} y={y(45)} width={bw} height={y(0) - y(45)} rx={4} fill="none" strokeDasharray="4 4" className="stroke-muted-foreground opacity-60" />
                  <text x={cx} y={y(22) + 6} textAnchor="middle" className="fill-foreground font-mono text-lg">
                    —
                  </text>
                  {etiqueta}
                </g>
              )
            }
            const v = Math.max(0, Math.min(100, p.valor))
            return (
              <g key={p.mes}>
                <title>{`${capital(nombreMes(p.mes))}: ${p.valor} %${p.valor < ESTANDAR ? `, ${ESTANDAR - p.valor} pts por debajo del estándar` : ", cumple el estándar"}`}</title>
                <rect x={cx - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} rx={4} fill="var(--c)" opacity={elegido ? 1 : 0.45} />
                <text
                  x={cx}
                  y={y(v) + (y(0) - y(v) > 34 ? (elegido ? 28 : 22) : -6)}
                  textAnchor="middle"
                  className="font-mono font-bold"
                  style={{ fontSize: elegido ? 22 : 16, fill: elegido && y(0) - y(v) > 34 ? "var(--c-cab)" : "var(--foreground)" }}
                >
                  {p.valor}%
                </text>
                {etiqueta}
              </g>
            )
          })}
          <line x1={ml} x2={W - mr} y1={y(ESTANDAR)} y2={y(ESTANDAR)} strokeDasharray="5 4" className="stroke-muted-foreground" />
          <text x={W - mr + 5} y={y(ESTANDAR) + 4} className="fill-foreground text-[10.5px]">
            Estándar {ESTANDAR} %
          </text>
        </svg>
      )}
    </div>
  )
}
