import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, ClipboardCheck, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ConfirmarEstadoTanque } from "@/components/ConfirmarEstadoTanque"
import { EmptyState } from "@/components/EmptyState"
import { NovedadesTurno } from "@/components/NovedadesTurno"
import { AntesDeCerrar, type PuntoCierre } from "@/components/finalizar-turno/AntesDeCerrar"
import { BarraFinalizar } from "@/components/finalizar-turno/BarraFinalizar"
import { LineasAlCierre, corridaSinResolver } from "@/components/finalizar-turno/LineasAlCierre"
import { MermasPorLote } from "@/components/finalizar-turno/MermasPorLote"
import { ParadasAlCierre } from "@/components/finalizar-turno/ParadasAlCierre"
import { ProduccionDelTurno } from "@/components/finalizar-turno/ProduccionDelTurno"
import { TurnoCerrado } from "@/components/finalizar-turno/TurnoCerrado"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TURNO_TIPOS, nombreGrupo, nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { generarActaPdf } from "@/lib/actaPdf"
import { eficienciaDelTurno } from "@/lib/eficiencia"
import { subirYRegistrarActa } from "@/lib/historialTurnos"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useSesionTurno } from "@/lib/sesionTurno"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { useProductoTerminado } from "@/lib/productoTerminado"
import { useCalidadLibera } from "@/lib/calidad"
import { useNovedadesTurno } from "@/lib/novedades"
import { listarLecturasServiciosIndustrialesDeTurno, type LecturaServiciosIndustriales } from "@/lib/panelProduccion"
import type { Parada } from "@/lib/paradas"
import { cargarParadasDelTurno } from "@/lib/paradasCatalogo"
import { mermaCorrida } from "@/lib/reportes"
import { LIMITE_MERMA } from "@/lib/turno"

