import { supabase } from "@/lib/supabase"
import { GRUPOS, TURNO_TIPOS, type GrupoCodigo, type LineaCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { listarSabores } from "@/lib/sabores"

/*
 * Generador de datos de prueba: crea turnos CERRADOS completos
 * (Recepción + Contadores + Producto Terminado) para 3 supervisores
 * de prueba, usando las mismas funciones RPC que usa la app real
 * (iniciar_turno, registrar_contador, registrar_producto_terminado,
 * finalizar_turno) — así los datos quedan consistentes con lo que
 * generaría un supervisor real, no un insert directo que se salte
 * las reglas.
 *
 * Solo para el servidor de pruebas. Se puede llamar varias veces sin
 * problema: los supervisores de prueba se crean una sola vez (si ya
 * existen, se ignora el error de "usuario ya existe").
 */
const SUPERVISORES_PRUEBA = [
  { usuario: "prueba1", nombre: "Supervisor Prueba 1", cedula: "1000000001" },
  { usuario: "prueba2", nombre: "Supervisor Prueba 2", cedula: "1000000002" },
  { usuario: "prueba3", nombre: "Supervisor Prueba 3", cedula: "1000000003" },
]

const HORARIOS: Record<TurnoTipoCodigo, { inicio: string; fin: string; cruzaMedianoche: boolean }> = {
  TURNO_1: { inicio: "07:00:00", fin: "15:00:00", cruzaMedianoche: false },
  TURNO_2: { inicio: "15:00:00", fin: "22:30:00", cruzaMedianoche: false },
  TURNO_3: { inicio: "22:30:00", fin: "07:00:00", cruzaMedianoche: true },
  "12X12": { inicio: "07:00:00", fin: "19:00:00", cruzaMedianoche: false },
}

function elegir<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)]
}

