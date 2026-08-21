import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo, type AreaCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import type { TurnoActivo } from "@/lib/turno"

/*
 * Acta de turno para imprimir/guardar como PDF: usa la función de
 * impresión del navegador (window.print(), ver el botón en
 * FinalizarTurno.tsx e Historial.tsx) en vez de una librería de PDF —
 * no había ninguna instalada en el proyecto y esto evita sumar una
 * dependencia nueva. En el diálogo de impresión, "Guardar como PDF"
 * hace exactamente eso.
 *
 * Solo el resumen (Recepción, Contadores, Producto Terminado) — el
 * Historial hora-sección-qué NO va acá, queda solo en pantalla (ver
 * la tarjeta "Historial del turno" en FinalizarTurno.tsx).
 *
 * Vive siempre en el DOM (oculta con "hidden print:block"); el resto
 * de la página se oculta al imprimir con "print:hidden" — así, al
 * imprimir, el navegador solo ve esto. Fuerza fondo blanco / texto
 * negro (no usa los tokens de tema) para que salga bien en papel
 * aunque el navegador esté en modo oscuro, y usa solo tonos de gris
 * (nada de color) para que también se vea bien en impresoras B/N.
 */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-wide text-black">
        <span className="inline-block size-1.5 rounded-full bg-black" />
        {titulo.toUpperCase()}
      </h2>
      <div className="rounded-lg border border-black/15 p-3">{children}</div>
    </section>
  )
}

