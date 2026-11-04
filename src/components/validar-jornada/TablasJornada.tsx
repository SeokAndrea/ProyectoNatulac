import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  consumoLote,
  diferenciaLote,
  mermaEnvases,
  mermaLote,
  rendimientoLote,
  totalLotes,
  type FilaCajas,
  type FilaEnvases,
  type FilaLote,
  type FilaParada,
} from "@/lib/validarJornada"
import { AccionesFila, ValorValidado, type AccionValidar } from "./AccionesFila"

type Resultado = { ok: true } | { ok: false; error: string }

/** Límites de color de las mermas (mismos que el resto de la app). */
const LIMITE_ENVASES = 3
const LIMITE_SEMIELABORADO = 1.5

const fmt = (n: number) => n.toLocaleString("es-CO")
/** "LINEA_2" / "LINEA_T2" → "Línea 2" / "Línea T2". */
const nombreLinea = (codigo: string) => `Línea ${codigo.replace(/^LINEA_/, "")}`

function Tabla({ columnas, children, vacio }: { columnas: { texto: string; derecha?: boolean }[]; children: ReactNode; vacio: string | null }) {
  if (vacio) return <p className="py-6 text-center text-sm text-muted-foreground">{vacio}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th
                key={c.texto}
                className={cn(
                  "border-b border-border px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap",
                  c.derecha ? "text-right" : "text-left",
                )}
              >
                {c.texto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const td = "border-b border-border px-2 py-2 align-middle"
const tdR = cn(td, "text-right")

function Merma({ pct, limite }: { pct: number | null; limite: number }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn("num font-semibold", pct > limite ? "text-danger" : pct > limite * (2 / 3) ? "text-warning-foreground" : "text-foreground")}>
      {pct.toFixed(2).replace(".", ",")}%
    </span>
  )
}

export function TablaCajas({ filas, bloqueada, onAccion }: { filas: FilaCajas[]; bloqueada: boolean; onAccion: (f: FilaCajas, a: AccionValidar) => Promise<Resultado> }) {
  return (
    <Tabla
      vacio={filas.length === 0 ? "No hay Producto Terminado cargado en esta jornada." : null}
      columnas={[{ texto: "Turno" }, { texto: "Sabor" }, { texto: "Presentación" }, { texto: "Cajas", derecha: true }, { texto: "", derecha: true }]}
    >
      {filas.map((f) => (
        <tr key={f.id}>
          <td className={td}>{f.turno}</td>
          <td className={td}>{f.saborNombre}</td>
          <td className={td}>{f.volumenMl} ml</td>
          <td className={tdR}>
            <ValorValidado original={f.cajas} validacion={f.validacion} />
          </td>
          <td className={tdR}>
            <AccionesFila validacion={f.validacion} valorOriginal={f.cajas} bloqueada={bloqueada} onAccion={(a) => onAccion(f, a)} />
          </td>
        </tr>
      ))}
    </Tabla>
  )
}

