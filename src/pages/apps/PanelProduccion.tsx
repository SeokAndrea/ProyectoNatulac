import { useMemo, useState } from "react"
import { Gauge, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { BannerSuperior } from "@/components/panel/BannerSuperior"
import {
  estadoDeLineas,
  filasDeLineas,
  produccionPorLineaDe,
  programacionDelDia,
  textoUltimaActualizacion,
  ultimaAccionDeTurno,
} from "@/components/panel/calculosPanel"
import { DetalleTurno } from "@/components/panel/DetalleTurno"
import { ElegirTramoTurno } from "@/components/panel/ElegirTramoTurno"
import { FiltrosPanel } from "@/components/panel/FiltrosPanel"
import { TituloSeccion } from "@/components/panel/PanelCard"
import { ParadaMasLarga } from "@/components/panel/ParadaMasLarga"
import { ResumenPlanta } from "@/components/panel/resumen-planta/ResumenPlanta"
import { SeccionLineas } from "@/components/panel/SeccionLineas"
import { SeccionMermas } from "@/components/panel/SeccionMermas"
import { SeccionTanques } from "@/components/panel/SeccionTanques"
import { usePanelTurno } from "@/components/panel/usePanelTurno"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { eficienciaDelTurno } from "@/lib/eficiencia"
import { minutosPorLinea } from "@/lib/paradas"
import { puede } from "@/lib/permisos"
import { horasTranscurridasTurno, mermaEnvasesTurno, mermaSemielaboradoTurno } from "@/lib/reportes"

/*
 * Panel de Producción: vista EN VIVO del turno en curso (banner de
 * cabecera con hora/cajas/litros/meta/supervisor, y abajo tanques,
 * líneas y merma del turno anterior) — con selector de fecha/turno
 * para ver turnos anteriores.
 *
 * Esta página solo arma las piezas: los datos y el refresco en vivo
 * salen de usePanelTurno(), cada sección vive en src/components/panel/
 * y las cuentas en calculosPanel.ts. Utilidades CSS (panel-banner,
 * panel-grid, shadow-panel, tank-glass, liquid-bubble, dot-ring,
 * rise-in) viven al final de src/index.css.
 */
export default function PanelProduccion() {
  const { session } = useAuth()
  /** Para quien carga el turno, tanques y líneas del panel llevan a Preparación (donde puede tocarlos). */
  const esSupervisor = session?.rol !== "SUPERADMINISTRADOR" && puede(session ?? null, "TURNO_CARGAR")
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const {
    turno,
    tramos,
    turnoAnterior,
    cargando,
    buscado,
    enVivo,
    fecha,
    turnoTipo,
    ahora,
    puedeElegirArea,
    areaFiltro,
    areaEfectiva,
    supervisorCargo,
    servIndustriales,
    planDia,
    produccionDia,
    paradasTurno,
    prep,
    prod,
    pt,
    prepAnterior,
    prodAnterior,
    ptAnterior,
    elegirArea,
    elegirTurnoTipo,
    elegirFecha,
    verEnVivo,
    elegirTramo,
  } = usePanelTurno()

  // ------------------------------------------------------------ cuentas
  const horasTurnoActual = turno ? horasTranscurridasTurno(turno.horaInicio, turno.estado, turno.horaFin) : 0
  // Meta y eficiencia con paradas (src/lib/eficiencia.ts, plan-eficiencia-meta.md): base = turno completo;
  // la meta baja con las Programadas y el Ocioso; la eficiencia baja solo con las No programadas.
  const eficiencia = turno
    ? eficienciaDelTurno({
        turnoTipo: turno.turnoTipo,
        esquema: turno.esquema,
        horaInicio: turno.horaInicio,
        estado: turno.estado,
        horasTranscurridas: horasTurnoActual,
        corridas: prod.corridas,
        contadores: prod.contadores,
        presentaciones,
        velocidades,
        paradas: paradasTurno,
        lineas: lineas.map((l) => l.codigo),
        ahora,
      })
    : null
  const meta = turno
    ? {
        pctCumplimiento: eficiencia?.total?.avancePct ?? null,
        ritmoPct: eficiencia?.total?.eficienciaPct ?? null,
        totalReales: eficiencia?.total?.realCajas ?? 0,
        totalEsperadas: eficiencia?.total?.metaCajas ?? 0,
      }
    : null
  const litrosProducidos = pt.registros.reduce((a, p) => a + p.litrosProducidos, 0)
  const lineasEstado = turno ? estadoDeLineas(prod.corridas, prod.lineasEstado, lineas) : []
  const produccionPorLinea = turno ? produccionPorLineaDe(pt.registros, lineas, presentaciones) : []
  const cajasProducidasTotal = produccionPorLinea.reduce((a, l) => a + l.cajas, 0)
  /*
   * "Producción del turno": Cajas / Litros del banner son SIEMPRE del
   * turno cargado — se mueven con lo que carga el supervisor activo. El
   * acumulado de la jornada (los 3 turnos) solo lo usa el carrusel de
   * Programación diaria, para cruzarlo contra el plan del día.
   */
  const usarDiario = enVivo && produccionDia.length > 0
  const mermaEnvases = turno ? mermaEnvasesTurno(prod.contadores, pt.registros, presentaciones) : null
  const mermaSemielaborado = turno
    ? mermaSemielaboradoTurno(turno.id, prep.preparaciones, prod.corridas, pt.registros, prod.contadores, presentaciones, prep.transferencias, prep.desvases)
    : null
  // "Turno pasado": mismas funciones, mismo `presentaciones` ya cargado
  // que el turno actual. Al correr en el render se recalculan solas
  // cuando el catálogo termina de cargar.
  const mermaEnvasesAnterior = turnoAnterior ? mermaEnvasesTurno(prodAnterior.contadores, ptAnterior.registros, presentaciones) : null
  const mermaSemielaboradoAnterior = turnoAnterior
    ? mermaSemielaboradoTurno(
        turnoAnterior.id,
        prepAnterior.preparaciones,
        prodAnterior.corridas,
        ptAnterior.registros,
        prodAnterior.contadores,
        presentaciones,
        prepAnterior.transferencias,
        prepAnterior.desvases,
      )
    : null
  const programacionItems = useMemo(
    () => programacionDelDia(planDia, produccionDia, usarDiario, pt.registros, presentaciones),
    [pt.registros, presentaciones, planDia, produccionDia, usarDiario],
  )
  const filasLineas = filasDeLineas({
    lineasEstado,
    produccionPorLinea,
    corridas: prod.corridas,
    contadores: prod.contadores,
    productoTerminado: pt.registros,
    presentaciones,
    eficiencia,
    minutosParadaPorLinea: new Map(minutosPorLinea(paradasTurno, ahora).map((r) => [r.linea, r.minutos])),
    ahora,
  })
  const ultimaAccion = turno ? ultimaAccionDeTurno(prod.corridas, prep.tanques, prod.contadores, pt.registros, prep.preparaciones) : null

  // ------------------------------------------------------------ pantalla
  return (
    <AppShell title="Panel de Producción" description="Estado de la planta en vivo" fullWidth ocultarEstadoBanner>
      <div className="flex flex-col gap-5">
        <BannerSuperior
          turno={turno}
          buscado={buscado}
          enVivo={enVivo}
          fecha={fecha}
          turnoTipo={turnoTipo}
          textoUltimaActualizacion={textoUltimaActualizacion(ultimaAccion, ahora)}
          puedeElegirArea={puedeElegirArea}
          areaFiltro={areaFiltro}
          supervisorCargo={supervisorCargo}
          cajas={cajasProducidasTotal}
          litros={litrosProducidos}
          programacionItems={programacionItems}
          meta={meta}
          onAlternarFiltros={() => setMostrarFiltros((v) => !v)}
          onAbrirFiltros={() => setMostrarFiltros(true)}
        />

        {mostrarFiltros && (
          <FiltrosPanel
            puedeElegirArea={puedeElegirArea}
            areaFiltro={areaFiltro}
            turnoTipo={turnoTipo}
            fecha={fecha}
            cargando={cargando}
            onArea={elegirArea}
            onTurnoTipo={elegirTurnoTipo}
            onFecha={elegirFecha}
            onEnVivo={verEnVivo}
          />
        )}

        {!enVivo && <ElegirTramoTurno tramos={tramos} turnoId={turno?.id} onElegir={elegirTramo} />}

        {cargando || cargandoCatalogos ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !turno ? (
          <EmptyState
            icon={Gauge}
            title={enVivo ? "Todavía no se registró ningún turno" : "No hay ningún turno para esa fecha/turno"}
            description={
              enVivo ? "En cuanto un supervisor inicie el primer turno, tanques y líneas van a aparecer acá." : "Prueba con otra fecha o tipo de turno."
            }
          />
        ) : (
          <>
            {/* ------- TANQUES (angosta, izquierda, alta) · LÍNEAS + MERMAS/PARADAS (derecha) ------- */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
              <div className="rise-in flex flex-col gap-4 xl:col-span-4">
                <SeccionTanques
                  tanques={prep.tanques}
                  preparaciones={prep.preparaciones}
                  servIndustriales={servIndustriales}
                  ahora={ahora}
                  conLinks={esSupervisor}
                />
                <ParadaMasLarga paradas={paradasTurno} lineas={lineas} ahora={ahora} />
              </div>

              <div className="flex flex-col gap-4 xl:col-span-8">
                <SeccionLineas filas={filasLineas} conLinks={esSupervisor} />
                <SeccionMermas
                  envasePasado={mermaEnvasesAnterior?.pct ?? null}
                  envaseActual={mermaEnvases?.pct ?? null}
                  semielaboradoPasado={mermaSemielaboradoAnterior?.pct ?? null}
                  semielaboradoActual={mermaSemielaborado?.pct ?? null}
                />
              </div>
            </div>

            <DetalleTurno
              turno={turno}
              areaEfectiva={areaEfectiva}
              eficiencia={eficiencia}
              lineas={lineas}
              paradas={paradasTurno}
              preparaciones={prep.preparaciones}
              corridas={prod.corridas}
              productoTerminado={pt.registros}
              contadores={prod.contadores}
              transferencias={prep.transferencias}
              desvases={prep.desvases}
            />
          </>
        )}

        <div className="flex flex-col gap-3">
          <TituloSeccion>Histórico</TituloSeccion>
          <SeccionColapsable titulo="Resumen de Planta" descripcion="KPIs, matriz grupo × supervisor y tablas en un rango de fechas.">
            <ResumenPlanta areaCodigo={areaEfectiva} />
          </SeccionColapsable>
        </div>
      </div>
    </AppShell>
  )
}
