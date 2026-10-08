import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, Loader2, Square } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ConfirmarEstadoTanque } from "@/components/ConfirmarEstadoTanque"
import { EmptyState } from "@/components/EmptyState"
import { LineaVisual, type EstadoVisualLinea } from "@/components/LineaVisual"
import { NovedadesTurno } from "@/components/NovedadesTurno"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TURNO_TIPOS, nombreGrupo, nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { generarActaPdf } from "@/lib/actaPdf"
import { subirYRegistrarActa } from "@/lib/historialTurnos"
import { descargarArchivo, nombreArchivoActa } from "@/lib/descargarArchivo"
import { colorSabor } from "@/lib/coloresSabor"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useSesionTurno } from "@/lib/sesionTurno"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { useProductoTerminado } from "@/lib/productoTerminado"
import { useCalidadLibera } from "@/lib/calidad"
import { useNovedadesTurno } from "@/lib/novedades"
import { listarLecturasServiciosIndustrialesDeTurno, type LecturaServiciosIndustriales } from "@/lib/panelProduccion"
import { duracionMin, fmtDuracion, type Parada } from "@/lib/paradas"
import { cargarParadasDelTurno, codigoDeParadaLive } from "@/lib/paradasCatalogo"

/*
 * Finalizar Turno: el resumen formal del turno en curso (datos fijos
 * + todos los contadores de Contadores y Merma por línea, con sus
 * mermas y justificaciones) para revisar antes de cerrar. El cierre
 * hace un UPDATE real en "turnos" (estado = 'CERRADO', ver
 * finalizar_turno()) y, si sale bien, genera el acta en PDF de una
 * sola vez (jsPDF, ver src/lib/actaPdf.ts) y la sube a Supabase
 * Storage (ver subirYRegistrarActa() en src/lib/historialTurnos.ts) —
 * ya no depende de window.print()/"Guardar como PDF" del navegador.
 *
 * No hay una tarjeta de Checklist propia — si falta algo al apretar
 * "Finalizar Turno", se avisa ahí mismo (con un segundo clic para
 * confirmar igual), en vez de ocupar una tarjeta todo el tiempo. Las
 * demás secciones son colapsables (SeccionColapsable): cerradas por
 * defecto, un clic las abre si hace falta revisarlas.
 */
