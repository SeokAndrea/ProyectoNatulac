import { capital, cumplimiento, nombreMes } from "@/lib/indicadores/calculos"
import type { DatosPresentacion } from "@/lib/indicadores/tipos"
import { useTamano } from "@/components/indicadores/useTamano"
import { fmt } from "@/components/indicadores/formato"

/** Arco desde arriba, en el sentido del reloj. `frac` de 0 a 1. */
function arco(cx: number, cy: number, r: number, frac: number) {
  const f = Math.min(Math.max(frac, 0), 0.9999)
  const a = -Math.PI / 2 + f * 2 * Math.PI
  return `M${cx},${cy - r}A${r},${r} 0 ${f > 0.5 ? 1 : 0} 1 ${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
}

function Anillo({ cx, cy, r, pct, fuerte }: { cx: number; cy: number; r: number; pct: number; fuerte: boolean }) {
  const g = Math.max(6, r * 0.22)
  const base = Math.min(pct, 100) / 100
  const extra = Math.max(0, pct - 100) / 100
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={g} className="stroke-muted" />
      {base >= 0.9999 ? (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--c)" strokeWidth={g} opacity={fuerte ? 1 : 0.55} />
      ) : (
        <path d={arco(cx, cy, r, base)} fill="none" stroke="var(--c)" strokeWidth={g} strokeLinecap="round" opacity={fuerte ? 1 : 0.55} />
      )}
      {/* Lo que pasa de 100 % es una segunda vuelta, más oscura, por dentro. */}
      {extra > 0 && <path d={arco(cx, cy, r - g - 3, extra)} fill="none" strokeWidth={Math.max(3, g * 0.45)} strokeLinecap="round" className="stroke-foreground opacity-75" />}
    </>
  )
}

/**
 * Cumplimiento del plan en anillos: el mes elegido grande y primero, después
 * los dos anteriores más chicos (ej. septiembre, agosto, julio). `meses` va
 * del más viejo al elegido.
 */
export function AnillosCumplimiento({ meses }: { meses: { mes: string; datos: DatosPresentacion | undefined }[] }) {
  const { ref, ancho: W, alto: H } = useTamano<HTMLDivElement>()
  const orden = [...meses].reverse()
  const partes = orden.length === 1 ? [1] : orden.length === 2 ? [0.6, 0.4] : [0.46, 0.27, 0.27]
  const rGrande = Math.max(22, Math.min(((W * partes[0]) / 2 - 8) / 1.11, (H - 22) / 2.22, 80))
  const rChico = Math.max(16, Math.min(rGrande * 0.62, ((W * (partes[1] ?? 0.3)) / 2 - 8) / 1.11))
  const cy = Math.max(rGrande * 1.11 + 2, (H - 18) / 2)
  // Centro de cada anillo: su parte del ancho, una al lado de la otra.
  const centros = partes.map((p, i) => W * (partes.slice(0, i).reduce((a, b) => a + b, 0) + p / 2))

  return (
    <div ref={ref} className="relative min-h-[110px] flex-[0_0_clamp(110px,21vh,220px)]">
      {W > 0 && H > 0 && (
        <svg width={W} height={H} className="absolute inset-0" role="img" aria-label="Cumplimiento del plan">
          {orden.map((m, i) => {
            const elegido = i === 0
            const r = elegido ? rGrande : rChico
            const cx = centros[i]
            const q = cumplimiento(m.datos)
            const nombre = (
              <text x={cx} y={cy + r + Math.max(6, r * 0.22) / 2 + 14} textAnchor="middle" className={elegido ? "text-[13px] font-bold" : "fill-muted-foreground text-[11.5px]"} style={elegido ? { fill: "var(--c-texto)" } : undefined}>
                {capital(nombreMes(m.mes))}
              </text>
            )
            return (
              <g key={m.mes}>
                <title>{`${capital(nombreMes(m.mes))}\nProducidas: ${fmt(m.datos?.prod)}\nPlaneadas: ${fmt(m.datos?.plan)}\nCumplimiento: ${q == null ? "—" : `${fmt(q)} %`}`}</title>
                {q == null ? (
                  <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={1.5} strokeDasharray="5 5" className="stroke-muted-foreground opacity-60" />
                ) : (
                  <Anillo cx={cx} cy={cy} r={r} pct={q} fuerte={elegido} />
                )}
                <text
                  x={cx}
                  y={cy + r * 0.17}
                  textAnchor="middle"
                  className={q != null && q >= 100 ? "fill-success-foreground font-mono" : "fill-foreground font-mono"}
                  style={{ fontSize: Math.round(r * 0.48), fontWeight: elegido ? 700 : 600 }}
                >
                  {q == null ? "—" : `${fmt(q)}%`}
                </text>
                {nombre}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
