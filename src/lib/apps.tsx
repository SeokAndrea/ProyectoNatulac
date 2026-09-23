import type { LucideIcon } from "lucide-react"
import {
  PlayCircle,
  PackageCheck,
  ClipboardCheck,
  DatabaseZap,
  History,
  ListChecks,
  Beaker,
  Factory,
  RadioTower,
  CalendarRange,
  Thermometer,
  Wrench,
  ShieldAlert,
  FileText,
  Calculator,
  FlaskConical,
  Scale,
  BookOpen,
} from "lucide-react"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"

export interface AppDef {
  slug: string
  title: string
  description: string
  /** Sin href = todavía no tiene página propia (tarjeta deshabilitada, "Próximamente"). */
  href?: string
  icon: LucideIcon
  /**
   * Si es true, la tarjeta aparece bloqueada en el hub (gris, con
   * candado, sin link) mientras no haya un turno en curso. Ver la
   * lógica en Hub.tsx y el estado en src/lib/turno.tsx.
   */
  requiereTurno: boolean
  /**
   * Si se define, la tarjeta solo aparece para usuarios con alguno de
   * estos roles (ver session.rol en src/lib/auth.tsx). Sin esta
   * propiedad, la tarjeta es visible para cualquier rol. Tiene que
   * coincidir con el rolesPermitidos de la misma ruta en src/App.tsx.
   */
  rolesPermitidos?: RolCodigo[]
  /** Si se define, la tarjeta solo aparece para usuarios de estas áreas (ej. Servicios Industriales, que no tiene un rol propio). Tiene que coincidir con el areasPermitidas de la misma ruta en src/App.tsx. */
  areasPermitidas?: AreaCodigo[]
  /**
   * Si se define, la tarjeta NO aparece para usuarios de estas áreas,
   * aunque su rol sí califique (ej. Servicios Industriales usa el rol
   * SUPERVISOR — igual que Aséptico/Vacío — pero no tiene que ver
   * corridas de producción: Comenzar Turno, Preparación, Líneas,
   * Producto Terminado, Finalizar Turno, Mis Actas y Programación
   * quedan afuera para esa área). Tiene que coincidir con el
   * areasExcluidas de la misma ruta en src/App.tsx.
   */
  areasExcluidas?: AreaCodigo[]
  /** Atajo chico junto al saludo del hub, en vez de la grilla principal (ver Hub.tsx). */
  atajo?: boolean
  /** Se bloquea (gris) cuando SÍ hay un turno en curso — lo opuesto de requiereTurno (ver Comenzar Turno). */
  bloqueaConTurno?: boolean
  /** Se resalta en rojo cuando hay un turno en curso, para que sea obvio el siguiente paso (ver Finalizar Turno). */
  resaltarConTurno?: boolean
  /** Color fijo del ícono/tarjeta (por defecto: primary) — para distinguir a simple vista pasos como Comenzar/Preparación/Finalizar. */
  color?: "success" | "blue" | "purple" | "warning" | "danger"
  /** Si es true, la tarjeta solo aparece para usuarios con usuarios.ve_errores = true (flag aparte del rol, ver session.veErrores y migración 20261047090000) — hoy solo el dueño. Tiene que coincidir con el requiereVeErrores de la misma ruta en src/App.tsx. */
  veErroresSolo?: boolean
  /**
   * Grupo bajo el que aparece la tarjeta en la grilla principal del hub,
   * con un separador y título arriba (ver Hub.tsx). Sin esta propiedad,
   * la tarjeta va suelta, sin sección (ej. Servicios Industriales, que
   * ya tiene su propia vista acotada por área).
   */
  seccion?: "produccion" | "auditoria" | "base-datos"
}

/*
 * Listado de aplicaciones que aparecen como tarjetas en el hub (Hub.tsx).
 * Para agregar una app nueva:
 *   1. Sumar un objeto aquí con su slug, título, descripción, ruta (href)
 *      e ícono (ver la lista completa en https://lucide.dev/icons), si
 *      requiere o no un turno iniciado, y a qué roles se les muestra
 *      (rolesPermitidos, opcional).
 *   2. Crear la página en src/pages/apps/ y registrar esa misma ruta
 *      (href) en src/App.tsx dentro de <Routes>, con el mismo
 *      rolesPermitidos.
 * No hace falta tocar Hub.tsx: la grilla se genera automáticamente a
 * partir de este arreglo, filtrada por rol.
 */
