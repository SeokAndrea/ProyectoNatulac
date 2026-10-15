import { capital, nombreMes, type PuntoSerie } from "@/lib/indicadores/calculos"
import { useTamano } from "@/components/indicadores/useTamano"
import { fmt } from "@/components/indicadores/formato"

/**
 * Rendimiento de un producto en barras (3 meses) contra el 100 %. El eje
 * arranca en 90 % (o más abajo si hace falta): desde 0 % no se verían las
 * diferencias. Un mes sin dato es un hueco punteado con "—".
 *
 * Todo crece con el tamaño del gráfico (dueña, 2026-10-15: se veía chico y
 * raro): la letra base sale del ancho y el alto disponibles, y de ella los
 * márgenes, el grosor de las barras y los textos. El gráfico se queda con la
 * mayor parte del alto de la tarjeta (flex 4).
 */
export function GraficoFamilia({ serie }: { serie: PuntoSerie[] }) {
  const { ref, ancho: W, alto: H } = useTamano<HTMLDivElement>()
  // Letra base: de 11 a 24 px según el tamaño del gráfico.
  const f = Math.max(11, Math.min(24, W / 20, H / 10))
  const ml = f * 2.4
  const mr = 6
  const mt = f * 2.2
  const mb = f * 2
  const valores = serie.flatMap((p) => (p.valor == null ? [] : [p.valor]))
  const lo = Math.min(90, Math.floor(Math.min(100, ...valores) / 5) * 5 - 5)
  const hi = 100.6
  const y = (v: number) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb)
  const paso = (W - ml - mr) / serie.length
  const bw = Math.min(paso * 0.66, 170)
  // El valor tiene que entrar en el ancho de la barra ("100,0%" ≈ 3,7 letras de ancho).
  const letraValor = (elegido: boolean) => Math.min(f * (elegido ? 1.4 : 1.15), bw / 3.7)

  return (
    <div ref={ref} className="relative min-h-[140px] flex-[4_1_0]">
      {W > 0 && H > 0 && (
        <svg width={W} height={H} className="absolute inset-0" role="img" aria-label="Rendimiento por mes">
          {[lo, (lo + 100) / 2, 100].map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className="stroke-border" />
              <text x={ml - f * 0.4} y={y(t) + f * 0.3} textAnchor="end" className="fill-foreground font-mono" style={{ fontSize: f * 0.8 }}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {serie.map((p, i) => {
            const elegido = i === serie.length - 1
            const cx = ml + i * paso + paso / 2
            const etiqueta = (
              <text x={cx} y={H - f * 0.55} textAnchor="middle" className={elegido ? "fill-foreground font-bold" : "fill-foreground"} style={{ fontSize: f * (elegido ? 1.05 : 0.95) }}>
                {capital(nombreMes(p.mes))}
              </text>
            )
            if (p.valor == null) {
              const tope = y(lo + (100 - lo) * 0.45)
              return (
                <g key={p.mes}>
                  <rect x={cx - bw / 2} y={tope} width={bw} height={y(lo) - tope} rx={f * 0.3} fill="none" strokeDasharray="4 4" className="stroke-muted-foreground opacity-60" />
                  <text x={cx} y={(tope + y(lo)) / 2 + f * 0.4} textAnchor="middle" className="fill-foreground font-mono" style={{ fontSize: f * 1.2 }}>
                    —
                  </text>
                  {etiqueta}
                </g>
              )
            }
            const v = Math.max(lo, Math.min(100, p.valor))
            const alto = y(lo) - y(v)
            const letra = letraValor(elegido)
            const dentro = alto > letra * 1.8
            return (
              <g key={p.mes}>
                <title>{`${capital(nombreMes(p.mes))}\nRendimiento: ${fmt(p.valor, 1)} %\nMerma: ${fmt(100 - p.valor, 1)} %`}</title>
                <rect x={cx - bw / 2} y={y(v)} width={bw} height={alto} rx={f * 0.3} fill="var(--c)" opacity={elegido ? 1 : 0.45} />
                <text
                  x={cx}
                  y={dentro ? y(v) + letra * 1.25 : y(v) - letra * 0.4}
                  textAnchor="middle"
                  className="font-mono font-bold"
                  style={{ fontSize: letra, fill: dentro && elegido ? "var(--c-cab)" : "var(--foreground)" }}
                >
                  {fmt(p.valor, 1)}%
                </text>
                {etiqueta}
              </g>
            )
          })}
          <line x1={ml} x2={W - mr} y1={y(100)} y2={y(100)} strokeDasharray="5 4" className="stroke-muted-foreground" />
          <text x={W - mr} y={f * 0.95} textAnchor="end" className="fill-foreground" style={{ fontSize: f * 0.85 }}>
            - - Estándar 100 %
          </text>
        </svg>
      )}
    </div>
  )
}
