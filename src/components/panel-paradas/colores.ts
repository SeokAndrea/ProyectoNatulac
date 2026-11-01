/** El color fijo de cada línea (--linea-1/2/3 en index.css): LINEA_2 o LINEA_T2 → var(--linea-2). */
export const colorLinea = (codigo: string) => `var(--linea-${codigo.replace(/\D/g, "") || "1"})`