/*
 * Finalizar Turno (boceto aprobado por la dueña, 2026-10-08). Arriba, "Antes
 * de cerrar": lo que no deja cerrar (líneas sin resolver, paradas sin
 * completar) y lo recomendado (tanques, mermas sin justificar); cada punto
 * lleva a su sección. Las líneas se entregan y las paradas se completan aquí
 * mismo. Abajo, una barra fija con el botón. Al cerrar (finalizar_turno) se
 * genera el acta de siempre (src/lib/actaPdf.ts), se sube a Mis Actas y se
 * muestra en pantalla con Imprimir y Descargar PDF.
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
  /** Turno ya cerrado: el acta queda en pantalla. */
  const [cerrado, setCerrado] = useState<{ codigoTurno: string; actaPdf: Blob | null; errorActa: string | null } | null>(null)

  const cargando = sesion.cargando || prep.cargando || prod.cargando || pt.cargando || novedades.cargando

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  const recargarParadas = useCallback(async () => {
    if (sesion.turnoId) setParadas(await cargarParadasDelTurno(sesion.turnoId))
  }, [sesion.turnoId])
  useEffect(() => {
    recargarParadas()
  }, [recargarParadas])

  useEffect(() => {
    // Lecturas de Servicios Industriales de este turno (migración 20261057) — para la sección 2.4 del Acta.
    if (sesion.turnoId) listarLecturasServiciosIndustrialesDeTurno(sesion.turnoId).then(setServiciosIndustriales)
  }, [sesion.turnoId])

  if (cerrado) {
    return (
      <AppShell title="Finalizar Turno" description={`Turno ${cerrado.codigoTurno}`}>
        <TurnoCerrado {...cerrado} onVolver={() => navigate("/hub", { replace: true })} />
      </AppShell>
    )
  }

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

  /** Área de Pruebas: sin ceremonia — finalizar_turno() no exige resolver nada ahí. */
  const esPruebas = session?.area === "PRUEBAS"
  /** Mismo criterio que exigir_puede_finalizar() en el servidor (migración 20261083). */
  const soyResponsable = !sesion.sinResponsable && sesion.supervisorUsuario === session?.username.toLowerCase()
  const puedeFinalizar = esPruebas || (!sesion.sinResponsable && (soyResponsable || puede(session, "TURNO_CORREGIR") || !!session?.esDueno))
  const lineasActivas = lineas.filter((l) => l.activo)
  const sinResolver = esPruebas ? [] : prod.corridas.filter(corridaSinResolver)
  /** Paradas +1 sin minutos (o Falla sin especificar sin código): finalizar_turno() no deja cerrar (migración 20261090). */
  const paradasPendientes = paradas.filter((p) => p.pendiente)
  const tanquesSinConfirmar = prep.tanques.filter((t) => !t.confirmadoFinEn)
  const mermasSinJustificar = prod.corridas.filter((c) => {
    const m = mermaCorrida(c.id, prod.contadores, pt.registros, presentaciones)
    return m !== null && m.pct > LIMITE_MERMA * 100 && !prod.contadores.some((x) => x.corridaId === c.id && x.justificacion?.trim())
  })

  const lineasConProblema = [...new Set(sinResolver.map((c) => lineas.find((l) => l.codigo === c.linea)?.nombre ?? c.linea))]
  const puntos: PuntoCierre[] = [
    {
      seccion: "seccion-lineas",
      titulo: "Líneas",
      estado: sinResolver.length === 0 ? "ok" : "falta",
      texto: sinResolver.length === 0 ? "Todas terminadas o entregadas" : `Sin resolver: ${lineasConProblema.join(", ")}`,
    },
    {
      seccion: "seccion-paradas",
      titulo: "Paradas",
      estado: paradasPendientes.length === 0 ? "ok" : "falta",
      texto: paradasPendientes.length === 0 ? "Todas tienen minutos y código" : `${paradasPendientes.length} sin completar`,
    },
    {
      seccion: "seccion-tanques",
      titulo: "Tanques",
      estado: tanquesSinConfirmar.length === 0 ? "ok" : "aviso",
      texto:
        tanquesSinConfirmar.length === 0
          ? "Los 3 confirmados"
          : `${prep.tanques.length - tanquesSinConfirmar.length} de ${prep.tanques.length} confirmados (recomendado)`,
    },
    {
      seccion: "seccion-mermas",
      titulo: "Mermas",
      estado: mermasSinJustificar.length === 0 ? "ok" : "aviso",
      texto: mermasSinJustificar.length === 0 ? "Las mermas altas tienen justificación" : `${mermasSinJustificar.length} sobre el límite sin justificar`,
    },
  ]
  const faltan = [
    sinResolver.length > 0 ? `${lineasConProblema.length} ${lineasConProblema.length === 1 ? "línea sin resolver" : "líneas sin resolver"}` : null,
    paradasPendientes.length > 0 ? `${paradasPendientes.length} ${paradasPendientes.length === 1 ? "parada sin completar" : "paradas sin completar"}` : null,
  ].filter((x): x is string => x !== null)
  const aviso =
    tanquesSinConfirmar.length > 0 ? `${tanquesSinConfirmar.length} ${tanquesSinConfirmar.length === 1 ? "tanque sin confirmar" : "tanques sin confirmar"}` : null
  const bloqueoPermiso = puedeFinalizar
    ? null
    : sesion.sinResponsable
      ? "Este turno no tiene responsable. Asúmelo desde Comenzar Turno antes de finalizarlo."
      : `Solo ${sesion.supervisorNombre} (responsable del turno) o un jefe pueden finalizarlo.`

  // Mismo cálculo que la sección 2.1 del acta (el acta se genera con el turno cerrado).
  const eficiencia = eficienciaDelTurno({
    turnoTipo: sesion.turnoTipo ?? "TURNO_1",
    esquema: sesion.esquema ?? undefined,
    horaInicio: sesion.horaInicio,
    estado: "CERRADO",
    horasTranscurridas: 0,
    corridas: prod.corridas,
    contadores: prod.contadores,
    presentaciones,
    velocidades,
    paradas,
    lineas: lineasActivas.map((l) => l.codigo),
  })
  const presentacionDeLinea = (lineaCodigo: string) => {
    const n = lineaCodigo.replace(/^LINEA_T?/, "")
    const c = prod.corridas.find((x) => x.activa && x.linea.replace(/^LINEA_T?/, "") === n)
    return c ? Number(c.presentacion) : null
  }

  async function handleFinalizar() {
    if (faltan.length > 0 || !puedeFinalizar) return
    if (!session || !sesion.turnoId || !sesion.codigo || !sesion.fecha || !sesion.turnoTipo || !sesion.grupo) return
    setFinalizando(true)
    setErrorFinalizar(null)

    // Se guarda todo ANTES de cerrar — sesion.finalizarTurno() limpia la
    // identidad del turno, y con turnoId en null los hooks se vacían solos.
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
        const resultado = await subirYRegistrarActa(session.username, turnoId, session.area ?? "SIN_AREA", codigo, actaPdf)
        if (!resultado.ok) errorActa = `El acta no se pudo guardar en Mis Actas: ${resultado.error}`
      } catch {
        errorActa = "No se pudo generar el PDF del acta. Puede generarla de nuevo desde Auditoría."
      }
    }

    setFinalizando(false)
    setCerrado({ codigoTurno: codigo, actaPdf, errorActa })
  }

  return (
    <AppShell title="Finalizar Turno" description={`Turno ${sesion.codigo}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-28">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">Resumen del turno</CardTitle>
            <Badge variant="success">Abierto</Badge>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-muted-foreground">Supervisor</dt>
                <dd className="font-medium text-foreground">{sesion.supervisorNombre || session?.nombre || session?.username}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Turno</dt>
                <dd className="font-medium text-foreground">
                  {nombrePorCodigo(TURNO_TIPOS, sesion.turnoTipo ?? "TURNO_1")}
                  {sesion.esquema === "12x12" ? " · 12x12" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Grupo</dt>
                <dd className="font-medium text-foreground">{nombreGrupo(sesion.grupo ?? "GRUPO_1")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha</dt>
                <dd className="num font-medium text-foreground">{sesion.fecha ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Código</dt>
                <dd className="num font-medium text-foreground">{sesion.codigo}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <AntesDeCerrar puntos={puntos} />

        <LineasAlCierre
          lineas={lineasActivas}
          corridas={esPruebas ? [] : prod.corridas}
          productoTerminado={pt.registros}
          presentaciones={presentaciones}
          entregar={prod.entregarCorrida}
        />

        <ParadasAlCierre
          paradas={paradas}
          lineas={lineasActivas}
          usuario={session?.username ?? ""}
          area={esPruebas ? "PRUEBAS" : "ASEPTICO"}
          presentacionDeLinea={presentacionDeLinea}
          onCambio={recargarParadas}
        />

        <Card id="seccion-tanques" className="scroll-mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Estado final de tanques</CardTitle>
            <p className="text-sm text-muted-foreground">Así quedan para el turno siguiente.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
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
            {tanquesSinConfirmar.length === 0 && <p className="text-sm text-muted-foreground">Los 3 tanques ya tienen su estado final confirmado.</p>}
          </CardContent>
        </Card>

        <ProduccionDelTurno
          lineas={lineasActivas}
          eficiencia={eficiencia}
          corridas={prod.corridas}
          contadores={prod.contadores}
          productoTerminado={pt.registros}
          presentaciones={presentaciones}
        />

        <MermasPorLote
          lineas={lineasActivas}
          corridas={prod.corridas}
          contadores={prod.contadores}
          productoTerminado={pt.registros}
          presentaciones={presentaciones}
        />

        {/* Opcional — nadie tiene que llenarla para poder finalizar. Alimenta "2.3 Novedades del turno" del Acta. */}
        <NovedadesTurno />

        {prep.tanques.some((t) => t.condicion === "EN_PREPARACION") && prep.preparaciones.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preparaciones en curso</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {prep.preparaciones
                .filter((p) => prep.tanques.some((t) => t.numeroTanque === p.numeroTanque && t.condicion === "EN_PREPARACION"))
                .map((p) => (
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
            </CardContent>
          </Card>
        )}

        {errorFinalizar && (
          <div className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{errorFinalizar}</span>
          </div>
        )}
      </div>

      <BarraFinalizar
        faltan={faltan}
        aviso={aviso}
        bloqueoPermiso={bloqueoPermiso}
        codigo={sesion.codigo ?? ""}
        finalizando={finalizando}
        onFinalizar={handleFinalizar}
      />
    </AppShell>
  )
}
