import { fechaLocal } from "@/lib/turno"
import type { FilaValidacion, ValoresProduccion } from "@/lib/validacion"

/*
 * DATOS DE PRUEBA para el preview /validar-demo. No se importa desde
 * ningún flujo real. Se borra al conectar la página real a los RPC.
 */
function dia(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return fechaLocal(d)
}

/** Arma los valores del supervisor con las mermas ya calculadas. */
function valores(o: {
  paletas: number
  cajasSueltas: number
  cajasXPaleta: number
  envasesXCaja: number
  litrosXCaja: number
  volumenMl: number
  envasesLlenadora: number
}): ValoresProduccion {
  const cajas = o.paletas * o.cajasXPaleta + o.cajasSueltas
  const envasesPt = cajas * o.envasesXCaja
  const litrosConsumidos = Math.round((o.envasesLlenadora * o.volumenMl) / 1000)
  const litrosProducidos = Math.round(cajas * o.litrosXCaja)
  return {
    paletas: o.paletas,
    cajasSueltas: o.cajasSueltas,
    cajas,
    envasesLlenadora: o.envasesLlenadora,
    litrosConsumidos,
    litrosProducidos,
    mermaEnvasesPct: o.envasesLlenadora > 0 ? Math.round((1 - envasesPt / o.envasesLlenadora) * 1000) / 10 : null,
    mermaSemielaboradoPct:
      litrosConsumidos > 0 ? Math.round((1 - litrosProducidos / litrosConsumidos) * 1000) / 10 : null,
  }
}

const P350 = { cajasXPaleta: 120, envasesXCaja: 24, litrosXCaja: 8.4, volumenMl: 350 }
const P1000 = { cajasXPaleta: 48, envasesXCaja: 12, litrosXCaja: 12, volumenMl: 1000 }

export const FILAS_VALIDACION_DEMO: FilaValidacion[] = [
  {
    turnoLineaId: "tl1",
    turnoCodigo: `A${dia(1).replace(/-/g, "")}_T1G2`,
    fecha: dia(1),
    supervisorNombre: "Andrés Gómez",
    areaNombre: "Producción Aséptico",
    linea: "Línea 1",
    presentacion: "1000 ml",
    sabor: "Manzana 35%",
    lote: "0012",
    estado: "PENDIENTE",
    supervisor: valores({ ...P1000, paletas: 18, cajasSueltas: 20, envasesLlenadora: 10800 }),
    overrides: null,
    validadoPorNombre: null,
    validadoEn: null,
  },
  {
    turnoLineaId: "tl2",
    turnoCodigo: `A${dia(1).replace(/-/g, "")}_T1G2`,
    fecha: dia(1),
    supervisorNombre: "Andrés Gómez",
    areaNombre: "Producción Aséptico",
    linea: "Línea 2",
    presentacion: "350 ml",
    sabor: "Pera (Jucosa)",
    lote: "0013",
    estado: "PENDIENTE",
    supervisor: valores({ ...P350, paletas: 9, cajasSueltas: 60, envasesLlenadora: 26400 }),
    overrides: null,
    validadoPorNombre: null,
    validadoEn: null,
  },
  {
    turnoLineaId: "tl3",
    turnoCodigo: `V${dia(1).replace(/-/g, "")}_T3G1`,
    fecha: dia(1),
    supervisorNombre: "Karla Méndez",
    areaNombre: "Producción Vacío",
    linea: "Línea 2",
    presentacion: "1000 ml",
    sabor: "Naranja",
    lote: "0007",
    estado: "EDITADO",
    supervisor: valores({ ...P1000, paletas: 12, cajasSueltas: 0, envasesLlenadora: 7400 }),
    overrides: { cajasSueltas: 8, litrosConsumidos: 6900, nota: "Contó una camada de más al cierre." },
    validadoPorNombre: "Daniela Ríos",
    validadoEn: `${dia(0)}T09:20:00`,
  },
  {
    turnoLineaId: "tl4",
    turnoCodigo: `A${dia(2).replace(/-/g, "")}_T2G1`,
    fecha: dia(2),
    supervisorNombre: "Pedro Salas",
    areaNombre: "Producción Aséptico",
    linea: "Línea 3",
    presentacion: "350 ml",
    sabor: "Durazno (Selecto)",
    lote: "0005",
    estado: "CONFIRMADO",
    supervisor: valores({ ...P350, paletas: 7, cajasSueltas: 22, envasesLlenadora: 21600 }),
    overrides: null,
    validadoPorNombre: "Daniela Ríos",
    validadoEn: `${dia(1)}T18:05:00`,
  },
  {
    turnoLineaId: "tl5",
    turnoCodigo: `A${dia(2).replace(/-/g, "")}_T2G1`,
    fecha: dia(2),
    supervisorNombre: "Pedro Salas",
    areaNombre: "Producción Aséptico",
    linea: "Línea 1",
    presentacion: "1000 ml",
    sabor: "Manzana (Jucosa)",
    lote: "0001",
    estado: "PENDIENTE",
    supervisor: valores({ ...P1000, paletas: 20, cajasSueltas: 0, envasesLlenadora: 14069 }),
    overrides: null,
    validadoPorNombre: null,
    validadoEn: null,
  },
]