export const apps: AppDef[] = [
  {
    slug: "comenzar-turno",
    title: "Comenzar Turno",
    description: "Registra el inicio de tu turno de producción.",
    href: "/turno",
    icon: PlayCircle,
    requiereTurno: false,
    rolesPermitidos: ["SUPERVISOR", "SUPERADMINISTRADOR"],
    // Servicios Industriales usa el rol SUPERVISOR pero no arranca turnos de producción.
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    bloqueaConTurno: true,
    color: "success",
    seccion: "produccion",
  },
  {
    slug: "preparacion",
    title: "Preparación",
    description: "Preparar y liberar tanques — en cualquier momento del turno.",
    href: "/preparacion",
    icon: Beaker,
    requiereTurno: true,
    rolesPermitidos: ["SUPERVISOR", "SUPERADMINISTRADOR"],
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    color: "blue",
    seccion: "produccion",
  },
  {
    slug: "lineas",
    title: "Líneas",
    description: "Activar o detener corridas de las 3 líneas — en cualquier momento del turno.",
    href: "/lineas",
    icon: Factory,
    requiereTurno: true,
    rolesPermitidos: ["SUPERVISOR", "SUPERADMINISTRADOR"],
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    color: "blue",
    seccion: "produccion",
  },
  {
    slug: "producto-terminado",
    title: "Producto Terminado y Contador",
    description: "Carga los lotes de producto terminado y el contador de envases por línea.",
    href: "/producto-terminado",
    icon: PackageCheck,
    requiereTurno: true,
    rolesPermitidos: ["SUPERVISOR", "SUPERADMINISTRADOR"],
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    seccion: "produccion",
  },
  {
    slug: "finalizar-turno",
    title: "Finalizar Turno",
    description: "Resumen y cierre del turno con los contadores por línea.",
    href: "/finalizar-turno",
    icon: ClipboardCheck,
    requiereTurno: true,
    rolesPermitidos: ["SUPERVISOR", "SUPERADMINISTRADOR"],
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    resaltarConTurno: true,
    seccion: "produccion",
  },
  {
    slug: "mis-actas",
    title: "Mis Actas",
    description: "Actas de tus turnos cerrados — verlas y descargarlas cuando quieras.",
    href: "/mis-actas",
    icon: FileText,
    requiereTurno: false,
    rolesPermitidos: ["SUPERVISOR", "SUPERADMINISTRADOR"],
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    seccion: "auditoria",
  },
  {
    slug: "panel-produccion",
    title: "Panel de Producción",
    description: "Tanques, meta y merma del turno en curso — en vivo.",
    href: "/panel-produccion",
    icon: RadioTower,
    requiereTurno: false,
    atajo: true,
  },
  {
    slug: "paradas",
    title: "Registrar Paradas",
    description: "Paradas programadas y tiempo ocioso, por línea — el supervisor las carga a mano.",
    href: "/paradas",
    icon: Wrench,
    requiereTurno: false,
    // Supervisores y Super Administrador registran paradas; tiene que coincidir con la ruta /paradas de src/App.tsx.
    rolesPermitidos: ["SUPERVISOR", "SUPERADMINISTRADOR"],
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    seccion: "produccion",
  },
  {
    slug: "catalogo-paradas",
    title: "Catálogo de Paradas",
    description: "Editar los tipos de parada, su clase, código y tiempo guía.",
    href: "/catalogo-paradas",
    icon: Wrench,
    requiereTurno: false,
    // Solo SUPERADMINISTRADOR (el Área de Pruebas también entra). Tiene que coincidir con la ruta en src/App.tsx.
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    seccion: "base-datos",
  },
  {
    slug: "paradas-mantenimiento",
    title: "Paradas de Mantenimiento",
    description: "Registrar las paradas de Aséptico con el catálogo de siempre, con hora de inicio y fin.",
    href: "/paradas-mantenimiento",
    icon: Wrench,
    requiereTurno: false,
    // Solo el área de Mantenimiento (el Área de Pruebas también entra). Coincide con la ruta en src/App.tsx.
    areasPermitidas: ["MANTENIMIENTO"],
    atajo: true,
  },
  {
    slug: "panel-paradas",
    title: "Panel de Paradas",
    description: "Downtime de las líneas: tiempo perdido, ocioso y desvío contra el tiempo guía por tipo.",
    href: "/panel-paradas",
    icon: RadioTower,
    requiereTurno: false,
    // Dashboard de solo lectura: visible para cualquier sesión, como el Panel de Producción.
    atajo: true,
  },
  {
    slug: "programacion",
    title: "Programación",
    description: "Qué se planificó producir en la jornada, por sabor y en cajas.",
    href: "/programacion",
    icon: CalendarRange,
    requiereTurno: false,
    // Programación es de producción — Servicios Industriales no la necesita.
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    atajo: true,
  },
  {
    // Placeholder: sin href, el hub la muestra deshabilitada ("Próximamente").
    slug: "manual",
    title: "Manual",
    description: "Manual de usuario de la aplicación.",
    icon: BookOpen,
    requiereTurno: false,
    atajo: true,
  },
  {
    slug: "servicios-industriales",
    title: "Servicios Industriales",
    description: "Cargar Temperatura del Quantum, Agua Osmotizada y Gasoil.",
    href: "/servicios-industriales",
    icon: Thermometer,
    requiereTurno: false,
    areasPermitidas: ["SERVICIOS_INDUSTRIALES"],
  },
  {
    slug: "registros-servicios-industriales",
    title: "Registros del Área",
    description: "Historial de Temperatura del Quantum, Agua Osmotizada y Gasoil cargados.",
    href: "/registros-servicios-industriales",
    icon: History,
    requiereTurno: false,
    areasPermitidas: ["SERVICIOS_INDUSTRIALES"],
  },
  {
    slug: "auditoria",
    title: "Auditoría",
    description: "Qué hizo cada supervisor, turno por turno: resumen, línea de tiempo, actas y registro de cambios.",
    href: "/auditoria",
    icon: History,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    color: "blue",
    seccion: "auditoria",
  },
  {
    slug: "validar",
    title: "Validar",
    description: "Revisar y fijar los datos de producción de cada turno cerrado — lo validado alimenta los KPIs.",
    href: "/validar",
    icon: ListChecks,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    color: "warning",
    seccion: "auditoria",
  },
  {
    slug: "calculadoras",
    title: "Calculadoras",
    description: "Fórmula de producto, bobina y conteo por peso.",
    href: "/calculadoras",
    icon: Calculator,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    atajo: true,
  },
  {
    slug: "edicion-datos",
    title: "Edición de Datos",
    description: "Catálogos generales de la planta: sabores, presentaciones, líneas y más.",
    href: "/edicion-datos",
    icon: DatabaseZap,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    seccion: "base-datos",
  },
  {
    slug: "errores",
    title: "Errores",
    description: "Errores que le salieron a alguien usando la app — quién, cuándo, qué intentaba hacer.",
    href: "/errores",
    icon: ShieldAlert,
    requiereTurno: false,
    veErroresSolo: true,
    color: "danger",
    seccion: "base-datos",
  },
]

/*
 * Las 3 calculadoras no aparecen sueltas en el Hub — se agrupan bajo
 * la tarjeta "Calculadoras" de arriba (ver src/pages/apps/Calculadoras.tsx).
 * Sus rutas siguen registradas normalmente en src/App.tsx.
 */
export const appsCalculadoras: AppDef[] = [
  {
    slug: "calculadora-bobina",
    title: "Calculadora de Bobina",
    description: "Envases restantes en una bobina de material de empaque, según la medida del core al borde.",
    href: "/calculadora-bobina",
    icon: Calculator,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    color: "success",
  },
  {
    slug: "calculadora-formula",
    title: "Calculadora de Fórmula",
    description: "Insumos de materia prima a pedir según el sabor y la cantidad de tambores o kits a preparar.",
    href: "/calculadora-formula",
    icon: FlaskConical,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    color: "purple",
  },
  {
    slug: "calculadora-conteo-peso",
    title: "Calculadora de Conteo por Peso",
    description: "Pitillos y tapas restantes en una caja, según su peso.",
    href: "/calculadora-conteo-peso",
    icon: Scale,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
    color: "blue",
  },
]
