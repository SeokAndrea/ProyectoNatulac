import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CARGOS, nombrePorCodigo } from "@/lib/catalogos"
import type { RegistroAuditoria } from "@/lib/auditoria"

/*
 * "Registro de cambios" — la auditoría universal (listar_auditoria)
 * presentada como resumen auditable: una línea por cambio, con la
 * FECHA Y HORA primero ("para ver cuándo"), la acción, qué se tocó y
 * quién. El antes/después queda detrás de "ver valores", no tapando la
 * vista. Agrupado por día, lo más nuevo primero.
 *
 * Vive en la vista de Auditoría reworkeada, en una sección colapsada
 * al final (ver plan-rework-auditoria.md).
 */
const VARIANTE: Record<string, "success" | "warning" | "danger" | "muted" | "secondary"> = {
  CREAR: "success",
  ACTIVAR: "success",
  EDITAR: "warning",
  DESACTIVAR: "muted",
  RESET_PASSWORD: "secondary",
  ELIMINAR: "danger",
}

function valorLegible(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

export function RegistroCambios({ registros }: { registros: RegistroAuditoria[] }) {
  if (registros.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Sin cambios registrados en ese rango.
      </p>
    )
  }

  const orden = [...registros].sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn))
  const porDia: { dia: string; registros: RegistroAuditoria[] }[] = []
  for (const r of orden) {
    const dia = new Date(r.ocurridoEn).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    const ultimo = porDia[porDia.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.registros.push(r)
    else porDia.push({ dia, registros: [r] })
  }

  return (
    <div className="flex flex-col gap-3">
      {porDia.map(({ dia, registros: delDia }) => (
        <div key={dia} className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {dia} · {delDia.length}
          </p>
          {delDia.map((r, i) => (
            <FilaCambio key={i} r={r} />
          ))}
        </div>
      ))}
    </div>
  )
}

function FilaCambio({ r }: { r: RegistroAuditoria }) {
  const [abierto, setAbierto] = useState(false)
  const hora = new Date(r.ocurridoEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })

  const claves = [...new Set([...Object.keys(r.antes ?? {}), ...Object.keys(r.despues ?? {})])]
  const diffs = claves
    .map((k) => ({ k, antes: r.antes?.[k], despues: r.despues?.[k] }))
    .filter((x) => JSON.stringify(x.antes ?? null) !== JSON.stringify(x.despues ?? null))

  return (
    <div className="rounded-md border border-border/70 bg-card px-3 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="num shrink-0 font-medium text-foreground">{hora}</span>
        <Badge variant={VARIANTE[r.accion] ?? "outline"}>{r.accion}</Badge>
        <span className="text-foreground">{r.resumen ?? `${r.accion} · ${r.entidad}`}</span>
        <span className="text-muted-foreground">
          · {r.usuarioNombre ?? r.usuario ?? "—"}
          {r.usuarioCargo ? ` (${nombrePorCodigo(CARGOS, r.usuarioCargo)})` : ""}
          {r.pagina ? ` · ${r.pagina}` : ""}
        </span>
        {diffs.length > 0 && (
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? "ocultar valores" : "ver valores"}
          </button>
        )}
      </div>
      {abierto && diffs.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 pl-2 text-muted-foreground">
          {diffs.map((x) => (
            <li key={x.k}>
              <span className="text-foreground">{x.k}:</span> {valorLegible(x.antes)} <span aria-hidden>→</span>{" "}
              {valorLegible(x.despues)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
