# Contexto del proyecto Natulac · Aséptico (para otro asistente de IA)

Fecha de corte: **2026-11-17, 16:45**. Rama activa al escribirlo: `main` (0cccb90, igual a
`origin/main`).

Este archivo resume qué es la app, cómo está armada, las reglas de negocio ya decididas, lo hecho
hasta hoy y lo que falta. Si algo de aquí no coincide con el código, **manda el código** (y la
última migración que redefine cada función).

---

## 1. Qué es

App web hecha a la medida de la planta **Aséptico de Natulac** (Venezuela): néctares y bebidas
envasados en líneas asépticas **L1 (TB, Tetra Brik) y L2/L3 (TP)**. Reemplaza las planillas y actas
en papel del turno.

- **Usuario principal:** el supervisor de turno, en el teléfono, con apuro y en la planta.
- **Otros:** Jefe de Producción, Analista (valida, indicadores, en PC), Mantenimiento (paradas, SIF),
  Calidad, Servicios Industriales, operador del Robot Tavil (paletizado), Super Administrador, la
  dueña de la app (por encima del Super Administrador) y usuarios de solo vista.
- **Paneles en vivo** (Producción, Paradas, Modo TV) en pantallas de planta, leídos de lejos.
- Existe un **Área de Pruebas** con sus propias líneas para probar sin tocar producción.

Principios del producto (de `PRODUCT.md`): cargar en segundos en el teléfono; el dato correcto
antes que el rápido (bloqueos y botones directos en vez de avisos); reemplazar el papel de verdad
(actas listas para imprimir); paneles legibles de lejos; cada rol ve solo lo suyo.

---

## 2. Personas y forma de trabajar

- **La dueña** de la app (cuenta de git `AndreaSeok`) es quien pide, decide y sube al servidor.
  No es programadora de oficio: necesita pasos exactos y siempre iguales.
- **Alexander** (Automatización) pide y decide en los temas de PLC, Robot Tavil, trazabilidad,
  tickets y la versión «Adenpior_V2.0». Decide él cuándo unir a `main` y subir.
- Idioma del producto: **español neutro, sin voseo ni argentinismos** («escribe», «tienes»,
  «aquí»; nunca «escribí», «tenés», «acá»). Descripciones cortas. Esto aplica a UI, mensajes de
  error SQL y comentarios del código.
- Evitar el verbo **«parar»** en textos visibles (doble sentido en planta): usar
  detener/detuvo/detenido. El sustantivo y el estado **«Parada»** sí se usan (nunca «Detenida»
  como rótulo de estado).
- **Toda acción brusca o sin vuelta atrás pide 2.ª confirmación** (Activar corrida, Detener línea,
  Cargar PT, Transferir, Desvasar, Finalizar turno, Iniciar CIP, abrir válvulas, etc.).
- **Auditoría universal:** toda mutación (crear/editar/borrar) queda en la tabla `auditoria` con
  cuándo, quién, acción, entidad, antes/después y página. Se hace con `registrar_auditoria(...)`
  explícito en la RPC o con el trigger genérico `auditar_cambio()` en la tabla (nunca los dos).
- Antes de diagnosticar un bug: leer la versión **vigente** de la función (el último
  `create or replace function` en las migraciones), no la primera que aparece. No extrapolar entre
  tablas que se parecen. La dueña ya corrigió varias veces conclusiones inventadas.
- Ante dudas de diseño, la dueña prefiere **la versión más simple**; ya rechazó diseños por
  complejos.

---

## 3. Arquitectura

- **Frontend:** React 19 + TypeScript + Vite + Tailwind 4 + shadcn/ui (`src/`). Gráficos con
  recharts; PDF con jsPDF / impresión del navegador; QR con `qrcode.react`.
- **Base de datos:** PostgreSQL propio en el servidor de planta (`db_control_nectares`). Hasta el
  2026-10-22 era Supabase. La app habla con la base por **PostgREST** (`@supabase/postgrest-js`).
