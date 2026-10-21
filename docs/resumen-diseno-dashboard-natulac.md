# NATULAC - Control Aséptico — Diseño conceptual del dashboard

Resumen de las decisiones de diseño discutidas antes de tocar código. Pensado para retomarlo en una conversación nueva cuando se trabaje sobre el proyecto real (adjuntar junto con los archivos del repo).

## 1. Unidad real de registro: turno × línea × corrida

Un turno no es una sola unidad de producción — **tiene 3 líneas corriendo en paralelo**, y dentro de cada línea puede haber más de una "corrida" (cambio de sabor/presentación a mitad de turno). La jerarquía real es:

```
Turno (horario, supervisor, grupo)
 └─ Línea 1, Línea 2, Línea 3 (corren simultáneo, un solo supervisor cubre las 3)
     └─ Corrida (sabor + presentación específicos, puede haber varias por línea en un turno)
```

Merma, velocidad, meta y eficiencia son datos que existen **por corrida**, no por turno completo. El "acta de turno" original necesita repensarse como algo que se compone de una o más corridas por línea, no un solo registro plano.

## 2. Modelo de datos: medidas x dimensiones

### Medidas
- Merma teórica (contadores de la llenadora) y merma real (producto terminado), más su brecha
- Meta (se recalcula por corrida, según tiempo real disponible — ver sección 4, no es un número fijo)
- Velocidad real y eficiencia (velocidad real vs. velocidad ideal de esa máquina/presentación)
- Disponibilidad / tiempo perdido (paradas + posible arranque tardío)

### Dimensiones
- Tiempo: día / semana / mes / año
- Turno (según esquema activo — ver sección 3)
- Grupo (3) y Supervisor (3) — un supervisor cubre las 3 líneas de su turno
- **Línea (3)** — corren en paralelo dentro de un turno
- Sabor: familia (mzna, dzno, pera, naranjada) x línea de producto (clásico, selecto, jugosa) = 12 combinaciones, + especiales (té durazno, limón, coctel, piña) sin línea de producto
- Presentación (1L, 500, 330, 250, 200 ml) — eje independiente del sabor

### Tabla de referencia aparte
- **Velocidad ideal por máquina x presentación** — ya existe el dato, confirmado. No es un número global.

## 3. Esquemas de turno

Hay dos esquemas de horario posibles, y **la decisión de cuál aplica cada día es eventual** (no se puede calcular por regla fija — hay que registrarlo explícitamente por día/turno):

- **Esquema A — 3 turnos**: T1 7:00–15:00, T2 15:00–22:30, T3 22:30–7:00
- **Esquema B — 12x12**: Día 7:00–19:00 (cobertura normal), Noche 19:00–7:00 (un supervisor menos)

Son esquemas separados, no uno anidado en el otro — evita tener que reconciliar que las 7pm caen a mitad del Turno 2 del esquema A.

## 4. Cálculo de tiempo real, meta y eficiencia

```
Tiempo turno (480 o 720 min según esquema)
  − Paradas (catálogo de tipos + duración, ya existe el mecanismo)
  − Arranque tardío (posiblemente otro tipo dentro del mismo catálogo de paradas — pendiente confirmar)
  = Tiempo real disponible
  → alimenta Meta y Velocidad real (por corrida, usando la velocidad ideal de esa máquina/presentación)
  → Eficiencia = velocidad real vs. ideal
```

La meta deja de ser un número fijo por turno — se recalcula según cuánto tiempo real hubo, por corrida.

## 5. Niveles de información

| Nivel | Qué responde | Ejemplo |
|---|---|---|
| 1 — Estado actual | ¿Estoy bien ahora? | Número grande + semáforo |
| 2 — Tendencia | ¿Mejoro o empeoro? | Línea con umbral de 3% |
| 3 — Diagnóstico | ¿Dónde está el problema? | Desglose por turno/línea/grupo/sabor |
| 4 — Detalle/auditoría | ¿Qué pasó ese día? | Lista de actas con justificación |

## 6. Roles y acceso

| Rol | Uso | Filtros |
|---|---|---|
| Supervisor | Niveles 1 (a veces 2). Crea actas | Abiertos, default "hoy, mi turno" |
| Jefe/Administrador | Niveles 1–4 | Abiertos, sin default restrictivo |
| Analista | Niveles 3–4 | Abiertos |
| **Mantenimiento** | Registra paradas (área aparte, con cuenta propia) | Sin default — necesita elegir turno + línea explícitamente al capturar, porque no tiene "su" turno asociado |

Confirmado: Mantenimiento es un 4º rol del sistema, con cuenta propia (mismo patrón RLS que ya existe para Supervisor). Pendiente definir: ¿solo puede crear paradas o también corregir las que ya registró?, ¿cuenta individual por técnico o una compartida para el área?

Filtros abiertos para todos los roles (decisión ya confirmada, pensando en que el proyecto va a escalar) — lo que cambia por rol es el valor inicial, no los controles disponibles. Los permisos de qué datos ve cada quien siguen resueltos por RLS en Supabase, aparte de esto.

## 7. Matrices de cruce necesarias
- Turno x Grupo — heatmap simple
- Turno x Grupo x Supervisor — 3 mini-matrices lado a lado (pequeños múltiplos), porque son solo 3 supervisores
- Sabor x Presentación — pendiente de confirmar el cruce exacto; sospecha de que envases chicos (200–330ml) tienen más merma relativa

## 8. Pendientes / a definir
- Confirmar si arranque tardío es un tipo más dentro del catálogo de paradas, o necesita hora de inicio real capturada aparte
- Definir el rol de Mantenimiento: ¿cuenta en el sistema o formulario externo?
- Confirmar si "turno x supervisor" (sin grupo) necesita su propia matriz o basta un ranking simple
- Cerrar el cruce exacto de sabor x presentación
- Estructura de tabla para sabores: familia y línea de producto como campos separados, línea = "n/a" para especiales
- Diseñar el "estado de filtro" central reutilizable (turno, línea, grupo, supervisor, fecha, sabor, presentación, estado)
- Traducir el modelo a las tablas de Supabase — la unidad mínima parece ser una tabla `corridas` (turno_id, linea_id, familia_sabor, linea_producto o especial, presentacion, hora_inicio, hora_fin, merma_teorica, merma_real) más una tabla `paradas` (corrida_id o linea_id + turno_id, tipo, duracion_min)