export function TablaEnvases({ filas, bloqueada, onAccion }: { filas: FilaEnvases[]; bloqueada: boolean; onAccion: (f: FilaEnvases, a: AccionValidar) => Promise<Resultado> }) {
  return (
    <Tabla
      vacio={filas.length === 0 ? "Ninguna corrida tiene contador o Producto Terminado en esta jornada." : null}
      columnas={[
        { texto: "Turno" },
        { texto: "Línea" },
        { texto: "Sabor" },
        { texto: "Contador", derecha: true },
        { texto: "Buenos", derecha: true },
        { texto: "Envases PT", derecha: true },
        { texto: "Merma", derecha: true },
        { texto: "", derecha: true },
      ]}
    >
      {filas.map((f) => {
        const merma = mermaEnvases(f)
        return (
          <tr key={f.id}>
            <td className={td}>{f.turno}</td>
            <td className={td}>{nombreLinea(f.lineaCodigo)}</td>
            <td className={td}>
              {f.saborNombre} · {f.presentacion} ml{f.lote ? <span className="text-muted-foreground"> · Lote {f.lote}</span> : null}
            </td>
            <td className={tdR}>
              <ValorValidado original={f.contador} validacion={f.validacion} />
            </td>
            <td className={cn(tdR, "num")}>{f.buenos !== null ? fmt(f.buenos) : "—"}</td>
            <td className={cn(tdR, "num")}>{f.envasesPt !== null ? fmt(f.envasesPt) : <span className="text-danger">Sin PT</span>}</td>
            <td className={tdR}>
              <Merma pct={merma} limite={LIMITE_ENVASES} />
              {merma !== null && merma > LIMITE_ENVASES && (
                <p className={cn("text-xs", f.justificacion ? "text-muted-foreground" : "text-danger")}>{f.justificacion ?? "Sin justificar"}</p>
              )}
            </td>
            <td className={tdR}>
              <AccionesFila validacion={f.validacion} valorOriginal={f.contador} bloqueada={bloqueada} onAccion={(a) => onAccion(f, a)} />
            </td>
          </tr>
        )
      })}
    </Tabla>
  )
}

const MOTIVO: Record<NonNullable<FilaLote["sinContraste"]>, string> = {
  SIN_LOTE: "Sin lote",
  SIN_TRAMO: "No se pudieron leer los totales del lote",
  PT_EXCEDE: "El PT supera lo preparado",
  EN_CURSO: "En curso: el rendimiento sale al cerrar el lote",
}

const litros = (n: number | null) => (n === null ? "—" : fmt(Math.round(n)))