- **Casi toda la lógica vive en funciones SQL** (`supabase/migrations/`, ~311 archivos, en orden
  por fecha). Las tablas tienen RLS sin políticas: todo pasa por funciones `security definer`.
  El frontend solo muestra y llama.
- **Login propio** (`verificar_login`, contraseñas con pgcrypto, tabla `usuarios`, no Supabase
  Auth). Cada petición lleva la credencial en el header `x-sesion`.
- **Permisos por puesto:** lo que ve cada persona sale de los permisos del puesto más permisos
  extra (`tiene_permiso`, `permisos_de_puesto`, `perfil_sesion`; front en `src/lib/permisos.ts`
  y `src/lib/apps.tsx`). Pantalla «Áreas y puestos» para editar la matriz.
- **Tareas programadas:** `pg_cron` (cerrar turnos vencidos, relevo de respaldo, sellar corridas).
- **Servicios Docker** (`docker-compose.yml`, perfil `preview`):
  app 4035 · plc-bridge 4036 · PostgREST 4037 · `archivos` (PDF de actas) 4038 · `correo`
  (avisos de SIF por SMTP). Vite reenvía `/api` y `/archivos`.
- **plc-bridge/** (Node): lee el PLC Siemens S7-1200 de Preparación y lo manda por WebSocket;
  envía las cargas de preparación a la base con el usuario `plc-bridge`; escribe las válvulas
  auxiliares (DB9). Configuración en `plc-bridge/bridge.conf`. Manual en
  `plc-bridge/Manual-plc-bridge.docx/.pdf` (solo se actualiza si Alexander lo pide).

Arquitectura de dominio en el front (rework de 3 módulos):

| Módulo | Dueño de | Carpeta |
|---|---|---|
| Preparación | tanques, lotes | `src/lib/preparacion/` |
| Producción | líneas, corridas, contadores | `src/lib/produccion/` |
| Producto Terminado | registros de PT | `src/lib/productoTerminado.ts` |
| Reportes | nada; compone los 3 (merma, meta) | `src/lib/reportes/` |

`src/lib/sesionTurno.tsx` da la identidad del turno. `src/lib/tiempoPlanta.ts` centraliza la
fecha/hora de planta (no usar `new Date()` suelto). `src/lib/eficiencia.ts` es el único lugar de
cálculo de eficiencia/meta.

Documentos de referencia en el repo: `README.md`, `MAPA.md` («quiero cambiar X → archivo Y»,
parcialmente desactualizado), `PRODUCT.md`, `DESIGN.md`, `supabase/ESQUEMA.md` (resumen de
tablas, puede estar atrasado), `docs/` (planes por módulo), `docs/superpowers/specs/` (specs de
diseño), `docs/mejoras-futuras.md`.

---

## 4. Entornos y subida al servidor

- **Producción:** servidor de planta `192.168.10.143`, usuario SSH `inf05`, proyecto en
  `/home/inf05/natulac-aseptico`, app en `http://192.168.10.143:4035`. **Es producción**: lo usan
  los supervisores. No hay otro servidor de pruebas.
- **Pruebas:** Supabase (PC de casa / PC de trabajo), seleccionado por `.env.local` o
  `.env.pruebas` + `npm run dev -- --mode pruebas`. Base local también con PGlite
  (`scripts/base-local/`).
- `main` = lo que está (o va) en producción. Cada cambio en su rama → se prueba → se une a `main`
  → se sube.
- La dueña sube con **WinSCP «Sincronizar»** la carpeta entera
  `C:\Users\JefeAseptico\Documents\natulac-aseptico`. Por eso todo debe estar en esa carpeta (no en
  worktrees aparte).

Rutina fija de subida (dársela siempre igual, en bloques listos para copiar y pegar):

1. WinSCP: sincronizar la carpeta (nunca `node_modules` ni `.env.local`; lo borrado en git hay
   que borrarlo a mano en el servidor).
2. `ssh inf05@192.168.10.143` y `cd natulac-aseptico`.
3. Ver qué migraciones faltan:
   `bash scripts/aplicar-migracion.sh scripts/revisar-migraciones-pendientes.sql`
4. Aplicar las que falten, de la más vieja a la más nueva:
   `bash scripts/aplicar-migracion.sh supabase/migrations/<a>.sql <b>.sql …`
   (una transacción por archivo, recarga PostgREST).
5. `docker compose --env-file .env.local --profile preview up -d --build` y abrir con Ctrl+Shift+R.

Notas: sin paso de respaldo (`pg_dump`) desde 2026-11-16, a pedido de la dueña. Cada migración
nueva debe agregar su marca en `scripts/revisar-migraciones-pendientes.sql`. SQL suelto se pega
envuelto en `cat > /tmp/x.sql <<'EOF' … EOF` + `aplicar-migracion.sh /tmp/x.sql`. Hay una guía
para la dueña en `docs/GUIA-SUBIR-AL-SERVIDOR.docx` y un ayudante en
`docs/herramientas/preparar-subida.sh`. Si cambió `plc-bridge/bridge.conf`, el plc-bridge tiene
que reiniciarse para leerlo.

---

## 5. Reglas de negocio ya decididas

### Tiempo y turnos
- Hora de planta **America/Caracas (UTC-4)**; Postgres en UTC. Fecha/hora del turno las calcula el
  servidor. Jornada de **7:00 a 7:00**.
- Turnos T1 (8 h), T2 (7,5 h, 15:00–22:30), T3 (8,5 h); 12x12 aparte. Supervisores fijos 12x12
  (cambio de persona 7:00 y 19:00). **Grupos rotan cada lunes** (T1→T3, T3→T2, T2→T1).
  Lun–jue 3 turnos, viernes T1+T2, fin de semana no se trabaja. Feriados no están en el calendario.
- Un turno cuenta paradas **desde su hora oficial**; el anterior termina donde empieza el siguiente.
- El Super Administrador puede corregir el **turno inmediatamente anterior** cerrado
  (`verificar_turno_editable`, «Corregir este turno» en Auditoría).
- Calidad, Mantenimiento, Servicios Industriales y Robot son **áreas de apoyo**: no abren turno,
  trabajan sobre el turno de Aséptico. Usan cuentas compartidas.

### Tanques, lotes y merma de semielaborado
- Líneas y tanques son **estado continuo** de la planta (heredan de un turno a otro).
- Condición del tanque: LISTO, SUCIO, EN_PREPARACION, STANDBY, CIP, LIMPIO.
- Volumen del tanque: leer siempre con `volumen_vivo_tanque()`; `recepcion_tanques.volumen_l`
  quedó congelado desde 2026-09-08.
- **Transferir:** medir el tanque origen es obligatorio antes; nunca un campo libre de litros.
- Fórmula definitiva (2026-11-03): **Rendimiento = Total envasado / Total preparado × 100**.
  Preparado = tambores × fórmula del sabor (+ ajustes), se congela al crear el lote. El resto que
  pasa al lote siguiente cuenta como salida del lote viejo. Tabla «Semielaborado» por lote en el
  Resumen Diario / Validar (migración 20261115090000).
- Sin lectura del tanque al cierre el rendimiento sale 100 %; obligar la lectura quedó **en pausa**
  (se espera al PLC; no hay transmisor de nivel ni medidor de salida en los tanques).

### Líneas, PT, meta y eficiencia
- Activar corrida → Parada (pausa) / Continuar → Detener línea deja la corrida en `ESPERANDO_PT` →
  **cargar el PT es lo único que la cierra** (un total por corrida).
- Eficiencia: base = duración fija del turno; Disponible = Turno − Programadas − Ocioso;
  Meta = velocidad elegida × Disponible. Todo en minutos.
- Una corrida sin PT aporta 0 de producido y su tiempo castiga («faltan X por reportar»).
- Panel de Producción: si no hay PT confirmado usa la precarga del Robot Tavil.
- Semáforos: merma envase 3/5 %, semielaborado 1,0/1,5 %, meta y eficiencia 90/60 %.
- **Indicadores** cuentan un día cuando sus turnos están cerrados y el PT está confirmado en el
  **Resumen Diario** (lo que la Analista confirma por WhatsApp). «Validar jornada» solo se usa en
  Pruebas.

### Paradas (downtime)
- Clases: **Programada / No programada / Ocioso**, más familias (LNPE, Operacional, Suministro,
  etc.). Catálogo por línea y presentación, con códigos de planilla (fuente: libro «Paradas por
  Código», pestaña «Nueva Configuración»). Tiempo guía solo en Programadas.
- Catálogo de fallas modular: equipo → sistema → subsistema → falla.
- El supervisor abre la parada desde Líneas (Modo Paradas) **sin responsable («Por definir»)**;
  Mantenimiento la toma y la clasifica, o el supervisor la marca Operacional (2026-11-13).
  Mantenimiento termina las suyas en todas las áreas.
- Una parada abierta de 15 min o más pausa la corrida sola. Continuar pregunta cuánto duró.
- **Las paradas suman todos sus minutos aunque se pisen** (sin descontar solape, 2026-11-04).
- «Falla nueva» / «Parada nueva»: fallas reservadas por equipo para lo que no está en el
  catálogo; cola «Fallas nuevas» en Catálogo de Paradas para identificar o descartar.
- **SIF** (Solicitud de Inspección / Intervención de Falla): fallas repetidas generan Inspección
  a la 3.ª y Intervención a la 4.ª; acta PDF; aviso por correo. Cerrar una Intervención es
  irreversible (rojo + confirmación).
- CIP de línea: por corte de luz (va dentro de la falla eléctrica) o a las 36 h (Limpieza
  Intermedia Programada).

### Robot Tavil, trazabilidad y tickets
- El operador del robot cuenta paletas con «+»/«−» y el Resto; es la precarga del PT que el
  supervisor confirma o corrige (solo queda en Auditoría, sin motivo obligatorio).
- Hoja de trazabilidad **1-PR-F-040** por día y línea; Nº de paleta por sabor+presentación del
  día (si se vuelve a una combinación, continúa la numeración). Paleta manual por interruptor.
  Ticket repetido permitido con doble confirmación (V2.0).
- Ticket por sistema con QR (`P-000124`), vida útil en meses por sabor, impreso por el navegador
  en 100×150 mm. Lectura del QR hoy copiando el texto (opción C); futura: foto desde la app
  (opción B, en `docs/mejoras-futuras.md`). La app corre por http, sin HTTPS: no hay cámara en vivo.

### PLC (Preparación)
- PLC S7-1200 1212C («Prom_Preparacion») en **192.168.10.59** (antes 192.168.0.10; cambiado en
  `plc-bridge/bridge.conf` el 2026-11-17). Lee caudal (DB5 INT16) y total del tanque (DB5 DINT8); el bridge no calcula
  nada. Registro de llenados en JSON del bridge.
- Con el interruptor «Preparación con PLC», la tarjeta de Preparación toma del PLC kits y ajustes
  de agua; el supervisor solo elige sabor y lote (migración 20261115990000).
- Válvulas auxiliares (DB9 `Valv_Aux_Tank1..3`) se accionan desde la tarjeta «Contador de Agua»
  con permiso `VALVULA_AUX` y auditoría; la HMI escribe el mismo bit. Las válvulas de agua no se
  controlan desde la app.

### Calidad y nitrógeno
- Calidad libera lotes: sensorial + Brix + acidez con rango mín–máx por sabor. Desde V2.0 la
  tarjeta la ve quien tiene `LOTE_LIBERAR`; el interruptor `calidad_libera` permite apagarlo.
- Nitrógeno del turno (V2.0): tabla `turno_nitrogeno`; consumo = recibidas + llegaron −
  entregadas; Finalizar turno lo exige; filas en el acta.

---

## 6. Módulos de la app (pantallas en `src/pages/apps/`)

Comenzar Turno · Preparación (y Preparación PLC) · Líneas (Modo Paradas) · Producto Terminado ·
Finalizar Turno (acta PDF) · Mis Actas · Resumen Diario (día y semana) · Validar Jornada ·
Indicadores · Panel de Producción · Panel de Paradas · Modo TV · Reportes de Paradas · Catálogo de
Paradas · Códigos de Mantenimiento · Mantenimiento · Solicitudes de Intervención (SIF) · Calidad ·
Servicios Industriales (y sus registros) · Inventario Diario · Programación · Robot Tavil ·
Trazabilidad del Paletizado · Calculadoras · Personal · Áreas y Puestos · Edición de Datos
(catálogos y Ajustes de planta con interruptores por área) · Auditoría (Historial) · Errores del
cliente.

---

## 7. Cronología de lo hecho

| Fecha | Qué |
|---|---|
| 2026-08-20 | Subida inicial del proyecto. |
| 2026-08-21/24 | Panel de Producción en vivo con Meta; Preparación como estado continuo; login con tabla propia. |
| 2026-09-02 | Arreglo de la merma de semielaborado (relectura ya no mueve el volumen inicial; transferir descuenta del origen) y rework de tanques/líneas (detener por falla, transferir LIQUIDO/LOTE, `iniciar_preparacion` unificado). Directo a producción. |
| 2026-09-08/10 | Rework de 3 módulos; un solo marco de hora de planta (`tiempoPlanta.ts`); auditoría universal; plan de Paradas. |
| 2026-09-21/22 | Modelo final de Paradas: catálogo por línea/presentación, quién registra qué, eficiencia/meta (migraciones 61–72). |
| 2026-09-25/29 | Super Admin corrige turno anterior; rotación de grupos y calendario 12x12; Calidad libera lotes (en Pruebas). |
| 2026-10-22 | Migración de Supabase a PostgreSQL propio + PostgREST + servicio de archivos. Corrida sin PT siempre cuenta. |
| 2026-10-23/28 | Parada abierta de la línea, auto-pausa a 15 min; Paradas «lectura clara» a producción; Inventario integrado; Indicadores desde el Resumen Diario; plc-bridge con bridge.conf y registro de llenados. Todo unido en `main` el 2026-10-28. |
| 2026-10-30 | Válvulas auxiliares desde la app (DB9). |
| 2026-10-31/11-05 | Catálogo de fallas modular; Personal por áreas y puestos con permisos; Falla nueva / Parada nueva; eliminar paradas con permiso; estado de línea único; operador del Robot Tavil. |
| 2026-11-03/04 | Fórmula definitiva de rendimiento de semielaborado y tabla Semielaborado; paradas suman todo sin solape. |
| 2026-11-09 | Preparación con datos del PLC (bridge manda las cargas a la base). |
| 2026-11-10 | Indicadores: VACÍO con datos cargados a mano. |
| 2026-11-11/13 | Trazabilidad del paletizado (hoja 1-PR-F-040 con PDF idéntico); Robot Tavil solo por permiso; parada «Por definir»; SIF con observaciones; identificar Falla nueva. |
| 2026-11-16 | Unión de `rework/preparacion-PLC` en `main` (88c159d). Arreglo del despliegue: servicio `dev` fuera del perfil `preview`. |
| 2026-11-17 | Rama **Adenpior_V2.0**: Calidad visible por permiso, ticket repetido con confirmación, buscador de tarjetas en el inicio, nitrógeno del turno, Resumen semanal, familias «Clásico» y «Bebida té negro». Rama **tickets-paletas** (sale de V2.0): ticket de paleta con QR (prueba, apagado por defecto). Las dos se unieron a `main` y se subieron a GitHub el mismo día (0213c94 y 0cccb90). |

---

## 8. Estado de las ramas al 2026-11-17

- **`main`** (0cccb90, igual a `origin/main`): tiene todo. El 2026-11-17 se le unieron
  `Adenpior_V2.0` (merge 0213c94) y `tickets-paletas` (merge 0cccb90).
- Lo que hasta 88c159d (2026-11-16) se subió al servidor según las notas. **Las dos uniones del
  2026-11-17 no constan como subidas al servidor de planta**: confirmar con
  `revisar-migraciones-pendientes.sql`. Las migraciones nuevas, en este orden:
  `20261116090000`, `20261116190000`, `20261116290000`, `20261116390000`, `20261116490000`,
  `20261116590000`. La 390000 y la 490000 abortan si hay dos familias con el mismo nombre.
- Detalle de V2.0 en `docs/adenpior-v2/plan-adenpior-v2.0.md`; del ticket QR en
  `docs/ticket-paletas/plan-tickets-paletas.md`.
- Hay muchas ramas viejas ya unidas o abandonadas (paradas-*, indicadores-*, rework-*, etc.).
  No asumir que una rama vieja tiene trabajo pendiente sin compararla con `main`.

---

## 9. Pendientes y decisiones abiertas

- Subir `main` al servidor de planta y aplicar las migraciones 20261116090000 a 20261116590000 en
  orden (si no se hizo ya), y reiniciar el plc-bridge por la IP nueva del PLC.
- Ticket QR: queda apagado por defecto y por área; probarlo primero en el Área de Pruebas.
- Tickets: probar con la impresora real cuando se compre (Chrome con `--kiosk-printing`); cargar la
  vida útil de los sabores que no encajaron por nombre. Futuro: leer el QR con foto desde la app.
- Merma de semielaborado: quitar «Medir tanque» / «Fijar volumen real» (choca con «medir antes de
  transferir»); tambores desde el PLC; lectura obligatoria al cierre en pausa.
- PLC: qué hacer si se pierde la comunicación; probar en modo real; DB9 definitivo de comandos
  (setpoint/start/stop) no implementado hasta que Automatización lo confirme.
- Panel Analítico (reemplazar Panel de Paradas cruzando merma con Brix/acidez y datos de S.I. por
  fecha): solo planificación.
- Paradas: la tarjeta de Líneas cuenta pendientes de los últimos 30 días (¿limitar al turno?).
  Test `ModoParadas.test.tsx` «con su comienzo verdadero» falla desde antes.
- Discrepancias conocidas: el acta 2.1 promedia % de merma por corrida y el Panel suma y divide;
  el Panel muestra solo la última lectura de S.I.; Iniciar CIP se ofrece con producto en el tanque.
- Manual de usuario: se sacó del repo el 2026-10-22 (está en el historial de git, antes de 56861d4).
- Feriados fuera del calendario de turnos.

---

## 10. Trampas conocidas

- `npx tsc --noEmit` en la raíz **no revisa nada**. Usar `npx tsc -p tsconfig.app.json --noEmit`.
- Vitest en Windows: correr desde la ruta con `C:/` en mayúscula (con `c:/` falla «failed to find
  the current suite»).
- **Nunca editar una migración ya aplicada**: crear una nueva con fecha mayor. No renombrar
  migraciones que ya corrieron en el servidor. Revisar que no haya números repetidos.
- Al redefinir una RPC con parámetros nuevos, borrar primero la firma vieja (si no, quedan dos
  funciones con el mismo nombre en PostgREST).
- PGlite se cae al formatear `raise exception` con parámetros: sirve para ensayos de caminos
  felices, no de errores. Los ensayos SQL están en `scripts/ensayo-*.sql`.
- No usar `git stash -u` (pesa `scripts/base-local/` y los .docx abiertos en Word rompen el pop).
- El `.env.local` de la laptop de trabajo apunta a **producción**: no probar ahí cosas destructivas.
- El sandbox del asistente no llega a la LAN de planta: no puede consultar la base de producción.
- `MAPA.md` y `supabase/ESQUEMA.md` pueden estar atrasados.

---

## 11. Cómo cerrar cada cambio

1. Rama propia; migración nueva si toca la base (con auditoría y su marca en
   `revisar-migraciones-pendientes.sql`); ensayo SQL si es posible.
2. `tsc -p tsconfig.app.json` y `npm test` en verde.
3. Textos en español neutro, cortos, sin «parar».
4. Decir si lleva migración y dar los pasos de subida (sección 4) en bloques listos para pegar,
   salvo en el trabajo del plc-bridge con Alexander, donde solo se dan si él dice que va a subir.