export default function FinalizarTurno() {
  const sesion = useSesionTurno()
  const prep = usePreparacion()
  const prod = useProduccion()
  const pt = useProductoTerminado()
  const novedades = useNovedadesTurno()
  const { session } = useAuth()
  const calidadLibera = useCalidadLibera(session?.area ?? null)
  const { lineas, presentaciones, velocidades } = useCatalogosLive()
  const navigate = useNavigate()
  const [finalizando, setFinalizando] = useState(false)
  const [errorFinalizar, setErrorFinalizar] = useState<string | null>(null)
  const [sabores, setSabores] = useState<Sabor[]>([])
  const [paradas, setParadas] = useState<Parada[]>([])
  const [serviciosIndustriales, setServiciosIndustriales] = useState<LecturaServiciosIndustriales[]>([])
  /** Turno ya cerrado: el PDF del acta (si se pudo generar) queda acá para volver a descargarlo sin conexión. */
  const [cerrado, setCerrado] = useState<{ codigoTurno: string; actaPdf: Blob | null; errorActa: string | null } | null>(null)

  const cargando = sesion.cargando || prep.cargando || prod.cargando || pt.cargando || novedades.cargando

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  useEffect(() => {
    // Paradas registradas en ESTE turno — van al resumen de abajo y a la sección "Paradas del turno" del Acta.
    if (!sesion.turnoId) return
    let vivo = true
    cargarParadasDelTurno(sesion.turnoId).then((filas) => {
      if (vivo) setParadas(filas)
    })
    return () => {
      vivo = false
    }
  }, [sesion.turnoId])

  useEffect(() => {
    // Lecturas de Servicios Industriales con turno_id = este turno (ver
    // migración 20261057) — para la sección 2.4 del Acta.
    if (sesion.turnoId) listarLecturasServiciosIndustrialesDeTurno(sesion.turnoId).then(setServiciosIndustriales)
  }, [sesion.turnoId])

  if (cargando) {
    return (
      <AppShell title="Finalizar Turno" description="Resumen y cierre del turno">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!sesion.turnoId) {
    return (
      <AppShell title="Finalizar Turno" description="Resumen y cierre del turno">
        <EmptyState
          icon={ClipboardCheck}
          title="No hay ningún turno en curso"
          description="Todavía no iniciaste un turno para finalizar. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  /*
   * Sin lista de "Falta cargar X cosas" (dueño, 2026-09-30): lo que de
   * verdad impide cerrar lo bloquea la base (finalizar_turno) y se
   * avisa arriba (líneas activas, paradas sin completar).
   */

  /*
   * Case 6 — corridas todavía activas sin resolver: bloqueo DURO (no
   * "Finalizar de todos modos"). Hay que ir a Producto Terminado, cargar
   * el PT del tramo de este turno y elegir Terminar o Entregar línea. Si
   * no, la producción de esa línea en este turno se pierde.
   */
  /** Área de Pruebas: sin ceremonia — finalizar_turno() ya no exige resolver nada ahí, así que el botón tampoco. */
  const esPruebas = session?.area === "PRUEBAS"
  /** Mismo criterio que exigir_puede_finalizar() en el servidor (migración 20261083). */
  const soyResponsable = !sesion.sinResponsable && sesion.supervisorUsuario === session?.username.toLowerCase()
  const puedeFinalizar =
    esPruebas || (!sesion.sinResponsable && (soyResponsable || puede(session, "TURNO_CORREGIR") || !!session?.esDueno))
  const lineasSinResolver = esPruebas ? [] : prod.corridas.filter((c) => c.activa && c.entregadaEn === null)
  /** Paradas sumadas como +1 sin minutos (o Falla sin especificar sin código): finalizar_turno() no deja cerrar (migración 20261090, también en Pruebas). */
  const paradasPendientes = paradas.filter((p) => p.pendiente)
  const bloqueado = lineasSinResolver.length > 0 || paradasPendientes.length > 0


  /** Resumen del turno: cajas por línea (paletas × cajas/paleta + sueltas) y litros totales — mismo cálculo que tenía "Producto Terminado por línea". */
  const produccionPorLinea = pt.registros.map((p) => {
    const cajasXPaleta = presentaciones.find((pr) => pr.codigo === p.presentacion)?.cajasXPaleta ?? 0
    return { linea: p.linea, saborNombre: p.saborNombre, cajas: p.paletas * cajasXPaleta + p.cajasSueltas }
  })
  const litrosTotales = pt.registros.reduce((a, p) => a + p.litrosProducidos, 0)

  async function handleFinalizar() {
    if (bloqueado) return
    if (!session || !sesion.turnoId || !sesion.codigo || !sesion.fecha || !sesion.turnoTipo || !sesion.grupo) return
    setFinalizando(true)
    setErrorFinalizar(null)

    // Se guarda todo ANTES de cerrar — sesion.finalizarTurno() limpia la
    // identidad del turno, y con turnoId en null los 5 hooks (sesion,
    // prep, prod, pt, novedades) también se vacían solos.
    const turnoId = sesion.turnoId
    const codigo = sesion.codigo
    const datosParaActa = {
      codigo,
      fecha: sesion.fecha,
      turnoTipo: sesion.turnoTipo,
      grupo: sesion.grupo,
      tanquesEncontrados: sesion.tanquesEncontrados,
      tanques: prep.tanques,
      preparaciones: prep.preparaciones,
      corridas: prod.corridas,
      contadores: prod.contadores,
      productoTerminado: pt.registros,
      novedades: novedades.novedades,
      ajustesVolumen: prep.ajustesVolumen,
      transferencias: prep.transferencias,
      paradas,
      serviciosIndustriales,
      responsables: sesion.responsables,
      esquema: sesion.esquema ?? undefined,
      horaInicio: sesion.horaInicio,
    }
    const resultadoCierre = await sesion.finalizarTurno()
    if (!resultadoCierre.ok) {
      // p. ej. una corrida detenida sin su Producto Terminado (costura 2).
      setFinalizando(false)
      setErrorFinalizar(resultadoCierre.error)
      return
    }

    let actaPdf: Blob | null = null
    let errorActa: string | null = null
    // Pruebas no genera acta (tampoco sale en Mis Actas, migración 20261105).
    if (!esPruebas) {
      try {
        actaPdf = await generarActaPdf({
          ...datosParaActa,
          supervisorNombre: session.nombre || session.username,
          area: session.area,
          lineas,
          presentaciones,
          velocidades,
        })
        // Se descarga sola al teléfono; si el navegador la bloquea, queda el botón "Descargar acta".
        descargarArchivo(actaPdf, nombreArchivoActa(codigo))
        const resultado = await subirYRegistrarActa(session.username, turnoId, session.area ?? "SIN_AREA", codigo, actaPdf)
        if (!resultado.ok) errorActa = `El acta no se pudo guardar en Mis Actas: ${resultado.error}`
      } catch {
        errorActa = "No se pudo generar el PDF del acta. Puede generarla de nuevo desde Auditoría."
      }
    }

    setFinalizando(false)
    setCerrado({ codigoTurno: codigo, actaPdf, errorActa })
  }

  if (cerrado) {
    return (
      <AppShell title="Finalizar Turno" description={`Turno ${cerrado.codigoTurno}`}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <div>
            <p className="text-lg font-semibold text-foreground">Turno cerrado</p>
            <p className="text-sm text-muted-foreground">Turno {cerrado.codigoTurno}</p>
          </div>

          {cerrado.actaPdf && (
            <div className="flex flex-col items-center gap-1.5">
              <Button onClick={() => cerrado.actaPdf && descargarArchivo(cerrado.actaPdf, nombreArchivoActa(cerrado.codigoTurno))}>
                <Download className="size-4" />
                Descargar acta
              </Button>
              <p className="text-xs text-muted-foreground">El acta se descargó al teléfono. Si no la ves, toca el botón.</p>
            </div>
          )}
          {cerrado.errorActa && (
            <p className="text-sm text-destructive" role="alert">
              {cerrado.errorActa}
            </p>
          )}

          <Button variant="ghost" onClick={() => navigate("/hub", { replace: true })}>
            Volver al inicio
          </Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Finalizar Turno" description={`Turno ${sesion.codigo}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* Arriba de todo, sin esperar al clic en "Finalizar" — para saber qué falta antes de ponerse a bajar. */}
        {lineasSinResolver.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4 shrink-0" />
              {lineasSinResolver.length === 1 ? "Esta línea sigue activa" : "Estas líneas siguen activas"}:{" "}
              {lineasSinResolver.map((c) => nombrePorCodigo(lineas, c.linea)).join(", ")}
            </p>
            <p>
              Carga su Producto Terminado de este turno (0 paletas / 0 cajas si no produjo nada) y elige{" "}
              <span className="font-medium">Terminar</span> o <span className="font-medium">Entregar línea</span> antes de
              finalizar.
            </p>
            <Button asChild size="sm" variant="outline" className="self-start">
              <Link to="/producto-terminado">Ir a Producto Terminado</Link>
            </Button>
          </div>
        )}

        {paradasPendientes.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4 shrink-0" />
              {paradasPendientes.length === 1
                ? "Hay 1 parada sin completar"
                : `Hay ${paradasPendientes.length} paradas sin completar`}
            </p>
            <ul className="list-inside list-disc pl-1">
              {paradasPendientes.map((p) => (
                <li key={p.id}>
                  {lineas.find((l) => l.codigo.replace(/^LINEA_T?/, "") === p.lineaCodigo.replace(/^LINEA_/, ""))?.nombre ??
                    p.lineaCodigo}
                  {" · "}
                  {p.nota || p.tipoNombre}
                </li>
              ))}
            </ul>
            <p>Pon cuánto duró cada una (y el código si es una falla sin especificar) antes de finalizar.</p>
            <Button asChild size="sm" variant="outline" className="self-start">
              <Link to="/paradas">Ir a Registrar Paradas</Link>
            </Button>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumen del turno</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Nombre</dt>
                <dd className="font-medium text-foreground">{session?.nombre || session?.username}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Código del turno</dt>
                <dd className="font-medium text-foreground">{sesion.codigo}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha</dt>
                <dd className="font-medium text-foreground">{sesion.fecha ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Turno</dt>
                <dd className="font-medium text-foreground">{nombrePorCodigo(TURNO_TIPOS, sesion.turnoTipo ?? "TURNO_1")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Grupo</dt>
                <dd className="font-medium text-foreground">{nombreGrupo(sesion.grupo ?? "GRUPO_1")}</dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-sm text-muted-foreground">Cajas producidas por línea</p>
              {produccionPorLinea.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no se cargó Producto Terminado en este turno.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {produccionPorLinea.map((p) => (
                    <div
                      key={p.linea}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-foreground">
                        {nombrePorCodigo(lineas, p.linea)}
                        {p.saborNombre ? ` · ${p.saborNombre}` : ""}
                      </span>
                      <span className="num font-medium text-foreground">{p.cajas.toLocaleString("es-CO")} cajas</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Litros producidos</span>
              <span className="num text-lg font-bold text-foreground">{litrosTotales.toLocaleString("es-CO")} L</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Opcional — nadie tiene que llenarla para poder finalizar. Alimenta "2.3 Novedades del turno" del Acta. */}
          <NovedadesTurno />

          <SeccionColapsable
            titulo="Estado final de tanques"
            descripcion="Confirma o corrige el estado de cada tanque antes de cerrar el turno."
            abiertoPorDefecto={prep.tanques.some((t) => !t.confirmadoFinEn)}
          >
            <div className="flex flex-col gap-2">
              {prep.tanques.map((t) => (
                <ConfirmarEstadoTanque
                  key={t.numeroTanque}
                  tanque={t}
                  sabores={sabores}
                  momento="FIN"
                  onConfirmar={() => prep.confirmarEstadoTanque(t.numeroTanque, "FIN")}
                  onGuardarEdicion={(datos) => prep.cambiarCondicionTanque({ ...datos, momento: "FIN" })}
                  calidadLibera={calidadLibera}
                />
              ))}
              {prep.tanques.every((t) => t.confirmadoFinEn) && (
                <p className="text-sm text-muted-foreground">Los 3 tanques ya tienen su estado final confirmado.</p>
              )}
            </div>
          </SeccionColapsable>

          <SeccionColapsable titulo="Estado de líneas" descripcion="Cómo quedó cada llenadora al cierre del turno.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {lineas
                .filter((l) => l.activo)
                .map((l) => {
                  const corrida = prod.corridas.find((tl) => tl.linea === l.codigo && tl.activa) ?? null
                  const numeroLinea = Number(l.codigo.replace("LINEA_", "")) || 0
                  const estadoVisual: EstadoVisualLinea = !corrida
                    ? "libre"
                    : corrida.loteTerminado != null
                      ? "terminada"
                      : corrida.pausadaEn != null
                        ? "parada"
                        : "corriendo"
                  return (
                    <div key={l.codigo} className="flex flex-col gap-1.5 rounded-xl border border-border bg-background/60 p-2.5">
                      <LineaVisual
                        numeroLinea={numeroLinea}
                        estado={estadoVisual}
                        color={colorSabor(corrida?.saborNombre ?? null)}
                        square
                        saborNombre={corrida?.saborNombre ?? null}
                        presentacion={corrida?.presentacion ?? null}
                      />
                      <p className="text-center text-xs text-muted-foreground">
                        {corrida ? `${corrida.saborNombre ?? "Sin sabor"} · ${corrida.presentacion} ml` : l.nombre}
                      </p>
                    </div>
                  )
                })}
            </div>
          </SeccionColapsable>

          <SeccionColapsable
            titulo="Paradas del turno"
            descripcion="Lo que se cargó en Registrar Paradas. Sale en el Acta con su comentario."
            abiertoPorDefecto={paradas.length > 0}
          >
            {paradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se registró ninguna parada en este turno.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {paradas.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 font-medium text-foreground">
                        {lineas.find((l) => l.codigo.replace(/^LINEA_T?/, "") === p.lineaCodigo.replace(/^LINEA_/, ""))?.nombre ?? p.lineaCodigo}
                        <span className="font-normal text-muted-foreground">
                          {" · "}
                          {codigoDeParadaLive(p) ? codigoDeParadaLive(p) + " · " : ""}
                          {p.tipoNombre}
                        </span>
                      </p>
                      <span className="num shrink-0 font-semibold text-warning">{p.pendiente ? "Sin completar" : fmtDuracion(duracionMin(p))}</span>
                    </div>
                    {(p.nota || p.justificacionDesvio) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[p.nota, p.justificacionDesvio ? "Justificación: " + p.justificacionDesvio : null].filter(Boolean).join(" — ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SeccionColapsable>

          {prep.tanques.some((t) => t.condicion === "EN_PREPARACION") && (
            <SeccionColapsable titulo="Preparaciones" descripcion="Tambores y ajustes cargados por tanque.">
              {prep.preparaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no se cargó ninguna preparación en este turno.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {prep.preparaciones.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">
                        Tanque {p.numeroTanque} · {p.saborNombre ?? "Sin sabor"}
                        {p.lote ? ` · Lote ${p.lote}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {p.tambores.toLocaleString("es-CO")} tambores
                        {p.agua !== null ? ` · Agua ${p.agua} L` : ""}
                        {p.azucar !== null ? ` · Azúcar ${p.azucar} kg` : ""}
                        {p.acidoCitrico !== null ? ` · Ácido cítrico ${p.acidoCitrico} kg` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SeccionColapsable>
          )}
        </div>

        {errorFinalizar && (
          <div
            className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            role="alert"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>{errorFinalizar}</span>
          </div>
        )}

        {!puedeFinalizar && (
          <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
            {sesion.sinResponsable
              ? "Este turno no tiene responsable. Asúmelo desde Comenzar Turno antes de finalizarlo."
              : `Solo ${sesion.supervisorNombre} (responsable del turno) o un jefe pueden finalizarlo. Si vas a quedar a cargo, toma el relevo desde Comenzar Turno.`}
          </p>
        )}

        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={handleFinalizar}
          disabled={finalizando || bloqueado || !puedeFinalizar}
        >
          {finalizando ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
          Finalizar Turno (genera el Acta)
        </Button>
      </div>
    </AppShell>
  )
}
