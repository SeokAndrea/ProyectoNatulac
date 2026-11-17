import type { CSSProperties, ReactNode } from "react"
import { QRCodeSVG } from "qrcode.react"
import { lineaPresentacion, lineaSabor, numeroLinea, numeroPaleta4, textoQR, textoVence } from "@/lib/ticketPaleta"
import { fechaHoja, numeroTurno, textoObservacionLargo, type Paleta } from "@/lib/trazabilidadPaletizado"

/*
 * Ticket de paleta de 100 × 150 mm, blanco y negro, con el diseño que aprobó
 * Alexander (2026-11-17; tabla en docs/ticket-paletas/plan-tickets-paletas.md,
 * sección 2). Todo en mm y pt con estilos propios: se imprime en un documento
 * aparte (src/lib/imprimirEtiqueta.tsx), sin los estilos de la app.
 */

const SANS = "'IBM Plex Sans', 'Segoe UI', Arial, sans-serif"
const MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace"
const ROTULO_PT = 9

const s = {
  etiqueta: {
    width: "100mm",
    height: "150mm",
    boxSizing: "border-box",
    padding: "4mm",
    background: "#fff",
    color: "#000",
    fontFamily: SANS,
    display: "flex",
    flexDirection: "column",
    gap: "1mm",
    overflow: "hidden",
  },
  encabezado: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: "2mm",
    borderBottom: "0.6mm solid #000",
    paddingBottom: "1.2mm",
  },
  fila2: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" },
  caja: { border: "0.45mm solid #000", padding: "0.8mm 2mm", minWidth: 0 },
  rotulo: { fontSize: `${ROTULO_PT}pt`, fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.1 },
  valorMono: { fontFamily: MONO, fontWeight: 700, lineHeight: 1.08, whiteSpace: "nowrap" },
} satisfies Record<string, CSSProperties>

function Caja({ rotulo, valor, pt }: { rotulo: string; valor: ReactNode; pt: number }) {
  return (
    <div style={s.caja}>
      <div style={s.rotulo}>{rotulo}</div>
      <div style={{ ...s.valorMono, fontSize: `${pt}pt` }}>{valor}</div>
    </div>
  )
}

export function EtiquetaPaleta({ paleta: p }: { paleta: Paleta }) {
  return (
    <div className="etiqueta" style={s.etiqueta} data-ticket={p.ticket ?? ""}>
      <div style={s.encabezado}>
        <span style={{ fontSize: "13pt", fontWeight: 700, letterSpacing: "0.06em" }}>NATULAC</span>
        <span style={{ fontSize: "7.2pt", fontWeight: 700 }}>PALETA · PRODUCTO TERMINADO</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "2mm", alignItems: "center" }}>
        <div>
          <div style={s.rotulo}>Nº DE PALETA</div>
          <div style={{ ...s.valorMono, fontSize: "48pt" }}>{numeroPaleta4(p.numero)}</div>
        </div>
        <QRCodeSVG value={textoQR(p)} level="M" marginSize={0} style={{ width: "30mm", height: "30mm", display: "block" }} title={`Ticket ${p.ticket ?? ""}`} />
      </div>

      <div style={{ fontSize: "24pt", fontWeight: 700, lineHeight: 1.08 }}>{lineaSabor(p)}</div>
      <div style={{ fontSize: "15pt", lineHeight: 1.08 }}>{lineaPresentacion(p)}</div>

      <div style={s.fila2}>
        <Caja rotulo="CAJAS" valor={p.cajas ?? "—"} pt={22} />
        <Caja rotulo="LOTE" valor={p.lote ?? "—"} pt={22} />
      </div>
      <div style={s.fila2}>
        <Caja rotulo="LÍNEA" valor={numeroLinea(p.lineaNombre)} pt={20} />
        <Caja rotulo="TURNO" valor={numeroTurno(p.turnoTipo)} pt={20} />
      </div>
      <div style={s.fila2}>
        <Caja rotulo="PRODUCCIÓN" valor={p.fechaProduccion ? fechaHoja(p.fechaProduccion) : "—"} pt={15} />
        <Caja rotulo="VENCE" valor={textoVence(p.vence)} pt={15} />
      </div>

      <div style={{ border: "0.45mm solid #000", padding: "0.8mm 2mm" }}>
        <div
          style={{
            textAlign: "center",
            padding: "1mm",
            fontSize: "18pt",
            fontWeight: 700,
            ...(p.conforme ? {} : { background: "#000", color: "#fff" }),
          }}
        >
          {p.conforme ? "CONFORME" : "NO CONFORME"}
        </div>
      </div>

      {!p.conforme && (
        <div style={{ fontSize: "10.5pt", lineHeight: 1.25 }}>
          <div>
            <b>Observación:</b> {textoObservacionLargo(p) || "—"}
          </div>
          {p.accionCorreccion && (
            <div>
              <b>Acción:</b> {p.accionCorreccion}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm", borderTop: "0.3mm solid #000", paddingTop: "1mm", fontSize: "11pt" }}>
        <span>
          Ticket <b style={{ fontFamily: MONO }}>{p.ticket ?? "—"}</b>
        </span>
        <span>Operador: {p.creadaPor ?? "—"}</span>
      </div>
    </div>
  )
}
