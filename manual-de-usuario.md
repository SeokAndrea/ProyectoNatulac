# Manual de Usuario — Natulac Aséptico

**Sistema de registro y control de producción**

Versión 1.0 · 18 de septiembre de 2026

> Este manual describe la aplicación tal como estaba en la fecha indicada. Si una pantalla no coincide con lo que ves, avisa a tu Administrador de Área.

---

## Cómo usar este manual

| Si eres… | Lee los capítulos |
|---|---|
| Supervisor de producción (Aséptico o Vacío) | 1, 2, 3, 4, 5, 6, 10, 11 y 13 |
| Supervisor de Servicios Industriales | 1, 2, 3 y 7 |
| Administrador de Área | 1, 2, 3, 5, 6, 8 y 10 |
| Super Administrador | Todos |
| Personal de Mantenimiento | 1, 2, 3, 5 y 6 |

**Convenciones**

- **Negrita**: nombre exacto de un botón, pestaña o campo, tal como aparece en pantalla.
- «Comillas angulares»: mensaje que muestra el sistema.
- Las tablas **Botones y campos** listan cada elemento visible de una pantalla y lo que hace.
- **Importante**: acción que no se puede deshacer o que cambia los cálculos.
- **Nota**: aclaración.

## Contenido

1. [Introducción](#1-introducción)
2. [Áreas, roles y permisos](#2-áreas-roles-y-permisos)
3. [Primeros pasos](#3-primeros-pasos)
4. [El turno del Supervisor](#4-el-turno-del-supervisor)
5. [Panel de Producción](#5-panel-de-producción)
6. [Programación](#6-programación)
7. [Servicios Industriales](#7-servicios-industriales)
8. [Administrador de Área](#8-administrador-de-área)
9. [Super Administrador](#9-super-administrador)
10. [Cálculos: mermas, rendimiento, meta y eficiencia](#10-cálculos-mermas-rendimiento-meta-y-eficiencia)
11. [Reglas y bloqueos del sistema](#11-reglas-y-bloqueos-del-sistema)
12. [Módulo de Paradas (en desarrollo)](#12-módulo-de-paradas-en-desarrollo)
13. [Preguntas frecuentes](#13-preguntas-frecuentes)
14. [Anexos](#14-anexos)

---

## 1. Introducción

### 1.1 Qué es

Natulac Aséptico es la aplicación web de producción de la planta. Se usa desde el navegador, en computador, tableta o teléfono.

Reemplaza el papel y las hojas de cálculo del turno. Registra tanques, preparaciones, líneas, contadores y producto terminado, calcula las mermas y genera el **Acta de Entrega de Turno** en PDF.

### 1.2 Qué registra y qué calcula

| Se registra | Se calcula |
|---|---|
| Inicio y cierre de turno | Merma de envase |
| Estado de los 3 tanques | Merma de semielaborado y rendimiento |
| Preparaciones y lotes | Meta y cumplimiento por línea |
| Corridas de las líneas | Eficiencia de línea |
| Contadores de la llenadora | Litros producidos |
| Producto terminado (paletas y cajas) | Estadísticas por grupo y por supervisor |
| Novedades del turno | Acta de Entrega de Turno |
| Lecturas de Servicios Industriales | |

### 1.3 Conceptos clave

| Término | Significado |
|---|---|
| **Turno** | Período de trabajo de un supervisor: Turno 1 (7:00 a 15:00), Turno 2 (15:00 a 22:30), Turno 3 (22:30 a 7:00) o 12x12. |
| **Grupo** | Cuadrilla que trabaja el turno: Grupo 1, 2 o 3. Rota de forma independiente al tipo de turno. |
| **Jornada** | Día de planta, de 7:00 a 7:00. Los tres turnos comparten la misma fecha. Un Turno 3 iniciado después de la medianoche pertenece a la jornada del día anterior. |
| **Código de turno** | Identifica el turno. Ejemplo: `A20260918_T1G2` = Aséptico, 18/09/2026, Turno 1, Grupo 2. |
| **Tanque** | Recipiente de semielaborado. La planta tiene 3 (Tanque 1, 2 y 3), de 20.000 L nominales. |
| **Semielaborado** | Mezcla preparada en el tanque, antes de llenarse en envases. |
| **Preparación** | Mezcla de un tanque: sabor, cantidad de tambores (o kits) y lote. |
| **Lote** | Número de 4 dígitos (0001, 0002…) que identifica una preparación. Si escribes `3`, el sistema lo guarda como `0003`. |
| **Liberar** | Marcar una preparación como lista. Solo un tanque **Liberado** puede alimentar una línea. |
| **Línea** | Llenadora de envases (Línea 1, 2 y 3). |
| **Corrida** | Período en que una línea llena un lote con una presentación y una velocidad. Una línea puede tener varias corridas en un turno. |
| **Presentación** | Tamaño del envase (por ejemplo 1000 ml o 250 ml) y su empaque: envases por caja y cajas por paleta. |
| **Contador** | Envases que contó la llenadora. El **Contador 2** son los envases buenos. |
| **Producto Terminado (PT)** | Paletas y cajas sueltas empacadas de una corrida. |
| **Merma de envase** | Diferencia entre lo que contó la llenadora y lo que terminó empacado. |
| **Merma de semielaborado** | Diferencia entre el semielaborado que salió del tanque y el que terminó como producto. Su complemento es el **Rendimiento**. |
| **Meta** | Cajas que debían salir según la velocidad elegida y las horas transcurridas. |
| **CIP** | Limpieza en sitio de un tanque o de una línea. |
| **Desvase** | Sacar el resto de un tanque y guardarlo para usarlo en una preparación futura del mismo sabor. |
| **Transferencia** | Pasar el contenido de un tanque a otro. |
| **Acta** | PDF con el resumen de entrega del turno. |

### 1.4 Reglas generales

- **Hora de planta.** Todas las horas y fechas usan la hora de Caracas, sin importar el reloj de tu equipo.
- **Estado continuo.** Los tanques y las líneas no se reinician con cada turno. Cada turno hereda lo que dejó el anterior y debe revisarlo al empezar.
- **Todo queda registrado.** Cada cambio guarda quién lo hizo, cuándo, qué era antes y qué es ahora.
- **Segunda confirmación.** Las acciones difíciles de deshacer piden confirmar dos veces (por ejemplo **Arrancar línea**, **Detener línea**, **Desvase** y eliminar personal o turnos).
- **Botones grises.** Un botón desactivado indica que falta un dato o que la acción no está permitida en ese momento.
- **Números.** Se muestran con punto para los miles (20.000 L).
- **Sesión.** La sesión se mantiene abierta en el navegador hasta que uses **Cerrar sesión**. Ciérrala siempre en equipos compartidos.

---

## 2. Áreas, roles y permisos

### 2.1 Áreas

| Área | Para qué se usa |
|---|---|
| **Producción Aséptico** | Operación de turnos en las líneas de llenado aséptico. |
| **Producción Vacío** | Misma operación de turno que Aséptico, con sus propias líneas. |
| **Servicios Industriales** | Carga de lecturas de Quantum, agua osmotizada y gasoil. No opera turnos de producción. |
| **Mantenimiento** | Consulta de información en solo lectura. |
| **Área de Pruebas** | Entorno de práctica. Ve todas las pantallas. Sus datos no aparecen en el Panel de Producción ni en las estadísticas de planta. |

### 2.2 Jerarquía de roles

```
Super Administrador ........ todas las áreas, todos los catálogos
└── Administrador de Área .. su área: personal y auditoría
    └── Supervisor ......... su turno: tanques, líneas y producto terminado

Mantenimiento .............. solo lectura (Panel y Programación)
```

| Rol | Alcance | Puede |
|---|---|---|
| **Super Administrador** | Todas las áreas | Todo lo anterior, más: Validar, Edición de Datos, Calculadoras, editar Programación, eliminar turnos, exportar datos y ver el registro de cambios. |
| **Administrador de Área** | Solo su área | Ver el Panel y la Programación, gestionar el personal de su área y consultar la Auditoría. No opera turnos. |
| **Supervisor** | Su propio turno | Comenzar, operar y finalizar su turno; ver sus actas; ver el Panel y la Programación. |
| **Mantenimiento** | Solo lectura | Ver el Panel de Producción y la Programación. |

**Nota.** Un Administrador de Área no puede crear ni asignar el rol de Super Administrador. El sistema lo rechaza aunque se intente por otra vía.

### 2.3 Cargo

El **cargo** (Jefe de Producción, Subjefe, Analista de Producción, Supervisor) es solo un rótulo visual. Aparece junto al nombre en el Panel y en el registro de cambios. **No cambia los permisos**: estos los define únicamente el rol.

### 2.4 Qué ve cada perfil en el Hub

| Tarjeta | Supervisor de producción | Supervisor de Serv. Industriales | Administrador de Área | Super Administrador | Mantenimiento |
|---|:---:|:---:|:---:|:---:|:---:|
| Comenzar Turno | ✔ | | | | |
| Preparación | ✔ | | | | |
| Líneas | ✔ | | | | |
| Producto Terminado y Contador | ✔ | | | | |
| Finalizar Turno | ✔ | | | | |
| Mis Actas | ✔ | | | | |
| Panel de Producción | ✔ | ✔ | ✔ | ✔ | ✔ |
| Programación | ✔ | | ✔ | ✔ | ✔ |
| Servicios Industriales | | ✔ | | | |
| Registros del Área | | ✔ | | | |
| Personal | | | ✔ | | |
| Auditoría | | | ✔ | ✔ | |
| Validar | | | | ✔ | |
| Calculadoras | | | | ✔ | |
| Edición de Datos | | | | ✔ | |

**Notas**

- **Errores** es una tarjeta especial: solo la ve quien tiene ese permiso adicional, que no depende del rol.
- **Registrar Paradas** y **Panel de Paradas** solo se muestran en el Área de Pruebas (ver el capítulo 12).
- El Administrador de Área solo ve datos de su área. El Super Administrador puede elegir el área.

---

## 3. Primeros pasos

### 3.1 Iniciar sesión

> Captura sugerida: pantalla de ingreso.

1. Escribe tu **Usuario** (por ejemplo `kgomez`). No distingue mayúsculas de minúsculas.
2. Escribe tu **Contraseña** (4 dígitos).
3. Presiona **Iniciar sesión**.

| Elemento | Qué hace |
|---|---|
| **Usuario** | Tu nombre de usuario. |
| **Contraseña** | Clave de 4 dígitos. |
| **Iniciar sesión** | Valida los datos y abre el Hub. Muestra «Ingresando…» mientras espera. |

**Mensajes posibles**

| Mensaje | Qué hacer |
|---|---|
| «Ingresa tu usuario y contraseña.» | Completa los dos campos. |
| «Usuario o contraseña incorrectos.» | Verifica los datos. Si olvidaste la clave, pide a tu Administrador de Área que la restablezca. |
| «No se pudo validar el usuario. Intenta de nuevo.» | Revisa tu conexión a internet y reintenta. |

### 3.2 Primer ingreso

Se muestra solo en estos casos: es tu primera vez, un administrador restableció tu clave, o tu clave no cumple la política (4 dígitos y distinta de 1234). Mientras no lo completes, no puedes usar el resto de la aplicación.

> Captura sugerida: pantalla «Confirma tus datos».

| Campo o botón | Qué hace |
|---|---|
| **Usuario** | Solo lectura. |
| **Nombre y Apellido** | Confirma o corrige tu nombre. Aparece en las actas. |
| **Cédula** | Se da formato sola (`30.223.132`). Acepta 7 u 8 dígitos. |
| **Contraseña nueva** | 4 dígitos, distinta de 1234. |
| **Repetir contraseña nueva** | Debe coincidir. |
| **Guardar y entrar** | Guarda los datos y abre el Hub. |
| **Salir** | Cierra la sesión sin guardar. |

**Mensajes posibles**

| Mensaje | Causa |
|---|---|
| «Ingresa tu nombre y apellido.» | Falta el nombre. |
| «La cédula debe quedar como X.XXX.XXX o XX.XXX.XXX.» | Formato de cédula inválido. |
| «La contraseña nueva debe ser de 4 dígitos y distinta de 1234.» | Clave no válida. |
| «Las dos contraseñas nuevas no coinciden.» | Los dos campos son distintos. |
| «Se perdió la sesión. Inicia sesión de nuevo para continuar.» | Recargaste la página en medio del proceso. Vuelve a ingresar. |

### 3.3 El Hub (pantalla de inicio)

> Captura sugerida: Hub de un Supervisor con turno en curso.

El Hub muestra un saludo con tu nombre y las tarjetas de las aplicaciones que puedes usar.

| Elemento | Qué hace |
|---|---|
| **Mensaje bajo el saludo** | Con turno: «Elige una aplicación para continuar.» Sin turno: «Inicia un turno para habilitar el resto de las aplicaciones.» |
| **Atajos** (arriba a la derecha) | Accesos pequeños a **Panel de Producción** y **Programación**. |
| **Tarjetas** | Cada una abre una aplicación. El color del ícono ayuda a distinguirlas. |
| **Tarjeta bloqueada** (gris, con candado) | La aplicación no está disponible ahora. Pasa el cursor para ver el motivo. |

**Estados especiales de las tarjetas del Supervisor**

| Situación | Qué ves |
|---|---|
| No hay turno en curso | **Preparación**, **Líneas**, **Producto Terminado y Contador** y **Finalizar Turno** aparecen bloqueadas: «Se habilita al iniciar un turno.» |
| Ya hay un turno en curso | **Comenzar Turno** aparece bloqueada: «Ya tienes un turno en curso.» |
| Turno en curso | **Finalizar Turno** se resalta en rojo para recordar el siguiente paso. |

### 3.4 Elementos comunes a todas las pantallas

**Encabezado**

| Elemento | Qué hace |
|---|---|
| **Flecha izquierda** | Vuelve al Hub. |
| **Logo** | También vuelve al Hub (no se ve en pantallas pequeñas). |
| **Título y descripción** | Nombre de la pantalla. En pantallas de turno muestra el código del turno. |
| **Círculo con iniciales** | Tu identidad. |
| **Ícono de salida** (**Cerrar sesión**) | Cierra tu sesión y vuelve al ingreso. |

**Franja de estado** (debajo del encabezado)

| Dato | Significado |
|---|---|
| **Área** | Tu área. El Super Administrador ve «Todas las áreas». |
| **Supervisor / Usuario** | Con turno en curso muestra al supervisor del turno. Sin turno, tu nombre. |
| **Turno** | Tipo de turno, grupo, líneas activas y el código del turno. Si no hay líneas activas indica «sin líneas (parada)». |
| **Sin turno iniciado** | Aviso ámbar: no hay turno activo. Para Administradores y Mantenimiento indica si el área tiene un turno activo y de qué supervisor. |

**Aviso de versión desactualizada**

Si se publica una versión nueva mientras tienes la aplicación abierta, aparece una barra amarilla al pie: «Tienes la app desactualizada — actualízala para evitar errores.» Presiona **Actualizar ahora**. El sistema lo revisa cada 5 minutos y cada vez que vuelves a la pestaña.

**Importante.** Actualiza antes de cargar datos. Una pantalla vieja puede enviar información incompleta.

---

## 4. El turno del Supervisor

Este capítulo es para el Supervisor de producción (Aséptico o Vacío). El Supervisor de Servicios Industriales usa el capítulo 7.

### 4.1 Vista general

```
1. Comenzar Turno ............ elegir turno y grupo → Empezar Turno
2. Revisión de inicio ........ confirmar o corregir los 3 tanques y las líneas heredadas
3. Preparación ............... preparar, liberar, medir y transferir (todo el turno)
4. Líneas .................... arrancar, parar y detener corridas (todo el turno)
5. Producto Terminado ........ cargar contador, paletas y cajas; Terminar o Entregar; medir el tanque
6. Finalizar Turno ........... confirmar el estado final de los tanques → Finalizar → Acta
```

Los pasos 3, 4 y 5 se repiten según los lotes que corras.

**Reglas de oro**

1. Completa la revisión de inicio sin salir de la pantalla.
2. Libera el tanque antes de arrancar la línea.
3. Carga el Producto Terminado de cada corrida y elige **Terminar** o **Entregar línea** antes de finalizar.
4. Después de cerrar una corrida, **mide el tanque**.
5. No descuentes litros a mano después de cargar el Producto Terminado: el sistema los descuenta solo.
6. Confirma el estado final de los tanques antes de finalizar.
7. Anota las novedades del turno con su hora.

---

### 4.2 Comenzar Turno

Tarjeta del Hub: **Comenzar Turno** (ícono verde).

#### 4.2.1 Datos del turno

> Captura sugerida: tarjeta «Datos del turno».

| Elemento | Qué hace |
|---|---|
| **Fecha y hora** | Informativas. La hora real se registra al confirmar. |
| **Turno** | Lista: Turno 1 · 7:00 a 15:00, Turno 2 · 15:00 a 22:30, Turno 3 · 22:30 a 7:00 y 12x12. |
| **Grupo** | Grupo 1, 2 o 3. |
| **Empezar Turno** | Crea el turno. Se activa cuando eliges turno y grupo. |

**Notas**

- El turno y el grupo no se pueden cambiar hasta finalizar el turno.
- La fecha del turno es la de la jornada. Un Turno 3 iniciado después de la medianoche queda con la fecha del día anterior.
- Si el turno anterior de tu área quedó abierto (nadie lo finalizó), el sistema lo cierra solo al empezar el tuyo. Sus corridas sin cerrar quedan sin Producto Terminado y se revisan después en **Validar**.
- Mensaje de error: «No se pudo iniciar el turno. Intenta de nuevo.»

#### 4.2.2 Revisión de inicio

Al crearse el turno, la misma pantalla cambia a **¿Con qué encontraste la planta?**. Verifica que los tanques y las líneas heredados del turno anterior coincidan con la realidad.

> Captura sugerida: revisión de inicio con 3 tanques y 3 líneas.

**Importante.** Completa esta revisión sin salir de la pantalla. Si sales sin terminarla, la tarjeta **Comenzar Turno** queda bloqueada en el Hub («Ya tienes un turno en curso»). Para volver, escribe `/turno` al final de la dirección del sistema en el navegador, o pide ayuda a tu Administrador de Área.

**Tanques**

Cada tanque sin confirmar muestra un recuadro ámbar: «Tanque N: así quedó del turno anterior — confirma o edita.», con su estado actual.

| Botón | Qué hace |
|---|---|
| **Confirmar** | Da por bueno el estado. Fija el volumen de inicio de tu turno: es la base del cálculo de merma de semielaborado. |
| **Editar** (dentro del recuadro) | Abre el formulario de corrección: **Estado**, **Sabor**, **Volumen (L)** (máximo 20.000), **Lote**. |
| **Guardar estado** | Guarda la corrección y la cuenta como confirmación. |
| **Cancelar** | Cierra el formulario. |
| **Editar** (gris, al final de la tarjeta) | Corrección posterior. Ver 4.3.8. |

**Líneas**

Cada línea con una corrida heredada sin confirmar muestra: «Línea N: así quedó del turno anterior — confirma o corrige.»

| Botón | Qué hace |
|---|---|
| **Confirmar** | Da por buena la corrida heredada. |
| **Corregir** | Abre el formulario de arranque con los datos actuales (tanque, presentación, velocidad) para corregirlos. |

Una línea ya confirmada muestra **Corregir** y **Parada Operacional**. Una línea sin corrida muestra los botones de arranque y de estado (ver 4.4).

**Cuándo termina la revisión**

La revisión queda completa cuando los 3 tanques y toda corrida activa están confirmados. La pantalla muestra entonces «Ya tienes un turno en curso» con el botón **Ir a Finalizar Turno**. Vuelve al Hub para continuar con **Preparación** o **Líneas**.

---

### 4.3 Preparación (tanques)

Tarjeta del Hub: **Preparación** (ícono azul). Se habilita cuando hay un turno en curso.

> Captura sugerida: pantalla Preparación con 3 tanques.

Sin turno, la pantalla muestra «Primero debes iniciar un turno» y el botón **Ir a Comenzar Turno**.

#### 4.3.1 Elementos de la pantalla

| Elemento | Qué hace |
|---|---|
| **Tarjetas de tanque** (3) | Una por tanque, con sus acciones. |
| **Ir a Líneas** | Abre la pantalla Líneas. |
| **Novedades del turno** | Bitácora con hora. Ver 4.8. |

#### 4.3.2 La tarjeta de un tanque

| Parte | Qué muestra |
|---|---|
| **Tanque N** e **insignia** | Número y estado (ver 4.3.3). |
| **Dibujo del tanque** | Nivel de líquido con el color del sabor. El porcentaje escrito es lo que queda **del lote**, no de la capacidad del tanque. |
| **Litros** | Litros actuales (solo con producto). |
| **Texto** | Sabor y lote, o el último sabor si está sucio. |

#### 4.3.3 Estados del tanque

| Insignia | Significado | Botones disponibles |
|---|---|---|
| **Liberado** | Preparación lista. Una línea puede tomarla. | **Iniciar nueva preparación**, **Iniciar CIP**, **Fijar volumen real** o **Medir tanque**, **Transferir**, **Desvase**, **Editar** |
| **Con Restos N L** | El lote se cerró pero quedó producto. | **Iniciar Preparación**, **Iniciar CIP**, **Fijar volumen real** o **Medir tanque**, **Transferir**, **Desvase**, **Editar** |
| **En Preparación No Liberado** | Mezcla en curso. | **Liberar (marcar Listo)**, **Ajustar**, **Editar** |
| **Con Restos 0 L** | Vacío, sin limpiar. Muestra «Último: sabor · Lote». | **Iniciar Preparación**, **Iniciar CIP**, **Editar** |
| **En CIP** | Limpieza en curso, con la hora de inicio. | **Terminó CIP**, **Editar** |
| **Limpio** | Disponible para preparar. | **Iniciar Preparación**, **Iniciar CIP**, **Editar** |

**Nota.** **Transferir** y **Desvase** solo aparecen si el tanque tiene producto. **Transferir** además exige que exista un tanque destino válido.

#### 4.3.4 Iniciar Preparación

Crea el lote nuevo y deja el tanque **En Preparación No Liberado**.

| Campo o botón | Qué hace |
|---|---|
| **Sabor** | Lista de sabores activos. |
| **Lote** | Número del lote. Se completa a 4 dígitos (`3` → `0003`). |
| **Tambores** o **Kits** | Cantidad a preparar. Selecto, Mango y 35% se preparan por **kits** (1 kit = 2 tambores). El resto, por tambores. |
| **Sumar un desvase guardado (opcional)** | Aparece si hay litros desvasados de ese sabor en tu área. |
| **≈ N L con este sabor** | Volumen estimado: cantidad × volumen por unidad del sabor + resto del tanque + desvase elegido. |
| **Iniciar Preparación** | Crea la preparación. Se activa con sabor, lote y cantidad válidos. |
| **Cancelar** | Cierra el formulario. |

**Reglas**

- El total no puede superar **20.000 L**. Si lo supera, el estimado se marca en rojo y el botón queda desactivado.
- **El resto del tanque siempre se suma al lote nuevo.** Si el tanque tenía producto, verás: «Quedan N L de sabor sin usar — al preparar encima, se suman solos al lote nuevo. Para otra cosa: Transferir o Desvase.»
- No puedes abrir un número de lote que ya esté abierto para ese sabor en otro tanque de tu área: «Ya hay un lote N de ese sabor abierto en otro tanque. Ciérralo primero o usa otro número.»
- Si preparas encima de un tanque **Liberado**, el lote anterior se cierra y las corridas que lo usaban pasan a **Terminó el Lote** (ver 4.4.5).

#### 4.3.5 Ajustar y Liberar

Se usan con el tanque **En Preparación No Liberado**.

| Botón o campo | Qué hace |
|---|---|
| **Ajustar** | Abre el panel «Sumar jugo o agua al volumen del lote (antes de liberar)». |
| **Litros** | Cantidad a sumar. |
| **Detalle (opcional)** | Nota del ajuste. |
| **Sumar** | Suma los litros al volumen del lote. Queda en el Acta como ajuste de volumen. |
| **Cancelar** | Cierra el panel. |
| **Liberar (marcar Listo)** | Pasa el tanque a **Liberado**. Desde ese momento una línea puede tomarlo. |

**Nota.** Lo que sumas con **Ajustar** aumenta también el volumen de partida del lote, por eso no cuenta como merma.

#### 4.3.6 Medir tanque y Fijar volumen real

Los dos botones sirven para corregir los litros con una medición física. Aparece uno u otro.

| Botón | Cuándo aparece | Qué corrige |
|---|---|---|
| **Fijar volumen real** | El lote nació en este turno y ninguna línea ha corrido todavía de él. | El 100 % del lote: mueve el punto de partida de la merma. |
| **Medir tanque** | Cualquier otro caso con producto. | Solo el volumen actual. No mueve el punto de partida. |

| Campo o botón | Qué hace |
|---|---|
| **Litros (L)** | Litros reales medidos, de 0 a 30.000. |
| **Guardar medición** / **Fijar volumen** | Guarda el valor. |
| **Cancelar** | Cierra el panel. |

**Importante**

- Si mides 0 L y ninguna línea usa el tanque, el lote se cierra y el tanque queda **Con Restos 0 L**.
- La medición es lo que hace visible la merma de semielaborado. Si nadie mide, la pérdida no aparece (ver el capítulo 10).

#### 4.3.7 Transferir

Pasa el contenido de un tanque a otro. Solo está disponible si el tanque tiene producto y hay un destino válido: un tanque **Limpio**, o un tanque **Liberado** o **Con Restos** del **mismo sabor**.

> Captura sugerida: ventana «Transferir Tanque N».

**Paso 1: medir el origen**

| Elemento | Qué hace |
|---|---|
| Campo de litros | Volumen real del tanque origen. Se transfiere ese volumen. |
| **Es correcto, seguir** / **Guardar y seguir** | Confirma el volumen (o lo corrige y lo guarda) y pasa al paso 2. |
| **Cancelar** | Cierra la ventana. |

**Paso 2: elegir el destino**

| Elemento | Qué hace |
|---|---|
| **Tanque destino** | Lista de destinos válidos con su sabor y litros. |
| **Consolidar restos** | Motivo: juntar restos del mismo sabor. |
| **No parar la línea** | Motivo: mover producto para que una línea siga corriendo. |
| **Líquido** / **Lote** | Solo si el destino ya tiene su lote. **Líquido**: el producto se suma al lote del destino. **Lote**: este lote se muda al destino y absorbe lo que había. |
| Resumen | «Se transfieren N L. El Tanque M queda con ~N L (calculado — falta medir el tanque).» |
| **Transferir** / **Sí, transferir** | Ejecuta. Pide segunda confirmación si una línea activa toma de este tanque: «La corrida activa de esta línea va a pasar a tomar del tanque destino al confirmar. ¿Continuar?» |
| **Cancelar** | Cierra la ventana. |

**Límites**

- El destino puede quedar sobre los 20.000 L nominales (aviso ámbar) pero **nunca sobre 30.000 L**: el sistema lo bloquea.
- El tanque origen queda **Con Restos 0 L**.

**Paso 3: cerrar con mediciones reales**

Después de transferir aparece «Transferencia hecha. Cierra los dos tanques con lo que midas de verdad.»

| Elemento | Qué hace |
|---|---|
| **¿El Tanque N quedó vacío? Si no, ¿cuántos L quedaron?** | Escribe 0 si quedó vacío. Los litros que queden vuelven como resto en el origen y se descuentan del destino. No aparece si transferiste el **Lote** completo. |
| **Volumen real del Tanque M** | Litros reales medidos en el destino. |
| **Guardar cierre** | Guarda las mediciones. |
| **Todo quedó bien** | Cierra el panel sin cambios. |

#### 4.3.8 Desvase, CIP y Editar

**Desvase**

Saca todo el resto del tanque y lo guarda, por área y sabor, para sumarlo a una preparación futura del mismo sabor.

| Botón | Qué hace |
|---|---|
| **Desvase** | Pide confirmación. |
| **¿Seguro? Sí, desvasar** | Ejecuta. El lote se cierra y el tanque queda **Con Restos 0 L**. |
| **Cancelar** | Cancela. |

**Nota.** Lo desvasado no cuenta como merma.

**CIP**

| Botón | Qué hace |
|---|---|
| **Iniciar CIP** | Pasa el tanque a **En CIP** y registra la hora de inicio. |
| **Terminó CIP** | Pasa el tanque a **Limpio**. |

**Recomendación.** Inicia el CIP solo con el tanque vacío (después de **Transferir** o **Desvase**).

**Editar** (corrección)

**Editar** corrige un error de registro. Abre este formulario:

| Campo | Qué hace |
|---|---|
| **Estado** | Listo (liberado), Con restos (resto del lote), En Preparación (no liberado), Sucio, En CIP o Limpio. |
| **Sabor**, **Lote** | Para los estados con producto. |
| **Tambores** o **Kits** | Solo para **En Preparación**. Puedes dejar sabor, cantidad y lote vacíos para marcar el tanque en preparación sin datos. |
| Nota «Litros: se corrigen con Medir tanque» | Los litros no se editan aquí. |
| **Guardar** / **Cancelar** | Guarda o cierra. |

**Importante.** Usa **Editar** solo para corregir errores. Para cambiar litros usa **Medir tanque**. Cada corrección queda auditada.

---

### 4.4 Líneas

Tarjeta del Hub: **Líneas** (ícono azul). Se habilita cuando hay un turno en curso.

> Captura sugerida: pantalla Líneas con las 3 llenadoras.

| Elemento | Qué hace |
|---|---|
| **Tarjetas de línea** | Una por línea activa del catálogo. |
| **Ir a Preparación** | Abre la pantalla Preparación. |

#### 4.4.1 La tarjeta de una línea

| Parte | Qué muestra |
|---|---|
| **Nombre** e **insignia** | Línea y su estado (ver 4.4.2). |
| **Dibujo** | Cajas con el color del sabor: animadas si corre, atenuadas si está parada. Etiqueta **L1**, **L2** o **L3**. |
| **Presentación**, **Velocidad**, **Sabor / Lote** | Datos de la corrida activa. |

#### 4.4.2 Estados y botones

| Insignia | Significado | Botones |
|---|---|---|
| **Corriendo** | Corrida activa. | **Parada Operacional** |
| **Parada** (ámbar) | Corrida en pausa, con motivo. | **Continuar**, **Detener línea** |
| **Terminó el Lote** | El lote de la corrida se cerró. | **Seguir con el mismo lote**, **Continuar al siguiente lote**, **Detener línea** |
| **Esperando PT** | Corrida detenida que espera su Producto Terminado. | **Arrancar otra línea**: permite arrancar un lote distinto. La corrida detenida sigue esperando su Producto Terminado. |
| **Lista para arrancar** | Sin corrida. | **Arrancar línea**, **Sin programación**, **Cambio de Presentación**, **Iniciar CIP** |
| **Parada** (rojo) | Línea detenida, sin corrida. | Los mismos que **Lista para arrancar** |
| **Cambio de Presentación** | Cambio de formato en curso. | Los mismos que **Lista para arrancar** |
| **Sin programación** | Línea sin plan de producción. | Los mismos que **Lista para arrancar** |
| **En CIP** | Limpieza en curso, con hora de inicio. | **Terminó CIP** |

**Nota.** «Parada» aparece en dos colores. Ámbar es una pausa de una corrida en marcha. Rojo es una línea detenida sin corrida.

Mientras una línea tenga una corrida activa o **Esperando PT**, no puedes cambiar su estado a **Sin programación**, **Cambio de Presentación** ni **CIP**: primero detén la corrida y carga su Producto Terminado. En la revisión de inicio esos botones se ven desactivados con el aviso «Para cambiar el estado de la línea, primero detén la corrida y carga su Producto Terminado.»

#### 4.4.3 Arrancar línea

> Captura sugerida: formulario de arranque con el resumen de confirmación.

| Campo o botón | Qué hace |
|---|---|
| **Tanque** | Solo muestra tanques **Liberados**, con su sabor y lote. Si no hay: «Ningún tanque está Listo (liberado) todavía». |
| **Presentación** | Presentaciones configuradas para esa línea. |
| **Velocidad** | Opciones de la línea y la presentación, por ejemplo «7500 env/h · 1875 L/h». |
| **Arrancar línea** | Primer clic: muestra el resumen «Vas a arrancar Línea N con Sabor · Lote X del Tanque N, a 250 ml · 7500 env/h. ¿Confirmar?» |
| **Sí, arrancar línea** | Segundo clic: confirma y arranca. |
| **Cancelar** | Cierra el formulario. |

**Nota.** La presentación y la velocidad se prellenan con lo último que usó esa línea. Verifícalas siempre.

**Bloqueos frecuentes**

- El tanque debe estar **Liberado**.
- Si el lote nació en otro turno, debes haber confirmado su estado de inicio (ver 4.2.2).
- Una línea no puede arrancar un lote que ya corrió en este turno.
- Una línea con corrida en curso no puede arrancar otra: primero **Detener línea** y carga su Producto Terminado.
- Un lote con una corrida detenida sin Producto Terminado no puede volver a arrancar hasta cargarlo.

#### 4.4.4 Parada Operacional

Pausa la corrida sin cerrarla. Sirve para paradas cortas.

| Elemento | Qué hace |
|---|---|
| **Parada Operacional** | Abre el panel del motivo. |
| **Motivo de la parada** | Texto obligatorio, hasta 140 caracteres, con contador. |
| **Confirmar parada** | Pausa la corrida. La línea muestra **Parada**. |
| **Cancelar** | Cierra el panel. |
| **Continuar** | Reanuda la corrida. |

#### 4.4.5 Terminó el Lote

El sistema marca **Terminó el Lote** cuando el lote de la corrida se cierra. Por ejemplo, cuando preparas otro lote encima, transfieres o desvasas el tanque, o el lote queda en cero al medir o al cargar el Producto Terminado. La corrida sigue activa. El sistema pregunta: «¿sigue con el mismo lote, pasa al siguiente o se detiene la línea?»

| Botón | Qué hace |
|---|---|
| **Seguir con el mismo lote** | Solo quita el aviso. No toca el tanque ni los litros. Úsalo si el aviso fue un error. |
| **Continuar al siguiente lote** | Busca el lote siguiente (por ejemplo 0004 después de 0003), del mismo sabor, en un tanque **Liberado**, y arranca ahí con la misma presentación y velocidad. |
| **Detener línea** | Ver 4.4.6. |

Si el sistema no encuentra el tanque solo, muestra: «No se detectó solo el tanque del siguiente lote. Elige cuál toma la línea:» con la lista **Tanque** y los botones **Continuar con ese tanque** y **Cancelar**.

#### 4.4.6 Detener línea

Cierra la corrida en dos pasos. **No se puede deshacer.**

| Elemento | Qué hace |
|---|---|
| **Detener línea** | Abre el aviso: «Esto detiene la corrida del Lote X. Queda esperando que cargues su Producto Terminado para cerrarse. No se puede deshacer.» |
| **Motivo (opcional)** | Hasta 140 caracteres. Se muestra en el Panel de Producción. |
| **Sí, detener línea** | Detiene la corrida. Queda **Esperando PT**. |
| **Cancelar** | Cierra el aviso. |

La corrida solo se cierra de verdad cuando cargas su Producto Terminado (ver 4.5).

---

### 4.5 Producto Terminado y Contador

Tarjeta del Hub: **Producto Terminado y Contador**. Se habilita cuando hay un turno en curso.

> Captura sugerida: selección de Sabor → Lote → Línea.

Aquí cargas, por cada corrida del turno, el contador de la llenadora y las paletas y cajas empacadas. Cargar el Producto Terminado de una corrida activa **también la cierra** para este turno.

#### 4.5.1 Cómo navegar

Las corridas se organizan en tres niveles.

| Nivel | Qué ves |
|---|---|
| **Sabor** | Tarjetas por sabor: «N lotes · M líneas». |
| **Lote** | Tarjetas por lote: «Lote X · N líneas». |
| **Línea** | Una tarjeta por corrida, con su formulario. |

Si solo hay un sabor o un lote, se abre solo. Las corridas ya cerradas se ocultan: usa **Ver corridas cerradas (N)** u **Ocultar corridas cerradas (N)**.

Si no hay corridas: «Ninguna línea usada todavía».

#### 4.5.2 Formulario de una corrida activa

| Campo o botón | Qué hace |
|---|---|
| **Contador acumulado: N envases** | Suma de todo lo cargado en el contador de esa corrida. |
| **Envases llenadora (Contador)** | Lectura de la llenadora. **Se suma** al acumulado. |
| **Envases buenos (Contador 2)** | Obligatorio junto al contador de la llenadora. No puede superarlo. |
| **Sabor** | Solo lectura. |
| **Paletas** | Total de paletas de la corrida. **Reemplaza** el valor anterior. |
| **Cajas sueltas** | Total de cajas fuera de paleta. **Reemplaza** el valor anterior. |
| **Total: N cajas, N L.** | Vista previa de cajas y litros. |
| **Merma estimada: X %** | Recuadro de color. Ver 4.5.3. |
| **Justificación de la merma...** | Obligatoria si la merma supera el 3 %. |
| **¿Qué pasa con esta línea?** | Debes elegir una opción (ver 4.5.4). |
| **Cerrar** | Guarda contador y Producto Terminado, y cierra la corrida según tu elección. |

**Mensajes de validación**

- «El Contador 2 (envases buenos) es obligatorio junto con el contador de la llenadora.»
- «Los envases buenos no pueden superar el total de la llenadora.»

**Nota.** Si no produjo nada, carga 0 paletas y 0 cajas para poder cerrar la corrida.

#### 4.5.3 Recuadro de merma estimada

Calcula la merma de envase de la corrida con lo que llevas escrito: 1 − (envases empacados ÷ envases de la llenadora). Ver el capítulo 10.

| Color | Condición | Qué hacer |
|---|---|---|
| Verde | Hasta 3 % | Nada. Indica «límite 3 %». |
| Rojo | Más de 3 % | «supera el 3 %, requiere justificación.» Escribe la justificación. |

Si aún no hay contador cargado, dice **Merma provisional (contra el contador de referencia)**.

#### 4.5.4 Terminar o Entregar línea

| Opción | Qué significa |
|---|---|
| **Terminar** | La corrida termina en este turno. |
| **Entregar línea (sigue el próximo turno)** | La línea sigue corriendo en el turno siguiente. El Producto Terminado que cargas es solo el tramo de tu turno. |

Al elegir **Entregar línea**, la corrida queda lista para que el turno siguiente la herede.

#### 4.5.5 Medir el tanque después de cerrar

Al cerrar una corrida, el sistema pide medir el tanque de ese lote. Así el tanque deja de verse lleno y no se vuelve a correr por error.

| Elemento | Qué hace |
|---|---|
| **Litros en el Tanque N** | Litros reales medidos. Muestra «Teórico ahora: N L» como referencia. |
| **Guardar medición** | Guarda. Si el tanque quedó en cero, el lote se cierra solo. |
| **No medir ahora** | Omite la medición. No se recomienda: la merma de semielaborado depende de esta lectura. |

**Importante.** El sistema descuenta solo los litros del tanque cuando cargas el Producto Terminado. **No los bajes a mano**: se contarían dos veces.

#### 4.5.6 Tarjetas especiales

| Estado de la tarjeta | Qué ves | Qué hacer |
|---|---|---|
| **Parada** | Aviso: la línea está parada y no se puede cargar su Producto Terminado hasta reanudarla. | Ve a **Líneas** y presiona **Continuar**. |
| **Cerrada** | **Contador acumulado**, **Paletas · Cajas sueltas**, **Litros producidos**, **Estado** («Entregada a las HH:MM» o «Sabor terminado») y **Δ envases (buenos vs. PT)**. | Solo lectura. |

**Δ envases (buenos vs. PT)** es la diferencia absoluta entre el Contador 2 y los envases del Producto Terminado. Sirve para detectar si olvidaste actualizar uno de los dos.

**Editar un error**

En una corrida cerrada, **Editar un error** reabre el formulario con el botón **Guardar corrección** (y **Cancelar**).

**Importante**

- Pasada **1 hora** desde que se cargó el Producto Terminado, el supervisor ya no puede cambiarlo: «Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde que se cargó). Se corrige desde el módulo Validar cuando cierre el turno.» Avisa al Super Administrador.
- El contador se suma. Si te equivocaste en el contador, avisa al Super Administrador para que lo corrija en **Validar**.

#### 4.5.7 Ventana de gracia de 15 minutos

Si finalizas el turno antes de cargar todo, tienes **15 minutos** para terminar de cargar las paletas y cajas. La pantalla avisa: «Este turno ya se cerró — quedan unos minutos para terminar de cargar el Producto Terminado (Paletas / Cajas sueltas). Contador y Terminar/Entregar línea ya no se pueden tocar acá.»

---

### 4.6 Finalizar Turno

Tarjeta del Hub: **Finalizar Turno** (en rojo mientras hay turno).

> Captura sugerida: pantalla Finalizar Turno.

#### 4.6.1 Avisos previos

| Aviso | Significado |
|---|---|
| Recuadro rojo «Esta línea sigue activa» | **Bloqueo.** Hay corridas activas sin resolver. Carga su Producto Terminado y elige **Terminar** o **Entregar línea**. El botón **Ir a Producto Terminado** te lleva ahí. |
| Recuadro ámbar «Falta cargar N cosas» | Aviso. Lista lo que falta (preparaciones, contadores, Producto Terminado, estado final de tanques). Puedes finalizar igual con un segundo clic. |

#### 4.6.2 Contenido

| Sección | Qué muestra |
|---|---|
| **Resumen del turno** | Nombre, código, fecha, turno, grupo, **Cajas producidas por línea** y **Litros producidos**. |
| **Novedades del turno** | Bitácora con hora. Opcional. Ver 4.8. |
| **Estado final de tanques** | Confirma o corrige cada tanque. Se abre sola si falta alguno. |
| **Estado de líneas** | Cómo quedó cada llenadora al cierre. |
| **Preparaciones** | Solo si hay un tanque **En Preparación**: tambores y ajustes cargados. |

**Estado final de tanques**

| Botón | Qué hace |
|---|---|
| **Confirmar** | Da por bueno el estado final. Fija el volumen de cierre de tu turno: es la base del cálculo de merma de semielaborado. |
| **Editar** | Corrige estado, sabor, volumen y lote. |
| **Guardar estado final** | Guarda la corrección y la cuenta como confirmación. |

#### 4.6.3 Finalizar

| Botón | Qué hace |
|---|---|
| **Finalizar Turno (genera el Acta)** | Cierra el turno y genera el Acta en PDF. |
| **Finalizar de todos modos** | Aparece tras el primer clic si falta algo. Confirma el cierre. |

**Lo que el sistema exige para cerrar**

| Condición | Mensaje del sistema |
|---|---|
| No hay corridas detenidas sin Producto Terminado. | «Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.» |
| No hay líneas activas sin resolver. | «Estas líneas siguen activas: … Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.» |
| Los tanques con producción del turno tienen su estado final confirmado. | «Hay tanques con producción de este turno sin confirmar su estado final…» |
| Las líneas entregadas tienen su estado final confirmado. | «Hay líneas entregadas de este turno sin confirmar su estado final.» |

#### 4.6.4 Después de finalizar

La pantalla muestra **Turno cerrado**, con el código del turno.

| Botón | Qué hace |
|---|---|
| **Ver mi acta** | Abre el PDF en una pestaña nueva. Desde allí puedes imprimirlo o guardarlo. |
| **Volver al inicio** | Regresa al Hub. |

Si el PDF no se genera, aparece un mensaje en rojo. Pide a tu Administrador de Área que lo genere desde **Auditoría**.

**Cierre automático.** Si no finalizas, el sistema cierra el turno solo 30 minutos después de su hora de fin (no aplica a 12x12). Las corridas sin resolver se sellan sin Producto Terminado y quedan para revisión en **Validar**. La próxima vez que abras el Hub, el sistema genera tu acta sola y la verás en **Mis Actas**.

---

### 4.7 Mis Actas

Tarjeta del Hub: **Mis Actas**.

> Captura sugerida: lista de actas.

Lista las actas de tus turnos cerrados, la más reciente primero.

| Elemento | Qué muestra o hace |
|---|---|
| **Fecha · Turno · Grupo** | Identifica el turno. |
| **Código del turno** | Por ejemplo `A20260918_T1G2`. |
| **Descargar** | Abre el PDF del acta en una pestaña nueva. |

Sin actas: «Todavía no tienes actas».

#### 4.7.1 Qué contiene el Acta

| Sección | Contenido |
|---|---|
| **Encabezado** | Fecha, turno, grupo, área, supervisor y código. |
| **1.6 Condición en la que reciben los tanques** | Estado, lote y litros encontrados al iniciar. |
| **1.7 Seguimiento del semielaborado** | Por lote: volumen preparado, volumen de inicio, PT por línea, volumen final y **% Rendimiento**. |
| **Ajustes de volumen (agua / jugo)** | Aparece solo si hubo ajustes. |
| **1.8 Condición en la que entregan los tanques** | Estado, lote y litros al cierre. |
| **1.9 Estado de la producción** | Cajas por presentación y línea. |
| **2.1 Condiciones, eficiencia y merma** | Eficiencia y merma por línea. |
| **2.2 Contador de llenadora** | Por sabor: contador, producto terminado y diferencia, por línea. |
| **2.3 Novedades del turno** | Bitácora con hora. |
| **2.4 Servicios Industriales** | Lecturas de Quantum, agua osmotizada y gasoil del turno. |
| **Firma** | Firma del supervisor saliente. |

**Nota.** Si el acta se generó de nuevo, las versiones anteriores quedan **Anuladas** y solo la última es **Vigente**.

---

### 4.8 Novedades del turno

Aparece al final de **Preparación** y dentro de **Finalizar Turno**.

| Elemento | Qué hace |
|---|---|
| **Cuadro de texto** | Escribe la novedad. Ejemplo: «Falla el fluido eléctrico». |
| **Botón de enviar** (avioncito) o tecla **Enter** | Agrega la novedad con la hora actual. |
| **Lista** | Muestra las novedades, la más reciente arriba, con su hora. |

**Nota.** Las novedades no se pueden editar ni borrar. Escríbelas con cuidado. Alimentan la sección 2.3 del Acta.

---

## 5. Panel de Producción

Disponible para todos los roles. Muestra el estado de la planta en vivo o de un turno anterior. Es de solo lectura.

> Captura sugerida: Panel completo en modo EN VIVO.

**Importante.** Las cajas, los litros, la meta y las mermas se actualizan cuando el supervisor carga el contador y el Producto Terminado de una corrida (al cerrarla). Mientras una corrida está corriendo sin cerrar, sus números todavía no aparecen.

**Nota para el Supervisor.** Si tocas un tanque o una línea del Panel, la aplicación te lleva a **Preparación**.

### 5.1 Banner superior

| Elemento | Qué muestra o hace |
|---|---|
| **En Operación** / **Turno cerrado** / **Sin turnos registrados** | Estado del turno que se está viendo. |
| **EN VIVO** / **FECHA: … · Turno** | Indica el modo. Al presionarlo se abren los filtros (ver 5.2). |
| **Última actualización hace…** | Momento de la última acción cargada por un supervisor. |
| **Botón de área** (solo Super Administrador) | Área que se está viendo. Presiónalo para cambiarla. |
| **Supervisor · cargo** | Quién opera el turno mostrado. |
| **Turno … · Grupo … · Cerrado HH:MM** | Código del turno y, si ya cerró, su hora de cierre. |

**Las cuatro celdas del banner**

| Celda | Qué muestra |
|---|---|
| **Hora** | Reloj de la planta y el horario del turno («Turno de 07:00 a 15:00»). |
| **Producción del turno** | **Cajas** y **Litros** de Producto Terminado cargados en el turno. |
| **Programación diaria** | Carrusel que rota cada 2,5 segundos: «SABOR · ml» y **hecho / plan** en cajas. Ver el capítulo 6. |
| **Cumplimiento de meta** | Anillo con el porcentaje y «reales / esperadas — Cajas reales vs. meta». Ver 10.4. |

En **Programación diaria**, «hecho» es lo producido en toda la jornada (los tres turnos) cuando estás en vivo. Si el sabor no estaba en el plan, el plan aparece como «—». Sin plan: «Por programar».

### 5.2 Filtros y modo EN VIVO

Presiona el botón **EN VIVO** (o el de fecha) para abrir la barra de filtros.

| Filtro o botón | Qué hace |
|---|---|
| **Área** | Solo Super Administrador. Elige un área o «Todas las áreas». |
| **Turno** | Turno 1, 2, 3 o 12x12. |
| **Fecha** | Día de la jornada a consultar. |
| **Ver en vivo** | Vuelve al turno más reciente del área. |

**Cómo funciona**

- En vivo, el Panel muestra el turno más reciente del área, esté abierto o recién cerrado. Así los tanques y las líneas se ven también entre un turno y el siguiente.
- En vivo se refresca solo cada **30 minutos**, sin recargar la pantalla. Un turno histórico elegido a mano no se refresca.
- Sin turno: «Todavía no se registró ningún turno». Con filtro sin resultados: «No hay ningún turno para esa fecha/turno».

### 5.3 Tarjeta Tanques

Encabezado: «N/3 listos» (tanques **Liberados**).

| Elemento | Qué muestra |
|---|---|
| **Franja de Servicios Industriales** | **Quantum** (°C), **Agua Osmotizada** (L) y **Gasoil** (L), con cuánto hace que se cargaron y quién. Solo informativa. |
| **Dibujo del tanque** | Nivel con el color del sabor, con el porcentaje del lote que queda. |
| **Litros** | Litros actuales. |
| **En espera de corte** | Etiqueta ámbar cuando el tanque pasa de 20.000 L. |
| **Insignia de sabor** y **Lote** | Sabor y lote. «Resto del lote X» si es un **Con Restos**. |
| **En Preparación** | Con tambores, sabor y lote. |
| Texto «Pendiente de limpieza.» / «Proceso de limpieza desde las HH:MM.» / «Disponible para llenar.» | Tanque **Con Restos 0 L**, **En CIP** o **Limpio**. |

### 5.4 Tarjeta Líneas activas

Encabezado: «N/3 en marcha».

| Columna | Qué muestra |
|---|---|
| **Línea** | Punto de color, nombre y presentación, sabor, estado y **TP** (ver abajo). Si la línea está detenida, la nota del motivo en rojo. |
| **Cajas producidas** | Cajas de Producto Terminado de la línea en el turno. |
| **Litros producidos** | Litros de Producto Terminado de la línea. |
| **Eficiencia** | Velocidad elegida ÷ velocidad máxima de la línea y presentación. Ver 10.5. |
| **Tiempo de parada** | Minutos de paradas registradas. Muestra «—» si no hay (ver el capítulo 12). |
| **Merma** | Merma de envase de la línea. Ver 10.2. |

**TP** (Tiempo de Producción): minutos desde que se activó la corrida. Solo se muestra mientras corre.

**Estados de la línea**

| Estado | Punto | Significado |
|---|---|---|
| **Activa** | Verde con pulso | Corrida en marcha. |
| **Parada** | Ámbar | Corrida en pausa (Parada Operacional). |
| **Esperando cierre** | Rojo | Corrida detenida que espera su Producto Terminado. |
| **Cambio de Presentación** | Ámbar | Cambio de formato. |
| **En CIP** | Ámbar | Limpieza en curso. |
| **Sin programación** | Azul | Sin plan de producción. |
| **Parada** | Rojo | Línea detenida, sin corrida. |
| **Libre** | Gris | Disponible. |

**Colores de las cifras**

| Cifra | Verde | Ámbar | Rojo |
|---|---|---|---|
| **Eficiencia** | 90 % o más | 60 % a 89 % | Menos de 60 % |
| **Merma** | Hasta 3 % | Más de 3 % y hasta 5 % | Más de 5 % |

### 5.5 Merma de envase y Rendimiento

Dos tarjetas comparan el **Turno pasado** (el último turno cerrado del área) con el **Turno actual**.

| Tarjeta | Qué muestra | Insignia | Colores |
|---|---|---|---|
| **Merma de envase** | % de merma de envase del turno. | **Máx. 5%** | Verde hasta 3 %. Ámbar hasta 5 %. Rojo más de 5 %. |
| **Rendimiento** | % de rendimiento del semielaborado (100 − merma de semielaborado). | **Mín. 98,5%** | Verde con 99 % o más. Ámbar de 98,5 % a 99 %. Rojo por debajo de 98,5 %. |

Si el turno actual de **Merma de envase** supera el máximo, aparece «El turno actual está fuera de tolerancia.» Un valor «—» significa que todavía no hay datos comparables. Ver el capítulo 10.

### 5.6 Detalle del turno

Secciones que se abren y cierran con un clic.

| Sección | Qué muestra |
|---|---|
| **Meta por línea** | Por línea: cajas reales / esperadas, porcentaje y barra (verde desde 90 %, ámbar desde 60 %, rojo por debajo). |
| **Top Fallas — paradas por línea** | Solo Área de Pruebas. Ver el capítulo 12. |
| **Desglose de cálculo** | Solo Aséptico y Pruebas. Los números crudos detrás de cada porcentaje. Ver abajo. |

**Desglose de cálculo**

Muestra las horas transcurridas del turno, una tabla por corrida y las fórmulas.

| Columna de la tabla | Qué muestra |
|---|---|
| **Corrida** | Línea y presentación. Añade «finalizada» si ya cerró. |
| **Lote** | Lote de la corrida. |
| **Env. llenadora** | Envases del contador. |
| **Env. prod. term.** | Envases equivalentes al Producto Terminado. |
| **Merma envase** | Merma de la corrida. |
| **Cajas reales** / **Cajas esperadas** | Solo para corridas activas. |

| Dato | Fórmula que muestra |
|---|---|
| **Merma de envase — turno** | 1 − (Σ envases prod. term. ÷ Σ envases llenadora) |
| **Consumo de semielaborado del turno** | Σ (volumen del lote al inicio del turno − al final) |
| **Litros de Producto Terminado del turno** | Σ litros de Producto Terminado de todas las corridas del turno |
| **Rendimiento del semielaborado** | litros de Producto Terminado del turno ÷ consumo del turno |
| **Merma de semielaborado** | 1 − (Producto Terminado del turno ÷ consumo del turno) |
| **Ajuste teórico vs. real** | Correcciones manuales de volumen de lote (negativo = litros que faltaron). Aparece solo si hubo. |
| **Cajas reales / esperadas** | Corridas activas: velocidad ÷ envases por caja × horas |
| **Cumplimiento de meta** | cajas reales ÷ cajas esperadas |

Si hubo correcciones de volumen, se listan como «Sabor · Lote X: N L → N L (±N L) · quién · fecha».

### 5.7 Histórico: Resumen de Planta

Sección colapsable al final. Independiente del turno que estés viendo arriba.

| Elemento | Qué hace |
|---|---|
| **Desde** | Fecha inicial. Por defecto, 30 días atrás. |
| **Hasta** | Fecha final. Vacío = hasta hoy. |
| **Buscar** | Consulta el rango. Incluye turnos en curso. |

Resultados:

| Bloque | Qué muestra |
|---|---|
| **Merma real** | Merma de envase de todo el rango. Marca «Fuera de tolerancia» si supera 5 %. |
| **Horas de producción** | Suma de las horas del turno por cada corrida incluida. |
| **Litros producidos** | Litros de Producto Terminado del rango. |
| **Matriz supervisor × grupo** | Litros por cruce. Más intenso = más volumen. |
| **Por Grupo** | Litros, horas y merma real por grupo. |
| **Por Supervisor** | Litros (con barra) y merma real por supervisor. |

Sin datos: «No hay turnos en ese rango de fechas.»

**Nota.** La **Merma real** agregada suma primero los envases de todas las corridas y recién después calcula el porcentaje. No promedia porcentajes. Ver 10.2.

---

## 6. Programación

Tarjeta del Hub: **Programación** (atajo). Muestra el plan de producción de la jornada, por sabor y presentación, en cajas.

> Captura sugerida: Programación en modo edición.

- **Todos los roles** (excepto el área de Servicios Industriales) ven el plan en solo lectura.
- **Solo el Super Administrador** puede editarlo.

### 6.1 Vista de solo lectura

| Elemento | Qué muestra |
|---|---|
| **Jornada del AAAA-MM-DD** | Fecha de la jornada. |
| **Área** | El área del plan. |
| **Renglones** | «Sabor · N ml» y las cajas planificadas. |
| **Total** | Suma de cajas. |

Sin plan: «Sin programación para hoy — El Super Administrador todavía no cargó el plan de la jornada.»

### 6.2 Edición (Super Administrador)

| Elemento | Qué hace |
|---|---|
| **Selector de área** | Elige el área del plan. |
| **Sabor** | Escribe con autocompletado. Debe ser un sabor de la lista. |
| **Present.** | Presentación del renglón. |
| **Cajas** | Cantidad planificada (0 o más). |
| **Papelera** (**Quitar**) | Elimina el renglón. |
| **Agregar renglón** | Añade un renglón vacío. |
| **Total** | Suma de cajas de los renglones válidos. |
| **Guardar** | Guarda el plan. Muestra «Programación guardada.» |

**Validaciones**

- Un renglón con sabor no válido o repetido se marca en rojo.
- «Hay un sabor + presentación repetido.» Cada combinación puede aparecer una sola vez.
- **Guardar** se activa solo con todos los renglones completos y sin repetir.

El plan alimenta el carrusel **Programación diaria** del Panel de Producción (hecho / plan).

---

## 7. Servicios Industriales

Para el Supervisor del área **Servicios Industriales**. Esta área no opera turnos de producción. Ve **Panel de Producción**, **Servicios Industriales** y **Registros del Área**.

### 7.1 Servicios Industriales (cargar lecturas)

> Captura sugerida: pantalla Servicios Industriales.

**Última lectura**

Muestra lo mismo que ve el Panel de Producción sobre los tanques.

| Dato | Qué muestra |
|---|---|
| **Quantum** | Temperatura en °C. |
| **Agua Osmotizada** | Litros. |
| **Gasoil** | Litros. |
| Fecha, hora y nombre | Cuándo y quién la cargó. |

**Cargar lectura nueva**

| Campo o botón | Qué hace |
|---|---|
| **Temperatura del Quantum (°C)** | Ejemplo: 4.5. |
| **Agua Osmotizada (L)** | Ejemplo: 15000. |
| **Gasoil (L)** | Ejemplo: 200. |
| **Guardar lectura** | Guarda la lectura. Se activa con **al menos uno** de los tres valores. Muestra «Lectura guardada.» |

**Notas**

- El Panel muestra solo la **última lectura guardada**. Si cargas un solo valor, los otros aparecen como «—» hasta la próxima lectura que los incluya. Carga los tres valores en cada lectura.
- Es información de apoyo. No entra en ningún cálculo de merma.
- Si hay un turno de producción abierto al guardar, la lectura se asocia a ese turno y aparece en la sección 2.4 del Acta.
- Las lecturas no se editan. Cada una queda en el historial.

### 7.2 Registros del Área

Historial de lecturas, la más reciente primero.

| Columna | Qué muestra |
|---|---|
| **Nombre** | Quién cargó la lectura. |
| **Fecha** y **Hora** | Cuándo. |
| **Quantum**, **Agua Osmotizada**, **Gasoil** | Valores cargados (o «—»). |

Sin registros: «Todavía no hay registros».

---

## 8. Administrador de Área

El Administrador de Área ve en el Hub: **Panel de Producción**, **Programación** (solo lectura), **Personal** y **Auditoría**. No opera turnos. Solo ve datos de su área.

### 8.1 Personal

Tarjeta del Hub: **Personal**. Alta, edición y baja del personal de tu área.

> Captura sugerida: lista de personal con filtros.

**Filtros de la lista**

| Elemento | Qué hace |
|---|---|
| **Buscar por nombre, usuario o cédula** | Filtra mientras escribes. |
| **Todos los roles** | Filtra por rol. |
| **Todos los cargos** | Filtra por cargo, o **Sin cargo**. |
| **Todos / Activos / Inactivos** | Filtra por estado. |
| **Limpiar filtros** | Quita todos los filtros. Aparece si hay alguno activo. |

El título indica cuántas personas hay («N personas registradas») o cuántas coinciden («N de M personas»).

**Columnas**: **Nombre**, **Usuario**, **Cédula**, **Área**, **Rol** y **Cargo**. Si la persona cubre un reemplazo, bajo el área se lee «De Área de origen» en azul. Las personas inactivas aparecen tachadas con la insignia **Inactivo**.

**Acciones por fila**

| Ícono | Nombre | Qué hace |
|---|---|---|
| Lápiz | **Editar** | Abre la edición en la misma fila. |
| Llave | **Restablecer contraseña** | Abre un campo para la clave nueva. |
| Círculo tachado | **Desactivar** | Da de baja a la persona sin borrar su historial. |
| Flecha circular | **Reactivar** | Solo en inactivos. Vuelve a darla de alta. |
| Papelera roja | **Eliminar** | Borra a la persona definitivamente. |

**Editar**

| Campo | Qué hace |
|---|---|
| **Nombre**, **Cédula** | Datos personales. |
| **Área** | Área de trabajo. |
| **Área de origen** | Opcional. Informativa: para quien cubre un reemplazo temporal en otra área. No cambia permisos. |
| **Rol** | Supervisor, Administrador de Área o Mantenimiento. |
| **Cargo** | Rótulo visual, opcional. |
| Ícono ✔ / ✖ | Guardar o cancelar. |

**Restablecer contraseña**

| Elemento | Qué hace |
|---|---|
| **Nueva contraseña para @usuario** | Escribe la clave nueva. |
| **Guardar** | La aplica. La persona deberá repetir el **primer ingreso** y elegir su propia clave. |
| **Cancelar** | Cierra el campo. |

**Eliminar**

| Elemento | Qué hace |
|---|---|
| Aviso «¿Eliminar a … definitivamente? No se puede deshacer.» | Pide confirmación. |
| **Sí, eliminar** | Elimina a la persona. |
| **Eliminar de todas formas (borra también sus turnos)** | Aparece solo si la persona tiene turnos o contadores. **Borra también todos sus turnos.** Úsalo solo con usuarios de prueba. |
| **Cancelar** | Cierra el aviso. |

**Importante.** Para retirar a una persona que ya operó, usa **Desactivar**, no **Eliminar**. Así se conserva su historial.

**Agregar personal**

Presiona **Agregar personal**.

| Campo | Qué hace |
|---|---|
| **Nombre**, **Cédula**, **Usuario**, **Contraseña** | Obligatorios. Da una clave inicial (por lo general 1234): la persona la cambiará en su primer ingreso. |
| **Área** | Fija en tu área. |
| **Rol** | Obligatorio. |
| **Cargo (opcional)** | Rótulo visual. |
| **Área de origen (opcional)** | Solo para reemplazos. |
| **Agregar** / **Cancelar** | Crea a la persona o cierra el formulario. |

**Alcance.** El sistema valida en el servidor que solo puedas ver y editar personal de tu área, y que no puedas asignar el rol de Super Administrador.

### 8.2 Auditoría

Tarjeta del Hub: **Auditoría**. La usan el Administrador de Área y el Super Administrador. Muestra qué hizo cada supervisor, turno por turno.

> Captura sugerida: Auditoría con un turno expandido.

**Estado de los turnos por área**

En la parte superior, una fila por área: **Turno Activo · Supervisor** (verde) o **Sin turno activo**.

**Búsqueda**

| Elemento | Qué hace |
|---|---|
| **Turnos de hoy** / **Ayer** / **Últimos 7 días** | Rango de fechas predefinido (por fecha de jornada). |
| **Fecha exacta** | Muestra un selector de fecha y una lista **Todos los turnos** para filtrar por tipo de turno. |
| **Buscar por supervisor, sabor, lote o cualquier texto…** | Filtra por persona, sabor, lote o texto de cualquier evento. Muestra «N turnos coinciden con “texto”». |
| **Pestañas** «Turno 1 · N» | Un turno por pestaña, con la cantidad de supervisores. |

Los turnos se agrupan por fecha (la más reciente primero): «lunes, 15 de septiembre de 2026 · N supervisores».

**Fila de un supervisor**

| Parte | Qué muestra |
|---|---|
| **Nombre**, **Área · Cód.** | Quién y qué turno. |
| **Abierto** / **Cerrado** | Estado del turno. |
| **Sabores** | Cada sabor con sus lotes. |
| **Línea: presentación · sabor · Lote · cajas · contador · merma de envases** | Una línea por línea, lote y presentación. |
| «⚠ 2 registros idénticos — revisar» | Dos corridas cargaron las mismas paletas y cajas. Posible re-digitación. Solo se cuenta una. |
| **Sin producción** | Corridas activadas que no registraron producción. |
| **Cajas** | Total de cajas del turno. |
| **Litros: N consumidos → N producidos · merma de semielaborado** | Ver el capítulo 10. Puede decir «sin dato» o «parcial (N L sin contrastar)». |
| **Acta** | Abre el PDF vigente del turno (si existe). |
| **Abrir** | Abre el detalle del turno. |

Al hacer clic en la fila se despliega la **línea de tiempo** del turno, por hora, con estas secciones: **Comenzar Turno**, **Líneas en uso**, **Tanques**, **Preparaciones**, **Contadores y Merma** y **Producto Terminado**. Un evento que ocurre después de la medianoche se muestra con su fecha (por ejemplo «27/08 00:10»).

**Detalle de un turno** (botón **Abrir**)

| Elemento | Qué hace |
|---|---|
| **Volver a la búsqueda** | Regresa a la lista. |
| **Eliminar Turno** | Solo en turnos cerrados. Pide confirmación: «¿Eliminar el turno X definitivamente? No se puede deshacer.» con **Sí, eliminar** y **Cancelar**. |
| **Generar Acta** | Aparece si el turno se cerró solo y no tiene acta. Genera el PDF. Luego muestra «Acta generada — descargarla.» |
| **Línea de tiempo** | Todos los eventos del turno, con hora, sección y detalle. |

**Importante.** El botón **Eliminar Turno** aparece para ambos roles, pero **solo el Super Administrador puede completar la eliminación**. El Administrador de Área recibe «No tienes permiso para hacer esto.»

**Secciones al final**

| Sección | Quién la ve | Qué muestra |
|---|---|---|
| **Registro de cambios (auditoría)** | Super Administrador | Toda creación, edición o eliminación del rango: cuándo, quién, qué. |
| **Actas del rango** | Ambos roles | Lista de actas con código, supervisor, fecha y área. Insignia **Vigente** o **Anulada**. Botón **PDF** para abrir cada una. |
| **Exportar dataset (CSV)** | Super Administrador | Descarga un archivo con una fila por corrida del rango, de todas las áreas menos Pruebas. |

**Registro de cambios**

Agrupado por día, lo más nuevo primero. Cada línea muestra la hora, la acción, el resumen, la persona (con su cargo) y la pantalla donde ocurrió.

| Acción | Color |
|---|---|
| **CREAR**, **ACTIVAR** | Verde |
| **EDITAR** | Ámbar |
| **DESACTIVAR** | Gris |
| **RESET_PASSWORD** | Secundario |
| **ELIMINAR** | Rojo |

**ver valores** / **ocultar valores** despliega el antes y el después de cada campo modificado.

---

## 9. Super Administrador

El Super Administrador ve todas las áreas. En el Hub tiene **Panel de Producción**, **Programación** (editable), **Auditoría**, **Validar**, **Calculadoras** y **Edición de Datos**. Ver el capítulo 8 para **Auditoría** y la gestión de personal.

### 9.1 Validar

Tarjeta del Hub: **Validar** (ícono ámbar). Revisa cada corrida de los turnos cerrados y la marca como correcta o la corrige. **Lo validado alimenta los indicadores.**

> Captura sugerida: lista de Validar.

**Filtros**

| Elemento | Qué hace |
|---|---|
| **Hoy** / **Ayer** / **Últimos 7 días** / **Fecha exacta** | Rango de fechas. Por defecto, **Ayer**. |
| **Solo pendientes (N)** | Casilla activada por defecto. Oculta lo ya validado. |
| **Buscar por supervisor, sabor, lote, línea o código…** | Filtra la lista. |

**Estructura**

Se agrupa por fecha y por turno. Cada turno muestra: «Supervisor · Turno N (· Grupo N) ÁREA» y un recuadro **Tanques del turno** con **Recibidos** y **Dejados**, para cruzar con el acta.

**Cada corrida muestra**

| Elemento | Qué muestra |
|---|---|
| **Sabor · Lote · presentación** | Identificación. |
| **Cód. turno · Línea** | Turno y línea. |
| Insignia **Pendiente** / **Confirmado** / **Editado** | Estado de la validación. |
| **Sin Producto Terminado — el turno cerró solo** | El turno se cerró automáticamente sin PT. Hay que cargar el valor real con **Editar**. |
| **Posible duplicado — …** | Otra corrida del turno tiene la misma línea, lote y presentación. |
| **Cajas**, **Contador**, **Consumido → producido**, **Merma envases**, **Merma semielaborado** | Valores del supervisor. Si se editó, el original aparece tachado y el corregido al lado. |
| **Validó** y **Nota** | Quién validó y su nota. |

**Botones**

| Botón | Qué hace |
|---|---|
| **Sí** | Confirma los valores del supervisor. |
| **Editar** | Abre el formulario de corrección. |

**Formulario de corrección**

«Deja en blanco lo que no cambie. Escribe un % de merma solo para pisar el cálculo.»

| Campo | Qué corrige |
|---|---|
| **Paletas**, **Cajas sueltas** | Producto Terminado. |
| **Contador (envases)** | Contador de la llenadora. |
| **Litros consumidos** | Consumo de semielaborado. |
| **Lote** | Número de lote. |
| **Merma envases %**, **Merma semi %** | Reemplazan el cálculo. Úsalos solo si hace falta forzar el valor. |
| **Nota** | Motivo de la corrección. |
| **Guardar corrección** / **Cancelar** | Guarda o cierra. |

### 9.2 Edición de Datos

Tarjeta del Hub: **Edición de Datos**. Catálogos generales de la planta. Los cambios se reflejan en toda la aplicación sin recargar.

> Captura sugerida: Edición de Datos, pestaña Sabores.

Tiene cinco pestañas: **Sabores**, **Personal**, **Presentaciones**, **Velocidades** y **Líneas**.

**Botones comunes a las pestañas**

| Ícono | Nombre | Qué hace |
|---|---|---|
| Lápiz | **Editar** | Abre la edición en la misma fila. |
| ✔ / ✖ | Guardar / Cancelar | Guarda o descarta el cambio. |
| Círculo tachado | **Desactivar** | Oculta el elemento sin borrarlo. Aparece tachado con la insignia **Inactivo**. |
| Flecha circular | **Reactivar** | Vuelve a activarlo. |

Los elementos inactivos no aparecen en las listas de las demás pantallas.

#### Pestaña Sabores

Una tarjeta por familia (Clásicos, Premium, Especiales, Selecto, Jucosa), con la cantidad de sabores.

| Elemento | Qué hace |
|---|---|
| Tabla **Sabor** / **Volumen** | El volumen son los litros de una unidad de preparación (un tambor o un kit). |
| **Agregar sabor** | Abre el formulario: **Nombre del sabor** y **Volumen (opcional)**, con **Agregar** y **Cancelar**. |

**Importante.** El volumen del sabor se usa para calcular el volumen de cada preparación (cantidad × volumen). Un valor incorrecto altera todas las mermas de semielaborado.

#### Pestaña Personal

Es el mismo panel del capítulo 8.1, pero con las personas de **todas las áreas**. El Área de Pruebas queda oculta salvo que la elijas en el filtro de área. Aquí también puedes crear administradores de área y otros super administradores.

#### Pestaña Presentaciones

Tabla con las columnas **Volumen**, **Cajas x Camada**, **Cant. Camada**, **Cajas x Paleta**, **Litros x Caja** y **Envases x Caja**.

| Elemento | Qué hace |
|---|---|
| **Editar** | Modifica los cinco valores de empaque (el volumen no se edita). |
| **Agregar presentación** | Formulario: **Volumen (ml)**, **Cajas x camada**, **Cant. camada**, **Cajas x paleta**, **Litros x caja**, **Envases x caja**. |

**Importante.** Estos valores convierten paletas y cajas en envases y litros. Alimentan la merma de envase, los litros producidos y la meta.

#### Pestaña Velocidades

Una tarjeta por línea, con la cantidad de velocidades tabuladas.

| Columna | Qué es |
|---|---|
| **Presentación** | Tamaño de envase. |
| **Máquina** | Tipo de llenadora. |
| **Envases/h** | Velocidad en envases por hora. |
| **Litros/h** | Velocidad en litros por hora. |

| Elemento | Qué hace |
|---|---|
| **Agregar velocidad** | Formulario: **Presentación**, **Máquina**, **Envases/h**, **Litros/h**. |

Estas velocidades son las opciones al **Arrancar línea**. También definen la meta y la eficiencia.

#### Pestaña Líneas

Tabla **Código** / **Nombre**. «El código no se puede cambiar; solo el nombre y si está activa.» Una línea inactiva deja de aparecer en **Líneas** y en el Panel.

### 9.3 Calculadoras

Tarjeta del Hub: **Calculadoras**. Agrupa tres herramientas de apoyo: **Calculadora de Bobina**, **Calculadora de Fórmula** y **Calculadora de Conteo por Peso**. Reemplazan cálculos que antes se hacían en una hoja de Excel.

#### Calculadora de Bobina

Envases restantes en una bobina de material de empaque.

| Campo o botón | Qué hace |
|---|---|
| **Tipo de envase** | Elige el tipo de bobina. |
| **Distancia medida (cm)** | Distancia del centro (core) al borde de la bobina. |
| **Envases restantes** | Resultado. |
| **Guardar** | Guarda el cálculo con tu usuario. |
| **Guardados hoy** | Lista de los cálculos de la jornada: tipo, distancia, usuario, hora y envases. |

**Fórmula**

```
Envases = 3,1416 × b × (b + diámetro del core) ÷ espesor ÷ largo del envase
```

`b` es la distancia medida. El redondeo depende del tipo: los tipos **TP** redondean hacia arriba y los **TB** al entero más cercano. Las medidas del core, el espesor y el largo del envase vienen del catálogo de cada tipo.

*Ejemplo con valores ficticios:* b = 14 cm, core = 15 cm, espesor = 0,03 cm, largo = 20 cm → 3,1416 × 14 × 29 ÷ 0,03 ÷ 20 = 2.125,8 → **2.126 envases**.

#### Calculadora de Fórmula

Insumos de materia prima a pedir para una cantidad de tambores o kits.

| Campo | Qué hace |
|---|---|
| **Familia** | Clásicos, Premium o Té. |
| **Sabor** | Lista de sabores de esa familia. |
| **Nº de tambores** o **Nº de kits** | Cantidad a preparar. La etiqueta cambia según el sabor. |
| **Insumos a pedir** | Cada insumo con su total y su unidad (kg o L). |

**Fórmula:** total de cada insumo = cantidad por unidad × cantidad de tambores o kits. Cada insumo se muestra por separado, no sumado.

#### Calculadora de Conteo por Peso

Pitillos o tapas restantes en una caja, según su peso.

| Campo | Qué hace |
|---|---|
| **Tipo** | Elige pitillos o tapas (con su peso de caja vacía y peso por unidad). |
| **Peso actual (kg)** | Peso de la caja con lo que le queda. |
| **Unidades restantes** | Resultado. |

**Fórmula**

```
Unidades = (peso actual − peso de la caja vacía) ÷ peso por unidad (g) × 1000
```

Los pitillos se redondean hacia abajo (criterio conservador) y las tapas hacia arriba.

### 9.4 Errores (acceso especial)

Tarjeta del Hub: **Errores**. Solo la ve quien tiene este permiso adicional. Es una herramienta de diagnóstico.

| Elemento | Qué muestra o hace |
|---|---|
| **Actualizar** | Recarga la lista. |
| **Cada error** | Función que falló, fecha, hora, persona, mensaje y datos de contexto. |

Sin errores: «Sin errores registrados».

---

## 10. Cálculos: mermas, rendimiento, meta y eficiencia

Este capítulo explica de dónde sale cada número. Todos los porcentajes se calculan con datos que cargan los supervisores. Un dato incompleto produce un número incompleto.

### 10.1 Conversiones básicas

Los valores por presentación (envases por caja, cajas por paleta y litros por caja) vienen del catálogo de **Presentaciones**.

| Dato | Fórmula |
|---|---|
| **Cajas de Producto Terminado** | Paletas × cajas por paleta + cajas sueltas |
| **Envases de Producto Terminado** | Cajas de Producto Terminado × envases por caja |
| **Litros de Producto Terminado** | Cajas de Producto Terminado × litros por caja |
| **Volumen de una preparación** | Tambores (o kits) × volumen del sabor + resto que había en el tanque + desvase sumado |

*Ejemplo de volumen:* 5 tambores de un sabor de 2.710 L por tambor = 13.550 L. Si el tanque tenía 1.200 L de resto, el lote nuevo queda en 14.750 L.

### 10.2 Merma de envase

Mide lo que se pierde **después de la llenadora**: paletizado, manipulación, etc. Compara lo que contó la llenadora con lo que terminó empacado.

```
Merma de envase (%) = (1 − envases de Producto Terminado ÷ envases de la llenadora) × 100
```

El resultado se redondea a 2 decimales.

**Qué entra en el cálculo**

- Solo las corridas que ya tienen **contador y Producto Terminado**. Una corrida con contador pero sin Producto Terminado no cuenta como pérdida total: queda fuera hasta que se cargue.
- Si no hay ninguna corrida comparable, se muestra «—».
- El **Contador 2** (envases buenos) no entra en esta fórmula. Se usa para corroborar (ver 10.3) y para calcular el **Δ envases**.

**Ejemplo**

Presentación de 1.000 ml: 12 envases por caja y 85 cajas por paleta.

- Contador de la llenadora: 20.400 envases.
- Producto Terminado: 19 paletas + 50 cajas sueltas.
- Cajas: 19 × 85 + 50 = **1.665**.
- Envases: 1.665 × 12 = **19.980**.
- Merma: (1 − 19.980 ÷ 20.400) × 100 = **2,06 %** (verde).
- Litros de Producto Terminado: 1.665 × 12 L = 19.980 L.

**Cómo se agrupa según la pantalla**

| Pantalla | Alcance | Cómo agrupa |
|---|---|---|
| **Producto Terminado** (recuadro) | Una corrida, con lo que llevas escrito | Vista previa antes de guardar. |
| **Panel** · columna **Merma** | Una línea, en el turno | Suma primero las corridas comparables y luego calcula el porcentaje. |
| **Panel** · tarjeta **Merma de envase** | Todo el turno | Igual: suma y luego calcula. |
| **Resumen de Planta**, **Por Grupo**, **Por Supervisor** | Un rango de fechas | Suma todo y luego calcula. Nunca promedia porcentajes. |
| **Auditoría** | Línea + lote + presentación | Suma; cuenta una sola vez las corridas idénticas duplicadas. |
| **Acta 2.1** | Una línea en el turno | **Promedio simple** de la merma de cada corrida. Marca ⚠ si supera 3 %. |
| **Validar** | Una corrida | Valor del supervisor y, si se editó, el corregido. |

**Ejemplo de la diferencia entre sumar y promediar**

Dos corridas de la misma línea. Corrida A: 20.400 envases de contador y 19.980 de Producto Terminado (2,06 %). Corrida B: 10.000 y 9.500 (5,00 %).

- Panel (suma): (1 − 29.480 ÷ 30.400) × 100 = **3,03 %**.
- Acta 2.1 (promedio): (2,06 + 5,00) ÷ 2 = **3,53 %**.

Por eso los dos números pueden no coincidir. El Panel pesa cada corrida por su volumen; el Acta no.

**Semáforo**

| Contexto | Verde | Ámbar | Rojo |
|---|---|---|---|
| **Panel**, **Resumen de Planta** | Hasta 3 % | Más de 3 % y hasta 5 % | Más de 5 % |
| **Producto Terminado** (al cargar) | Hasta 3 % | — | Más de 3 %: exige justificación |

**Qué hacer si sale alta o negativa**

- **Alta (más de 3 %).** Revisa que el contador corresponda a esa corrida y que hayas cargado todas las paletas y cajas. Mira el **Δ envases**. Escribe la justificación.
- **Negativa** (más Producto Terminado que envases contados). No es posible físicamente. Revisa el contador y el Producto Terminado por si hay un error o una carga duplicada.

### 10.3 Merma de semielaborado y Rendimiento

Mide lo que se pierde **antes de la llenadora**: el semielaborado que salió del tanque frente al que terminó como producto. Su complemento es el **Rendimiento**.

```
Consumo del turno = Σ lotes (volumen al inicio del turno − volumen al final del turno)
                    − litros que salieron del lote por transferencia o desvase
                    + litros que entraron por transferencia a un lote ya existente

Producido del turno = Σ litros de Producto Terminado de esos mismos lotes

Merma de semielaborado (%) = (1 − producido ÷ consumo) × 100
Rendimiento (%)            = 100 − merma = producido ÷ consumo × 100
```

La merma nunca se muestra por debajo de 0.

**De dónde salen los volúmenes**

| Dato | Origen |
|---|---|
| **Volumen al inicio del turno** | El que fija tu **Confirmar** (o **Editar**) en la revisión de inicio. Si el lote nació en tu turno, es su volumen preparado. |
| **Volumen al final del turno** | El que fija tu **Confirmar** (o **Editar**) en el estado final de tanques. Un turno cerrado conserva su valor congelado. |
| **Mediciones** | **Medir tanque** y **Fijar volumen real** corrigen el volumen con una lectura física. |

**Qué no es merma**

Las **transferencias** y los **desvases** se restan del consumo del lote que entrega. Lo que un lote ya existente absorbe por transferencia se le suma. Los ajustes hechos con **Ajustar** (agua o jugo) también suben el volumen de partida.

**Qué queda fuera del cálculo (litros sin contrastar)**

Para que el numerador y el denominador cubran siempre los mismos lotes, se excluye de ambos lados un lote cuando:

- no tiene volumen de inicio;
- su volumen final es igual o mayor al de inicio (por ejemplo, entró producto por transferencia o se midió al alza);
- su Producto Terminado supera en más de 5 % el volumen preparado, salvo que el **Contador 2** lo confirme con una diferencia de hasta 5 %;
- su Producto Terminado supera en más de 5 % el consumo del propio lote;
- el Producto Terminado no está asociado a ningún lote.

Cuando esto ocurre, el porcentaje es **parcial**. La **Auditoría** lo indica: «parcial (N L sin contrastar)».

**Por qué medir el tanque**

Si nadie mide, el volumen final es un derivado del Producto Terminado y el consumo resulta igual a lo producido. La merma sale cercana a 0 y **la pérdida real no se ve**. Aparece en el turno que mide, o cuando el lote se cierra vacío.

**Ejemplo**

Lote 0005, sabor Pera.

- Volumen al inicio del turno: 12.000 L. Volumen final medido: 3.500 L. Consumo: **8.500 L**.
- Producto Terminado del lote: 8.400 L.
- Merma: (1 − 8.400 ÷ 8.500) × 100 = **1,18 %** (ámbar). Rendimiento: **98,82 %**.

*Si nadie hubiera medido*, el volumen final sería 12.000 − 8.400 = 3.600 L, el consumo 8.400 L y la merma 0 %. Los 100 L faltantes no se verían.

*Con una transferencia:* si de ese lote salieron además 500 L a otro tanque, el consumo ajustado es 8.500 − 500 = 8.000 L. Con 7.900 L de Producto Terminado, la merma es (1 − 7.900 ÷ 8.000) × 100 = **1,25 %**.

**Semáforo**

Su tolerancia es más estricta que la de envase.

| Indicador | Verde | Ámbar | Rojo |
|---|---|---|---|
| **Merma de semielaborado** | Hasta 1,0 % | Más de 1,0 % y hasta 1,5 % | Más de 1,5 % |
| **Rendimiento** (tarjeta del Panel) | 99 % o más | De 98,5 % a menos de 99 % | Menos de 98,5 % |

**Dónde se ve**

| Pantalla | Qué muestra |
|---|---|
| **Panel** · tarjeta **Rendimiento** | Rendimiento del turno actual y del pasado. |
| **Panel** · **Desglose de cálculo** | Consumo, litros producidos, rendimiento y merma del turno. |
| **Auditoría** | «N consumidos → N producidos · merma de semielaborado X %». |
| **Validar** | **Consumido → producido** y **Merma semielaborado**. |
| **Acta 1.7** | Por lote: **% Rendimiento** = Producto Terminado ÷ (volumen de inicio − volumen final) × 100. No resta las transferencias. |

### 10.4 Meta y cumplimiento

Compara lo que **debía** producir cada línea activa según la velocidad elegida con lo que contó la llenadora.

```
Cajas esperadas (por línea) = (velocidad en envases/h ÷ envases por caja) × horas del turno
Cajas reales (por línea)    = envases del contador acumulado ÷ envases por caja
Cumplimiento (%)            = cajas reales ÷ cajas esperadas × 100
```

- Solo cuentan las **corridas activas** en ese momento. Las ya finalizadas no.
- El cumplimiento total suma las cajas reales y las esperadas de todas las líneas, y luego divide.
- **Horas del turno**: desde la hora de inicio hasta ahora (turno abierto) o hasta la hora de cierre (turno cerrado). Maneja el cruce de medianoche. El mínimo es 0,1 h.
- La meta **no descuenta paradas**: mide el resultado.

**Ejemplo**

Línea 2, 250 ml: 24 envases por caja, velocidad de 9.000 envases/h.

- Cajas por hora: 9.000 ÷ 24 = 375.
- Turno iniciado a las 7:00; son las 11:00 (4 h). Esperadas: 375 × 4 = **1.500**.
- Contador acumulado: 34.800 envases → 34.800 ÷ 24 = **1.450** reales.
- Cumplimiento: 1.450 ÷ 1.500 = **96,7 %** (verde).

**Semáforo**: verde con 90 % o más, ámbar con 60 % o más, rojo por debajo de 60 %.

### 10.5 Eficiencia de línea

```
Eficiencia (%) = velocidad elegida ÷ velocidad máxima disponible × 100
```

La velocidad máxima es la mayor de las opciones cargadas en **Velocidades** para esa línea y presentación.

- **Panel:** se calcula solo para la corrida activa. Mide qué tan cerca de la velocidad máxima se programó la línea, no lo producido.
- **Acta 2.1:** es el promedio de la eficiencia de todas las corridas de la línea en el turno, ponderado por los litros producidos.

*Ejemplo:* velocidad elegida de 7.500 envases/h y máxima de 9.000 → 7.500 ÷ 9.000 = **83 %** (ámbar).

**Semáforo**: verde con 90 % o más, ámbar con 60 % o más, rojo por debajo de 60 %.

### 10.6 Cómo cada acción afecta el volumen del tanque

El volumen que ves en un tanque es el volumen **vivo del lote**. Baja solo cuando cargas Producto Terminado. Cambia cuando mides, transfieres, desvasas o ajustas.

| Acción | Qué le pasa al volumen | ¿Cuenta como merma? |
|---|---|---|
| **Iniciar Preparación** | Define el volumen del lote (cantidad × volumen del sabor + resto del tanque). | No. |
| **Ajustar** (antes de liberar) | Suma litros al volumen actual y al preparado. | No. |
| **Cargar Producto Terminado** | Resta los litros producidos. | Es el «producido». |
| **Medir tanque** | Reemplaza el volumen actual por el medido. | Sí: la diferencia entre el teórico y el medido es pérdida. |
| **Fijar volumen real** | Reemplaza el volumen actual y el preparado. | No: corrige el 100 % del lote. Solo antes de que corra una línea. |
| **Transferir** | Mueve litros de un lote a otro. | No: se descuenta del consumo. |
| **Desvase** | Saca el resto y lo guarda. | No: se descuenta del consumo. |
| **Preparar encima de un tanque con producto** | El resto se suma al lote nuevo. | No. |

**Importante.** Nunca bajes el volumen a mano después de cargar el Producto Terminado. El sistema ya lo descontó. Hacerlo duplica el consumo.

### 10.7 Por qué un indicador puede diferir entre pantallas

- **Merma de envase por línea:** el Panel suma las corridas; el Acta 2.1 promedia sus porcentajes (ver 10.2).
- **Rendimiento por lote:** el Acta 1.7 no resta las transferencias; el Panel sí.
- **Auditoría** cuenta una sola vez las corridas idénticas duplicadas.
- **Validar** puede reemplazar valores del supervisor.
- **Resumen de Planta** abarca un rango de fechas y todos los turnos, incluidos los que siguen en curso.
- Un dato que se cargó después del cierre o que se corrigió cambia los números de la próxima consulta.

---

## 11. Reglas y bloqueos del sistema

### 11.1 Ventanas de tiempo

| Regla | Valor |
|---|---|
| **Cierre automático del turno** | 30 minutos después de la hora de fin del turno: 15:30 (Turno 1), 23:00 (Turno 2) y 7:30 (Turno 3). No aplica a 12x12. |
| **Relevo sin finalizar** | Al empezar un turno, el sistema cierra el turno anterior del área si seguía abierto. |
| **Gracia de Producto Terminado** | 15 minutos después de finalizar, solo para paletas y cajas sueltas. |
| **Candado del Producto Terminado** | 1 hora desde que se cargó. Después, el supervisor no puede cambiarlo. |
| **Refresco del Panel en vivo** | Cada 30 minutos. |
| **Aviso de versión nueva** | Se revisa cada 5 minutos. |

**Qué pasa en un cierre automático o relevo:** las corridas sin resolver se sellan **sin Producto Terminado**. Aparecen en **Validar** con la insignia «Sin Producto Terminado — el turno cerró solo» para cargar el valor real. El acta se genera sola la próxima vez que el supervisor abre el Hub.

### 11.2 Mensajes del sistema

Algunos mensajes nombran una pantalla llamada **Status**. Esa revisión ahora es la de inicio dentro de **Comenzar Turno** (ver 4.2.2).

**Al arrancar una línea o continuar al siguiente lote**

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| «El tanque N no está Listo (liberado) — no se puede tomar todavía.» | El tanque no está **Liberado**. | Libéralo en **Preparación**. |
| «Confirma el estado del Tanque N antes de activarlo…» | El lote viene de otro turno y no confirmaste su inicio. | Confírmalo en la revisión de inicio (4.2.2). |
| «Línea N ya corrió el Lote X este turno. Para corregir cantidades, edita el Producto Terminado de esa corrida.» | Evita duplicar producción. | Corrige el Producto Terminado existente. |
| «Línea N ya tiene una corrida en curso. Detén la línea y carga su Producto Terminado antes de activar otra.» | Hay una corrida activa. | **Detener línea** y carga su Producto Terminado. |
| «Hay una corrida detenida sobre el Lote X sin su Producto Terminado. Cárgalo antes de volver a activar.» | El lote tiene una corrida esperando cierre. | Carga su Producto Terminado. |
| «No hay ningún tanque Listo con el Lote X del mismo sabor. Elige el tanque manualmente.» | No se encontró el lote siguiente. | Elige el tanque en la lista. |
| «Hay más de un tanque Listo con el Lote X de ese sabor — elige el tanque manualmente.» | Hay dos candidatos. | Elige el tanque en la lista. |
| «El Lote X del tanque N ya lo está tomando otra corrida.» | Otra línea usa ese lote. | Elige otro tanque. |

**En Preparación**

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| «Ya hay un lote N de ese sabor abierto en otro tanque. Ciérralo primero o usa otro número.» | Lote duplicado. | Usa otro número o cierra el otro lote. |
| «Solo se puede medir un tanque Liberado con un lote activo (Listo o Con Restos).» | El tanque no tiene un lote medible. | Verifica el estado del tanque. |
| «No se puede: el Tanque N quedaría con ~N L y el máximo permitido es 30.000 L.» | La transferencia excede el máximo. | Baja primero el destino o elige otro. |
| «El volumen no puede pasar de 30.000 L (capacidad del tanque).» | Valor fuera de rango. | Revisa la medición. |

**En Producto Terminado y Contador**

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| «El Contador 2 (envases buenos) es obligatorio.» | Falta el Contador 2. | Cárgalo junto al contador. |
| «El Contador 2 … no puede ser negativo ni superar el contador de la llenadora.» | Valor inválido. | Corrígelo. |
| «Confirma el estado de esta línea antes de cargar el contador (o el Producto Terminado).» | La línea heredada no está confirmada. | Confírmala en la revisión de inicio (4.2.2). |
| «Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora…)» | Candado de 1 hora. | Pide la corrección al Super Administrador en **Validar**. |

**Al finalizar el turno**

| Mensaje | Qué hacer |
|---|---|
| «Hay una corrida detenida sin su Producto Terminado…» | Carga su Producto Terminado. |
| «Estas líneas siguen activas: …» | Carga su Producto Terminado y elige **Terminar** o **Entregar línea**. |
| «Hay tanques con producción de este turno sin confirmar su estado final…» | Confirma los tanques en **Estado final de tanques**. |
| «Hay líneas entregadas de este turno sin confirmar su estado final.» | Avisa al Super Administrador. Normalmente se confirma sola al entregar la línea. |

### 11.3 Quién corrige qué

| Qué se necesita corregir | Quién puede | Dónde |
|---|---|---|
| Estado o lote de un tanque mal registrado | Supervisor | **Editar** en **Preparación** |
| Litros de un tanque | Supervisor | **Medir tanque** o **Fijar volumen real** |
| Volumen de inicio o de fin del turno | Supervisor | **Confirmar** o **Editar** en la revisión de inicio y en **Estado final de tanques** |
| Producto Terminado, dentro de 1 hora | Supervisor | **Editar un error** |
| Producto Terminado después de 1 hora, o el contador | Super Administrador | **Validar** → **Editar** |
| Una novedad mal escrita | Nadie la edita | Agrega otra novedad que la aclare |
| Persona con datos incorrectos o clave olvidada | Administrador de Área | **Personal** |
| Sabor, presentación, velocidad o línea mal configurados | Super Administrador | **Edición de Datos** |
| Plan del día | Super Administrador | **Programación** |
| Turno cargado por error | Super Administrador | **Auditoría** → **Eliminar Turno** |

---

## 12. Módulo de Paradas (en desarrollo)

**Registrar Paradas** y **Panel de Paradas** están en construcción. Por ahora solo se muestran en el Área de Pruebas y trabajan con datos de ejemplo. No forman parte del uso normal de la planta.

Cuando estén habilitados, registrarán el tiempo perdido de cada línea con estas clases, según el diseño vigente:

| Clase | Quién la carga |
|---|---|
| **Programada** (cambio de lote, cambio de sabor, descanso legal, limpieza, etc.) | El supervisor, eligiendo el tipo del catálogo. |
| **No programada** (externas, operacionales, suministro, esterilización, preparación, codificación) | El supervisor, eligiendo el tipo del catálogo. |
| **No programada mecánica** (fallas de equipo) | Solo lectura. Llegará desde el registro de Mantenimiento. |
| **Tiempo ocioso** | El supervisor, con una nota. |

Cada tipo tendrá un **tiempo guía**. El sistema calculará la duración y el desvío contra el tiempo guía. Ese desvío alimentará la eficiencia. Este diseño puede cambiar antes de habilitarse el módulo. Este capítulo se ampliará entonces.

---

## 13. Preguntas frecuentes

**Olvidé mi clave.** Pide a tu Administrador de Área que la restablezca. Al ingresar deberás elegir una clave nueva de 4 dígitos.

**La tarjeta «Comenzar Turno» está bloqueada y dice que ya tengo un turno.** Ya hay un turno abierto a tu nombre. Continúa con **Preparación** o **Líneas**, o finalízalo en **Finalizar Turno**. Si no terminaste la revisión de inicio, ver 4.2.2.

**Un tanque no aparece al arrancar la línea.** Solo aparecen los tanques **Liberados**. Libéralo en **Preparación**.

**Apareció «Terminó el Lote» y el tanque todavía tiene producto.** Presiona **Seguir con el mismo lote**. Solo quita el aviso.

**Cerré una corrida y me equivoqué en las paletas o cajas.** Si pasó menos de 1 hora, usa **Editar un error**. Si pasó más, pídele la corrección al Super Administrador (**Validar**).

**Finalicé el turno y me faltó cargar Producto Terminado.** Tienes 15 minutos desde el cierre. Entra a **Producto Terminado y Contador** y carga las paletas y cajas.

**¿Por qué el Panel muestra 0 cajas si la línea está corriendo?** Las cajas y litros aparecen cuando se carga el Producto Terminado de la corrida, al cerrarla. Ver el capítulo 5.

**¿Por qué mi merma de semielaborado aparece como «sin dato» o «parcial»?** Falta contrastar algún lote: no tiene volumen de inicio, no se midió o su Producto Terminado no coincide con su volumen. Ver 10.3.

**Me equivoqué en una transferencia.** No existe un botón para deshacerla. Avisa a tu Administrador de Área. Para ajustar los litros usa **Medir tanque**.

**Olvidé finalizar el turno.** El sistema lo cierra solo 30 minutos después de la hora de fin del turno, o cuando el siguiente supervisor empieza el suyo. Tu acta aparecerá en **Mis Actas** la próxima vez que abras el Hub.

**Aparece una barra amarilla: «Tienes la app desactualizada».** Presiona **Actualizar ahora** antes de seguir cargando datos.

**Estoy en un equipo compartido.** Usa siempre **Cerrar sesión** (ícono de salida arriba a la derecha) al terminar.

---

## 14. Anexos

### Anexo A. Lista de verificación del turno

**Al empezar**

- [ ] Elegir **Turno** y **Grupo** y presionar **Empezar Turno**.
- [ ] En la revisión de inicio, **Confirmar** (o **Editar**) los 3 tanques.
- [ ] **Confirmar** (o **Corregir**) cada línea con corrida heredada.

**Durante el turno**

- [ ] Preparar el tanque (**Iniciar Preparación**), **Ajustar** si hace falta y **Liberar**.
- [ ] **Arrancar línea** con el tanque Liberado. Verificar presentación y velocidad.
- [ ] Registrar cada parada con **Parada Operacional** y su motivo.
- [ ] Anotar las **Novedades del turno** con su hora.
- [ ] **Medir tanque** cuando cambie el nivel real o al terminar un lote.

**Al cerrar cada corrida**

- [ ] Cargar **Envases llenadora** y **Envases buenos (Contador 2)**.
- [ ] Cargar **Paletas** y **Cajas sueltas**.
- [ ] Justificar la merma si supera 3 %.
- [ ] Elegir **Terminar** o **Entregar línea** y presionar **Cerrar**.
- [ ] **Medir el tanque** cuando el sistema lo pida.

**Al finalizar**

- [ ] Sin corridas activas ni detenidas sin Producto Terminado.
- [ ] **Confirmar** el estado final de los 3 tanques.
- [ ] Presionar **Finalizar Turno (genera el Acta)**.
- [ ] Abrir **Ver mi acta** para verificarla.
- [ ] **Cerrar sesión** si el equipo es compartido.

### Anexo B. Estados de tanque, línea y corrida

**Tanque**

| Insignia | Equivale en el formulario **Editar** a |
|---|---|
| **Liberado** | Listo (liberado) |
| **Con Restos N L** | Con restos (resto del lote) |
| **En Preparación No Liberado** | En Preparación (no liberado) |
| **Con Restos 0 L** | Sucio |
| **En CIP** | En CIP |
| **Limpio** | Limpio |

**Línea y corrida**

| Estado | Nivel | Significado |
|---|---|---|
| **Corriendo** | Corrida | Activa. |
| **Parada** (ámbar) | Corrida | En pausa, con motivo. |
| **Terminó el Lote** | Corrida | Su lote se cerró. Falta decidir cómo seguir. |
| **Esperando PT** | Corrida | Detenida, falta su Producto Terminado. |
| **Lista para arrancar** | Línea | Sin corrida, disponible. |
| **Parada** (rojo) | Línea | Detenida, sin corrida. |
| **Cambio de Presentación** | Línea | Cambio de formato en curso. |
| **Sin programación** | Línea | Sin plan de producción. |
| **En CIP** | Línea | Limpieza en curso. |

**Turno**

| Estado | Significado |
|---|---|
| **Abierto** | En curso. Aparece como **En Operación** en el Panel. |
| **Cerrado** | Finalizado por el supervisor o cerrado automáticamente. |

### Anexo C. Tolerancias (semáforos)

| Indicador | Verde | Ámbar | Rojo |
|---|---|---|---|
| **Merma de envase** | Hasta 3 % | Más de 3 % y hasta 5 % | Más de 5 % |
| **Merma de envase al cargar Producto Terminado** | Hasta 3 % | — | Más de 3 % (exige justificación) |
| **Merma de semielaborado** | Hasta 1,0 % | Más de 1,0 % y hasta 1,5 % | Más de 1,5 % |
| **Rendimiento** | 99 % o más | 98,5 % a menos de 99 % | Menos de 98,5 % |
| **Cumplimiento de meta** | 90 % o más | 60 % a 89 % | Menos de 60 % |
| **Eficiencia de línea** | 90 % o más | 60 % a 89 % | Menos de 60 % |

**Fin del manual.**