function entero(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sumarDias(fechaIso: string, dias: number) {
  const d = new Date(`${fechaIso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function asegurarSupervisoresPrueba(usuarioSesion: string) {
  for (const sup of SUPERVISORES_PRUEBA) {
    const { error } = await supabase.rpc("crear_usuario", {
      p_creador_usuario: usuarioSesion,
      p_usuario: sup.usuario,
      p_password: "prueba1234",
      p_rol_codigo: "SUPERVISOR",
      p_area_codigo: "ASEPTICO",
      p_nombre: sup.nombre,
      p_cedula: sup.cedula,
    })
    // 23505 = ya existe (de una corrida anterior) — no es un error real acá.
    if (error && error.code !== "23505") {
      throw new Error(`No se pudo crear ${sup.usuario}: ${error.message}`)
    }
  }
}

export async function generarDatosPrueba(
  usuarioSesion: string,
  velocidades: VelocidadLive[],
  presentaciones: PresentacionLive[],
  turnosPorSupervisor: number,
  onProgreso: (mensaje: string) => void,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const velocidadesActivas = velocidades.filter((v) => v.activo)
  if (velocidadesActivas.length === 0) {
    return { ok: false, error: "No hay velocidades de llenadora cargadas — no se puede elegir línea/presentación." }
  }

  try {
    onProgreso("Creando supervisores de prueba...")
    await asegurarSupervisoresPrueba(usuarioSesion)

    const sabores = (await listarSabores()).filter((s) => s.activo)
    const lineasDisponibles = [...new Set(velocidadesActivas.map((v) => v.linea))] as LineaCodigo[]
    const hoy = new Date().toISOString().slice(0, 10)

    let total = 0

    for (const sup of SUPERVISORES_PRUEBA) {
      for (let i = 0; i < turnosPorSupervisor; i++) {
        const fecha = sumarDias(hoy, -entero(0, 29))
        const turnoTipo = elegir(TURNO_TIPOS.map((t) => t.codigo)) as TurnoTipoCodigo
        const grupo = elegir(GRUPOS.map((g) => g.codigo)) as GrupoCodigo
        const horario = HORARIOS[turnoTipo]

        const nLineas = entero(1, Math.min(3, lineasDisponibles.length))
        const lineasElegidas = [...lineasDisponibles].sort(() => Math.random() - 0.5).slice(0, nLineas)

        const lineasPayload = lineasElegidas.map((linea) => {
          const v = elegir(velocidadesActivas.filter((x) => x.linea === linea))
          return {
            linea_codigo: linea,
            presentacion_volumen_ml: Number(v.presentacion),
            envases_hora: v.envasesHora,
            litros_hora: v.litrosHora,
          }
        })

        onProgreso(`${sup.nombre}: turno ${i + 1}/${turnosPorSupervisor} (${fecha})...`)

        const { data: turnoData, error: errorInicio } = await supabase.rpc("iniciar_turno", {
          p_usuario: sup.usuario,
          p_area_codigo: "ASEPTICO",
          p_turno_tipo_codigo: turnoTipo,
          p_grupo_codigo: grupo,
          p_lineas: lineasPayload,
          p_tanques: [1, 2, 3].map((n) => ({
            numero_tanque: n,
            sabor_id: sabores.length > 0 ? elegir(sabores).id : null,
            condicion: "VOLUMEN",
            volumen_l: entero(5000, 20000),
            lote: `PRUEBA-${entero(1000, 9999)}`,
          })),
          p_fecha: fecha,
          p_hora_inicio: horario.inicio,
        })

        if (errorInicio || !turnoData) continue
        const turnoId = (turnoData as { id: string }).id

        for (const lp of lineasPayload) {
          const pres = presentaciones.find((p) => p.volumenMl === lp.presentacion_volumen_ml)
          if (!pres) continue

          let llenadoraTotal = 0
          let desechadosTotal = 0
          const nContadores = entero(1, 2)
          for (let c = 0; c < nContadores; c++) {
            const llenadora = entero(2000, 9000)
            // 1 de cada 5 contadores sale con merma alta, para que se vea variedad.
            const mermaPct = Math.random() < 0.2 ? entero(4, 8) : entero(0, 3)
            const desechados = Math.round((llenadora * mermaPct) / 100)
            const buenos = llenadora - desechados
            llenadoraTotal += llenadora
            desechadosTotal += desechados

            await supabase.rpc("registrar_contador", {
              p_turno_id: turnoId,
              p_linea_codigo: lp.linea_codigo,
              p_envases_llenadora: llenadora,
              p_envases_buenos: buenos,
              p_envases_desechados: desechados,
              p_justificacion: mermaPct > 3 ? "Dato de prueba — ajuste de máquina" : "",
              p_usuario: sup.usuario,
            })
          }

          // Merma real: la de la llenadora + una pérdida extra de empaque (0-2%).
          const perdidaExtraPct = entero(0, 2)
          const envasesEmpacados = Math.max(
            0,
            Math.round((llenadoraTotal - desechadosTotal) * (1 - perdidaExtraPct / 100)),
          )
          const cajasTotales = Math.floor(envasesEmpacados / pres.envasesXCaja)
          const paletas = Math.floor(cajasTotales / pres.cajasXPaleta)
          const cajasSueltas = cajasTotales % pres.cajasXPaleta

          await supabase.rpc("registrar_producto_terminado", {
            p_turno_id: turnoId,
            p_linea_codigo: lp.linea_codigo,
            p_sabor_id: sabores.length > 0 ? elegir(sabores).id : null,
            p_volumen_ml: lp.presentacion_volumen_ml,
            p_paletas: paletas,
            p_cajas_sueltas: cajasSueltas,
            p_usuario: sup.usuario,
          })
        }

        const fechaFin = horario.cruzaMedianoche ? sumarDias(fecha, 1) : fecha
        await supabase.rpc("finalizar_turno", {
          p_turno_id: turnoId,
          p_fecha_fin: fechaFin,
          p_hora_fin: horario.fin,
        })

        total++
      }
    }

    return { ok: true, total }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido generando datos de prueba." }
  }
}