function Rendimiento({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>
  return <span className="num">{pct.toFixed(2).replace(".", ",")}%</span>
}

/**
 * Semielaborado de la jornada (dueña, 2026-11-03): por lote, tambores ·
 * preparado · envasado por línea · total envasado · rendimiento · merma ·
 * diferencia, y abajo el total. Rendimiento = envasado / preparado × 100;
 * merma = 100 − rendimiento; diferencia = preparado − envasado (litros).
 * Ya no se corrige el volumen final: el tanque no entra al cálculo.
 */
export function TablaLotes({ filas, bloqueada, onAccion }: { filas: FilaLote[]; bloqueada: boolean; onAccion: (f: FilaLote, a: AccionValidar) => Promise<Resultado> }) {
  const lineas = [...new Set(filas.flatMap((f) => Object.keys(f.ptPorLinea)))].sort()
  const total = totalLotes(filas)
  return (
    <Tabla
      vacio={filas.length === 0 ? "Ningún lote de Aséptico se usó o preparó en esta jornada." : null}
      columnas={[
        { texto: "Lote" },
        { texto: "Sabor" },
        { texto: "Tambores", derecha: true },
        { texto: "Preparado (L)", derecha: true },
        ...lineas.map((l) => ({ texto: nombreLinea(l), derecha: true })),
        { texto: "Total envasado (L)", derecha: true },
        { texto: "Rendimiento", derecha: true },
        { texto: "Merma", derecha: true },
        { texto: "Diferencia (L)", derecha: true },
        { texto: "", derecha: true },
      ]}
    >
      {filas.map((f) => {
        const enCurso = f.sinContraste !== null
        return (
          <tr key={f.id}>
            <td className={td}>
              {f.lote ?? "—"}
              <p className="text-xs text-muted-foreground">TQ{f.numeroTanque}</p>
            </td>
            <td className={td}>
              {f.saborNombre ?? "Sin sabor"}
              {f.sinContraste && <p className="text-xs text-warning-foreground">{MOTIVO[f.sinContraste]}</p>}
            </td>
            <td className={cn(tdR, "num")}>{f.tambores > 0 ? f.tambores.toLocaleString("es-CO") : "—"}</td>
            <td className={cn(tdR, "num")}>{enCurso ? "—" : litros(consumoLote(f))}</td>
            {lineas.map((l) => (
              <td key={l} className={cn(tdR, "num")}>
                {f.ptPorLinea[l] ? litros(f.ptPorLinea[l]) : "—"}
              </td>
            ))}
            <td className={cn(tdR, "num font-semibold")}>{litros(f.pt)}</td>
            <td className={tdR}>
              <Rendimiento pct={rendimientoLote(f)} />
            </td>
            <td className={tdR}>
              <Merma pct={mermaLote(f)} limite={LIMITE_SEMIELABORADO} />
            </td>
            <td className={cn(tdR, "num")}>{litros(diferenciaLote(f))}</td>
            <td className={tdR}>
              <AccionesFila validacion={f.validacion} valorOriginal={0} conCorregir={false} bloqueada={bloqueada} onAccion={(a) => onAccion(f, a)} />
            </td>
          </tr>
        )
      })}
      <tr className="bg-muted/40 font-semibold">
        <td className={td} colSpan={2}>
          Total
        </td>
        <td className={cn(tdR, "num")}>{total.tambores > 0 ? total.tambores.toLocaleString("es-CO") : "—"}</td>
        <td className={cn(tdR, "num")}>{litros(total.consumo)}</td>
        {lineas.map((l) => (
          <td key={l} className={cn(tdR, "num")}>
            {total.ptPorLinea[l] ? litros(total.ptPorLinea[l]) : "—"}
          </td>
        ))}
        <td className={cn(tdR, "num")}>{litros(total.pt)}</td>
        <td className={tdR}>
          <Rendimiento pct={rendimientoLote(total)} />
        </td>
        <td className={tdR}>
          <Merma pct={mermaLote(total)} limite={LIMITE_SEMIELABORADO} />
        </td>
        <td className={cn(tdR, "num")}>{litros(diferenciaLote(total))}</td>
        <td className={td} />
      </tr>
    </Tabla>
  )
}

const CLASE: Record<FilaParada["clase"], string> = { PROGRAMADA: "Programada", NO_PROGRAMADA: "No programada", OCIOSO: "Ocioso" }

export function TablaParadas({ filas, bloqueada, onAccion }: { filas: FilaParada[]; bloqueada: boolean; onAccion: (f: FilaParada, a: AccionValidar) => Promise<Resultado> }) {
  return (
    <Tabla
      vacio={filas.length === 0 ? "No hay paradas registradas en esta jornada." : null}
      columnas={[
        { texto: "Línea" },
        { texto: "Cuándo" },
        { texto: "Tipo" },
        { texto: "Clase" },
        { texto: "Responsable" },
        { texto: "Minutos", derecha: true },
        { texto: "", derecha: true },
      ]}
    >
      {filas.map((f) => {
        const excluida = f.validacion?.estado === "EXCLUIDA"
        return (
          <tr key={f.id} className={cn(excluida && "text-muted-foreground")}>
            <td className={td}>{nombreLinea(f.lineaCodigo)}</td>
            <td className={cn(td, "whitespace-nowrap")}>{f.cuando}</td>
            <td className={td}>
              <span className={cn(excluida && "line-through")}>{f.tipoNombre}</span>
              {f.larga && <p className="text-xs font-semibold text-warning-foreground">Más de 4 horas</p>}
              {f.pendiente && <p className="text-xs font-semibold text-danger">Sin minutos (+1 sin completar)</p>}
              {f.sinClasificar && <p className="text-xs font-semibold text-warning-foreground">Falla sin clasificar: falta el código de Mantenimiento</p>}
              {f.abierta && <p className="text-xs font-semibold text-danger">abierta</p>}
            </td>
            <td className={td}>{CLASE[f.clase]}</td>
            <td className={td}>{f.responsable}</td>
            <td className={tdR}>
              <ValorValidado original={f.minutos} validacion={f.validacion} />
            </td>
            <td className={tdR}>
              <AccionesFila validacion={f.validacion} valorOriginal={f.minutos} bloqueada={bloqueada} conNoCuenta onAccion={(a) => onAccion(f, a)} />
            </td>
          </tr>
        )
      })}
    </Tabla>
  )
}
