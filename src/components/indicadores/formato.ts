/** Números de Indicadores: separador de miles "." y decimales ",". null = "—". */
export function fmt(n: number | null | undefined, decimales = 0): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toLocaleString("es-VE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

export const fmtPct = (n: number | null | undefined, decimales = 0) => (n == null ? "—" : `${fmt(n, decimales)} %`)

/** Minutos como horas con un decimal: 95 → "1,6 h". */
export const fmtHoras = (minutos: number | null) => (minutos == null ? "—" : `${fmt(minutos / 60, 1)} h`)
