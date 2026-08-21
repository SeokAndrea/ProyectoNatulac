import type { LucideIcon } from "lucide-react"
import { PlayCircle, PackageCheck, Gauge, ClipboardCheck, BarChart3, Calculator, Users, DatabaseZap, History } from "lucide-react"
import type { RolCodigo } from "@/lib/catalogos"

export interface AppDef {
  slug: string
  title: string
  description: string
  href: string
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
    rolesPermitidos: ["SUPERVISOR"],
  },
  {
    slug: "producto-terminado",
    title: "Producto Terminado",
    description: "Carga los lotes de producto terminado.",
    href: "/producto-terminado",
    icon: PackageCheck,
    requiereTurno: true,
    rolesPermitidos: ["SUPERVISOR"],
  },
  {
    slug: "contadores-merma",
    title: "Contadores y Merma",
    description: "Envases de la llenadora, buenos y desechados por línea.",
    href: "/contadores",
    icon: Gauge,
    requiereTurno: true,
    rolesPermitidos: ["SUPERVISOR"],
  },
  {
    slug: "finalizar-turno",
    title: "Finalizar Turno",
    description: "Resumen y cierre del turno con los contadores por línea.",
    href: "/finalizar-turno",
    icon: ClipboardCheck,
    requiereTurno: true,
    rolesPermitidos: ["SUPERVISOR"],
  },
  {
    slug: "mis-estadisticas",
    title: "Mis Estadísticas",
    description: "Consulta tu rendimiento y métricas de planta.",
    href: "/estadisticas",
    icon: BarChart3,
    requiereTurno: false,
  },
  {
    slug: "calculadora",
    title: "Calculadora",
    description: "Herramienta de cálculo para producción.",
    href: "/calculadora",
    icon: Calculator,
    requiereTurno: true,
  },
  {
    slug: "personal",
    title: "Personal",
    description: "Alta, edición y baja de personal de tu área.",
    href: "/personal",
    icon: Users,
    requiereTurno: false,
    rolesPermitidos: ["ADMINISTRADOR_AREA"],
  },
  {
    slug: "auditoria",
    title: "Auditoría",
    description: "Historial de turnos por supervisor y fecha.",
    href: "/auditoria",
    icon: History,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
  },
  {
    slug: "edicion-datos",
    title: "Edición de Datos",
    description: "Catálogos generales de la planta: sabores, presentaciones, líneas y más.",
    href: "/edicion-datos",
    icon: DatabaseZap,
    requiereTurno: false,
    rolesPermitidos: ["SUPERADMINISTRADOR"],
  },
]