export function ActaTurno({
  turno,
  supervisorNombre,
  area,
}: {
  turno: TurnoActivo
  supervisorNombre: string
  area: AreaCodigo | null
}) {
  const { lineas, presentaciones } = useCatalogosLive()
  const generadoEn = new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })

  const cajasPorLinea = turno.productoTerminado.map((p) => {
    const cajasXPaleta = presentaciones.find((pr) => pr.codigo === p.presentacion)?.cajasXPaleta ?? 0
    return p.paletas * cajasXPaleta + p.cajasSueltas
  })
  const totalCajas = cajasPorLinea.reduce((a, b) => a + b, 0)
  const totalLitros = turno.productoTerminado.reduce((a, p) => a + p.litrosProducidos, 0)
  const mermaPromedio =
    turno.contadores.length === 0
      ? null
      : Math.round((turno.contadores.reduce((a, c) => a + c.mermaPct, 0) / turno.contadores.length) * 100) / 100

  return (
    <div className="bg-white p-8 text-sm text-black">
      <header className="mb-5 flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acta de Turno</h1>
          <p className="text-black/60">Natulac · {area ? nombrePorCodigo(AREAS, area) : "—"}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-base font-semibold">{turno.codigo}</p>
          <p className="text-xs text-black/50">Generado el {generadoEn}</p>
        </div>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-black/[0.03] p-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-black/50">Fecha</p>
          <p className="font-medium">{turno.fecha}</p>
        </div>
        <div>
          <p className="text-xs text-black/50">Hora de inicio</p>
          <p className="font-medium">{turno.horaInicio.slice(0, 5)}</p>
        </div>
        <div>
          <p className="text-xs text-black/50">Turno</p>
          <p className="font-medium">{nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)}</p>
        </div>
        <div>
          <p className="text-xs text-black/50">Grupo</p>
          <p className="font-medium">{nombrePorCodigo(GRUPOS, turno.grupo)}</p>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <p className="text-xs text-black/50">Supervisor</p>
          <p className="font-medium">{supervisorNombre}</p>
        </div>
      </section>

      {(turno.productoTerminado.length > 0 || turno.contadores.length > 0) && (
        <section className="mb-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-black/15 py-2.5">
            <p className="text-xl font-bold">{totalCajas.toLocaleString("es-CO")}</p>
            <p className="text-xs text-black/50">Cajas totales</p>
          </div>
          <div className="rounded-lg border border-black/15 py-2.5">
            <p className="text-xl font-bold">{totalLitros.toLocaleString("es-CO")}</p>
            <p className="text-xs text-black/50">Litros producidos</p>
          </div>
          <div className="rounded-lg border border-black/15 py-2.5">
            <p className="text-xl font-bold">{mermaPromedio ?? "—"}%</p>
            <p className="text-xs text-black/50">Merma promedio</p>
          </div>
        </section>
      )}

      <Seccion titulo="Recepción">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black/20 text-left text-black/60">
              <th className="py-1 pr-3 font-medium">Tanque</th>
              <th className="py-1 pr-3 font-medium">Condición</th>
              <th className="py-1 pr-3 font-medium">Volumen</th>
              <th className="py-1 font-medium">Lote</th>
            </tr>
          </thead>
          <tbody>
            {turno.tanques.map((t, i) => (
              <tr key={t.numeroTanque} className={i % 2 === 1 ? "bg-black/[0.02]" : ""}>
                <td className="py-1 pr-3">Tanque {t.numeroTanque}</td>
                <td className="py-1 pr-3">
                  {t.condicion === "VOLUMEN" ? (t.saborNombre ?? "—") : t.condicion === "SUCIO" ? "Sucio" : "Vacío"}
                </td>
                <td className="py-1 pr-3">{t.condicion === "VOLUMEN" ? `${t.volumenL} L` : "—"}</td>
                <td className="py-1">{t.lote ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Seccion>

      <Seccion titulo="Contadores por línea">
        {turno.contadores.length === 0 ? (
          <p className="text-black/50">Sin registros.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black/20 text-left text-black/60">
                <th className="py-1 pr-3 font-medium">Línea</th>
                <th className="py-1 pr-3 font-medium">Llenadora</th>
                <th className="py-1 pr-3 font-medium">Buenos</th>
                <th className="py-1 pr-3 font-medium">Desechados</th>
                <th className="py-1 font-medium">Merma</th>
              </tr>
            </thead>
            <tbody>
              {turno.contadores.map((c, i) => (
                <tr key={c.id} className={i % 2 === 1 ? "bg-black/[0.02]" : ""}>
                  <td className="py-1 pr-3">{nombrePorCodigo(lineas, c.linea)}</td>
                  <td className="py-1 pr-3">{c.envasesLlenadora}</td>
                  <td className="py-1 pr-3">{c.envasesBuenos}</td>
                  <td className="py-1 pr-3">{c.envasesDesechados}</td>
                  <td className="py-1 font-medium">
                    {c.mermaPct}% {c.requiereJustificacion && c.justificacion ? `— ${c.justificacion}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Producto Terminado">
        {turno.productoTerminado.length === 0 ? (
          <p className="text-black/50">Sin registros.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black/20 text-left text-black/60">
                <th className="py-1 pr-3 font-medium">Línea</th>
                <th className="py-1 pr-3 font-medium">Sabor</th>
                <th className="py-1 pr-3 font-medium">Paletas</th>
                <th className="py-1 pr-3 font-medium">Cajas sueltas</th>
                <th className="py-1 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {turno.productoTerminado.map((p, i) => (
                <tr key={p.linea} className={i % 2 === 1 ? "bg-black/[0.02]" : ""}>
                  <td className="py-1 pr-3">{nombrePorCodigo(lineas, p.linea)}</td>
                  <td className="py-1 pr-3">{p.saborNombre ?? "—"}</td>
                  <td className="py-1 pr-3">{p.paletas}</td>
                  <td className="py-1 pr-3">{p.cajasSueltas}</td>
                  <td className="py-1 font-medium">{cajasPorLinea[i]} cajas</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <section className="mt-14 flex items-end justify-between gap-8">
        <div className="w-64 border-t border-black pt-1 text-xs">
          Firma del supervisor
          <br />
          C.C. ___________________
        </div>
      </section>
    </div>
  )
}
