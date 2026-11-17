# Plan: ticket de paleta impreso por el sistema, con QR (2026-11-17)

Pedido de Alexander. Es una **prueba**: va detrás de un interruptor en Robot Tavil; apagado, todo sigue
como hoy (el operador escribe el ticket del papel).

## Estado: HECHO (2026-11-17) en la rama `tickets-paletas`, sin unir a main ni subir

Sale de `Adenpior_V2.0` (incluye «Clásico» y «Bebida té negro»). Migración
`20261116590000_tickets_paletas.sql`; ensayo `scripts/ensayo-tickets-paletas.sql`.

- **Base:** `robot_tavil_config` (interruptor por área + copias 1–4), permiso `ROBOT_TAVIL_TICKETS`,
  secuencia `P-000001…`, `sabores.vida_util_meses` (cargada de la tabla de la sección 4d),
  `robot_tavil_paletas.vence / ticket_sistema / impresiones`, `robot_tavil_registrar_impresion()`
  (la reimpresión va a Auditoría), `trazabilidad_paletizado_buscar()`. Sumar, corregir y «−» devuelven la
  paleta (`creada` / `editada` / `anulada`).
- **App:** tarjeta «Tickets por sistema · Prueba» con doble confirmación; el «+» sin ticket y «Crear e
  imprimir ticket»; etiqueta `EtiquetaPaleta` (qrcode.react 4.2.0) impresa por el navegador
  (`src/lib/imprimirEtiqueta.tsx`, `@page 100mm 150mm`, una página por copia); «Reimprimir» en el aviso y al
  corregir; «−» avisa retirar el ticket; buscador por ticket en Trazabilidad (pegar el texto del QR); aviso
  de ticket desactualizado al corregir la conformidad; «Vida útil (meses)» en Edición de Datos → Sabores.
- **Verificado:** ensayo SQL en PGlite (y los demás ensayos igual que antes), `tsc`, pruebas de Vitest,
  y recorrido en el navegador con la API simulada (sin tocar la base): el documento impreso tiene 2 páginas
  de 100 × 150 mm con 2 copias. Fotos en [app/](app/).
- **Falta:** probar con la impresora real cuando se compre (driver de Windows; Chrome con
  `--kiosk-printing` para que no salga el cuadro de impresión) y cargar en Edición de Datos la vida útil
  de los sabores que no encajaron por nombre.

Maquetas del plan (antes de programar), hechas sobre la app real con datos simulados:

| Imagen | Qué muestra |
|---|---|
| [1-hoy.png](1-hoy.png) | Robot Tavil como está hoy |
| [2-interruptor.png](2-interruptor.png) | Interruptor «Tickets por sistema · Prueba» y estado de la impresora |
| [3-cuadro-mas.png](3-cuadro-mas.png) | Cuadro del «+» sin campo de ticket: solo C/NC y «Crear e imprimir ticket» |
| [4-impreso.png](4-impreso.png) | Paleta creada, ticket enviado, botón «Reimprimir» |
| [5-ticket-conforme.png](5-ticket-conforme.png) · [5-ticket-no-conforme.png](5-ticket-no-conforme.png) | Ticket 100 × 150 mm aprobado, Conforme y No conforme |
| [6-lector.png](6-lector.png) | «Buscar paleta» con lector de mano o cámara, y el resultado |

---

## 0. Cambios pedidos por Alexander (2026-11-17)

- Letra más grande en los datos. El diseño final sale del editor en línea
  (https://claude.ai/artifact/Vk8A7U59ZXEZBZLXWuHEUC), que guarda en `ticket/diseno`.
- Presentación: «TBA-1000 cm3 · Automático» (sin los ml).
- Nº de paleta: solo el número, 4 dígitos con ceros a la izquierda (`0012`), sin el código del sabor.
- **Fecha de vencimiento** = fecha de producción + vida útil del sabor. Columna nueva
  `sabores.vida_util_dias` (entero > 0), editable en Edición de datos → Sabores. Si un sabor no la tiene,
  el ticket no se puede imprimir hasta cargarla (a confirmar).
- En la línea del sabor va el **código de paletizado** delante, «MZ · Manzana», en vez de la familia.
- Familia «Clásicos» → «Clásico»: **hecho** en la rama Adenpior_V2.0 (migración
  `20261116390000_familia_clasico.sql`, commit 6faca41).

## 1. Flujo con el interruptor encendido

1. Sale la paleta del robot. El operador toca **+** en su línea.
2. El cuadro ya no pide el Nº de ticket. Muestra el Nº de paleta, sabor, presentación, lote y turno,
   y el operador marca **Conforme / No conforme** (con observación 1–7 si es NC, como hoy).
3. **Crear e imprimir ticket**: el servidor crea la paleta y le asigna el ticket (ej. `P-000124`); la app
   imprime la etiqueta.
4. Aviso verde «Paleta Nº 12 creada · Ticket P-000124 enviado a la impresora» con **Reimprimir**.
5. El operador pega la etiqueta en la paleta. En Trazabilidad, la columna 1.3.4 «Nº ticket» sale sola.

Apagado: el flujo de hoy (escribe el ticket del papel, con el aviso de ticket repetido).

## 2. El ticket

**Código del ticket:** `P-` + 6 dígitos de una secuencia de la base (`P-000124`). Es único, corto y fácil
de dictar. Va en la misma columna `ticket` de hoy: la hoja 1-PR-F-040 y su PDF no cambian.

**Diseño aprobado por Alexander (2026-11-17)**, armado en el editor en línea
(https://claude.ai/artifact/Vk8A7U59ZXEZBZLXWuHEUC, documento `ticket/diseno`). Etiqueta térmica
100 × 150 mm, blanco y negro, margen 4 mm, 1 mm entre bloques, rótulos a 9 pt.
Ver [5-ticket-conforme.png](5-ticket-conforme.png) y [5-ticket-no-conforme.png](5-ticket-no-conforme.png).

| Orden | Bloque | Ejemplo | Tamaño |
|---|---|---|---|
| 1 | Encabezado | «NATULAC» · «PALETA · PRODUCTO TERMINADO» | 13 pt, negrita |
| 2 | Nº de paleta (media columna) | «Nº DE PALETA» `0012` (4 dígitos, ceros a la izquierda, sin código de sabor) | 48 pt, negrita, monoespaciada |
| 2 | QR (al lado del número) | ver abajo | 30 × 30 mm |
| 3 | Código y sabor | «MZ · Manzana» (código de paletizado `sabores.codigo` + nombre; **sin la familia**) | 24 pt, negrita |
| 4 | Presentación y tipo | «TBA-1000 cm3 · Automático» (sin los ml) | 15 pt |
| 5 | Cajas · Lote (recuadros) | 120 · 2411 | 22 pt, negrita |
| 6 | Línea · Turno (recuadros) | 1 · 1 | 20 pt, negrita |
| 7 | Producción · Vence (recuadros) | 17/11/2026 · 14/08/2027 (sin la hora) | 15 pt, negrita |
| 8 | Conformidad (recuadro) | CONFORME / NO CONFORME en franja negra | 18 pt, negrita |
| 9 | Observación y acción (solo NC) | «Observación: …» / «Acción: …» | 10,5 pt |
| 10 | Pie | «Ticket P-000124» · «Operador: J. Pérez» | 11 pt |

Ocupa 128 mm (Conforme) y 143 mm (No conforme) de los 150 mm.

**Qué lleva el QR** (texto corto, versión 1):
```
NTLPT1;T=P-000124;L=1;F=2026-11-17;V=2027-08-14;S=MZ;P=1000;N=0012;CJ=120;LT=2411;TU=1;C=C
```
(`V=` vencimiento; `S=` código de paletizado del sabor.)
- La app busca por `T=` y muestra los datos **vivos** de la base (si la paleta se corrigió después, se ve).
- Los demás campos permiten leer lo básico con cualquier lector, sin la app.
- `NTLPT1` marca el formato, por si cambia más adelante.

## 3. Cómo imprimir (decisión según la impresora)

| | A. Desde el navegador (recomendado para la prueba) | B. Servicio de impresión en planta |
|---|---|---|
| Cómo | La app arma la etiqueta y usa la impresión de Windows (driver de la impresora). | Un servicio en la red, como `plc-bridge`, toma los trabajos de una cola en la base y los manda directo a la impresora (IP:9100, ZPL o ESC/POS). |
| Sin cuadro de impresión | Chrome del PC del robot abierto con `--kiosk-printing` (imprime directo en la predeterminada). | Siempre directo. |
| Desde teléfono o tableta | No imprime directo. | Sí, desde cualquier equipo. |
| Infraestructura | Ninguna nueva. | Impresora con red + servicio nuevo. |
| Reimprimir / cola | Desde la app. | Cola con estado («impreso», «falló»). |

Propuesta: **A para la prueba** (rápido, cualquier impresora con driver de Windows). Si la prueba sirve y la
impresora tiene red, pasar a **B** para producción.

## 4. Lector de QR

**Ojo:** la cámara del navegador solo funciona si la app abre con **https://**. Hoy abre con
`http://192.168.10.143:4035`, así que en teléfonos y tabletas la cámara **no** va a funcionar.

- **Recomendado: lector de mano USB o Bluetooth** (modo teclado). «Escribe» el texto del QR en el campo
  que tiene el foco y aprieta Enter: funciona con http, no necesita librería, es rápido y aguanta la
  planta. Se compra aparte (verificar que lea QR, no solo código de barras 1D).
- **Cámara:** queda preparada en la pantalla, pero se habilita solo cuando la app tenga HTTPS (certificado
  interno instalado en los equipos). Es un trabajo aparte en el servidor.
- Pantalla «Buscar paleta» ([6-lector.png](6-lector.png)): escanear → datos vivos de la paleta →
  «Reimprimir» y «Ver en Trazabilidad». Si la paleta cambió después de imprimir, avisa que el ticket
  pegado quedó desactualizado.

## 5. Librerías (revisadas en GitHub y npm el 2026-11-17)

**Generar el QR (para el ticket):**

| Librería | Licencia | Dependencias | Última versión | Descargas/semana | Nota |
|---|---|---|---|---|---|
| **qrcode.react 4.2.0** ✅ | ISC | 0 | dic 2024 | 14,7 M | Componente React que dibuja SVG. Por dentro usa el generador de Nayuki (repo de referencia, 6,8 k ★, activo oct 2026). |
| qrcode (soldair) 1.5.4 | MIT | 3 (pngjs, yargs…) | ago 2024 | 42 M | Bueno, pero trae dependencias de línea de comandos que no hacen falta. |
| qr-code-styling | MIT | — | feb 2026 | — | Para QR decorados; no hace falta. |

**Leer el QR con cámara** (solo cuando haya HTTPS; con lector de mano no se necesita ninguna):

| Librería | Licencia | Dependencias | Última versión | Nota |
|---|---|---|---|---|
| **barcode-detector 3.2.4** ✅ | MIT | 1 (zxing-wasm, mismo autor) | nov 2026 | Mantenida (repos activos nov 2026, 1–3 issues abiertos). Usa el lector nativo del navegador si existe. **Hay que servir su archivo .wasm desde nuestro servidor** (por defecto lo baja de un CDN de internet). |
| jsQR 1.4.0 | Apache-2.0 | 0 | abr 2021 | Muy simple, todo JavaScript, sin internet. Sin versiones nuevas desde 2021: plan B. |
| html5-qrcode 2.3.8 | Apache-2.0 | 0 | abr 2023 | Descartada: sin versión nueva desde 2023, 453 issues abiertos. |
| qr-scanner (nimiq) 1.4.2 | MIT | 1 | nov 2022 | Descartada: sin versión nueva desde 2022. |
| @zxing/library 0.23.0 | Apache-2.0 | 1 | abr 2026 | En modo mantenimiento; barcode-detector usa el sucesor (zxing-cpp en WASM). |

**Cuidados de seguridad al instalarlas:**
- Versión exacta (sin `^`) y `package-lock.json` en git; instalar con `npm ci`.
- Nada se carga de internet en la planta: el `.wasm` y todo lo demás se sirve desde nuestro servidor.
- `npm audit` antes de subir. Al actualizar, revisar el cambio y no instalar versiones publicadas hace
  menos de dos semanas.
- El QR solo trae un código: la app nunca ejecuta ni abre lo que lee, solo busca `T=` en la base.

## 6. Base de datos (una migración)

- **Interruptor:** `robot_tavil_config` (por área) con `tickets_sistema boolean default false`. Cambiarlo
  pide doble confirmación y queda en Auditoría.
- **Secuencia** `robot_tavil_ticket_seq` para `P-000001`, `P-000002`…
- `robot_tavil_paletas`: `ticket_sistema boolean`, `impresiones integer default 0`, `impresa_en`, `impresa_por`.
- `robot_tavil_sumar()`: con el interruptor encendido ignora `p_ticket` y pone el de la secuencia.
  Apagado, igual que hoy.
- `robot_tavil_paleta_por_ticket(p_usuario, p_ticket)`: para el lector (datos vivos).
- `robot_tavil_registrar_impresion(p_usuario, p_paleta_id)`: suma impresiones y deja «Reimprimió el
  ticket P-000124» en Auditoría.
- Opción B: tabla `robot_tavil_impresiones` (cola: pendiente / impreso / falló).
- Al final, `select * from asegurar_control_usuario();` y la marca en `revisar-migraciones-pendientes.sql`.

## 7. Pantallas

- **Robot Tavil:** interruptor arriba de las líneas, estado de la impresora, texto de ayuda nuevo.
  Cuadro del «+» sin ticket y con «Crear e imprimir ticket». Aviso de impresión con «Reimprimir». En
  «Paletas de hoy», cada paleta con ticket del sistema tiene un botón para reimprimir.
- **Trazabilidad del paletizado:** reimprimir desde la fila. Si se corrige la conformidad de una paleta
  ya impresa: «El ticket pegado dice Conforme. ¿Reimprimir?».
- **Buscar paleta (lector):** dentro de Trazabilidad y con un atajo en Robot Tavil (falta decidir quién la usa).
- **Etiqueta:** componente propio con `qrcode.react` y una hoja de estilo de impresión de 100 × 150 mm.

## 8. Casos que hay que cubrir

- **«−» con ticket impreso:** la paleta se anula y se avisa «Retira y bota el ticket P-000124». El código
  no se reusa.
- **La impresora falla o no responde:** la paleta **sí** queda creada. Aviso rojo «No se imprimió» con
  «Reimprimir».
- **Se apaga el interruptor a mitad del día:** las paletas ya hechas conservan su ticket; las nuevas
  vuelven a pedir el ticket a mano.
- **Paleta manual:** sale igual, con «Manual» en la etiqueta.
- **Dos operadores a la vez:** la secuencia evita códigos repetidos.

## 9. Fases

1. **Prueba (opción A):** migración + interruptor + ticket en el «+» + etiqueta con QR + reimprimir.
   Pruebas: ensayo SQL en la base local, pruebas de pantalla, foto de la etiqueta; prueba en planta con la
   impresora real en el Área de Pruebas.
2. **Lector:** «Buscar paleta» con lector de mano (sin librería).
3. **Cámara:** cuando haya HTTPS, con `barcode-detector` y el `.wasm` servido localmente.
4. **Producción (opción B):** servicio de impresión y cola, si la impresora tiene red.

## 10. Decisiones (Alexander, 2026-11-17)

1. **Impresora:** todavía no se compra. Se avanza con la impresión por el navegador (opción A) y una
   hoja de 100 × 150 mm; se prueba con «Microsoft Print to PDF». Cuando llegue, solo se instala su
   driver. Para la compra: térmica de etiquetas de 100 × 150 mm (4 × 6"), 203 ppp como mínimo (300 mejor
   para el QR), driver de Windows y, si se quiere imprimir desde cualquier equipo más adelante, red (Ethernet).
2. **Interruptor:** uno general para Robot Tavil. Lo cambia quien tenga un **permiso nuevo**
   (propuesto: `ROBOT_TAVIL_TICKETS`, «Activar los tickets por sistema»).
3. **Código del ticket:** `P-000124`. ✔
4. **Copias:** 1 por paleta por defecto; se puede cambiar (campo «Copias por paleta» junto al interruptor,
   con el mismo permiso). Reimprimir saca 1.
5. **Lector:** con el teléfono, **opción C** por ahora (copiar el texto del QR y pegarlo en el buscador de
   Trazabilidad). La versión final será la **opción B**: anotada en [docs/mejoras-futuras.md](../mejoras-futuras.md).
   El QR sigue llevando el texto con los datos (no un enlace).
6. **Vida útil sin cargar:** **opción b**, se imprime con «VENCE: —». El vencimiento se guarda en la paleta
   al crearla. La vida útil depende del sabor (y de la familia, porque el mismo sabor se repite en varias),
   no de la presentación: va en `sabores`. Valores en la sección 4d.
7. **Contenido de la etiqueta:** aprobado (sección 2).

## 4b. Leer el QR con el teléfono (sin lector de mano y sin HTTPS)

| | Cómo funciona | Necesita |
|---|---|---|
| **A. El QR es un enlace** (recomendada) | El QR lleva `http://192.168.10.143:4035/trazabilidad-paletizado?ticket=P-000124`. Se apunta la cámara normal del teléfono, se toca «Abrir» y la app abre Trazabilidad con esa paleta. | El teléfono en el wifi de la planta y con la sesión abierta en su navegador. Sin librería ni HTTPS. Si cambia la dirección del servidor, las etiquetas viejas dejan de abrir (los datos impresos siguen legibles). |
| **B. Foto desde la app** | En Trazabilidad, «Escanear ticket» abre la cámara para tomar una foto (eso sí funciona con http) y la app lee el QR de la foto. | Una librería para leer QR de una imagen (`jsQR` o `barcode-detector`), sin internet. |
| **C. Copiar y pegar** | La cámara del teléfono (o Google Lens) muestra el texto del QR; se copia y se pega en el buscador de Trazabilidad, que toma el ticket del texto. También se puede escribir `P-000124` a mano. | Nada nuevo, solo el buscador. |

Propuesta: **A + C** (el buscador sirve siempre, también para escribir el código a mano). B queda como extra.

## 4c. Vida útil sin cargar

El vencimiento no se escribe: se calcula como fecha de producción + `sabores.vida_util_dias`. El caso
pendiente es el sabor cuya vida útil todavía está **vacía** (al crear la columna, todos arrancan vacíos):
- a) no imprimir y avisar «Falta la vida útil de Manzana en Edición de datos» (propuesta);
- b) imprimir con «VENCE: —»;
- c) un valor por defecto.

Además: el vencimiento se **guarda en la paleta** al crearla, para que una reimpresión salga igual que la
etiqueta pegada aunque después cambien la vida útil.

**Decidido:** opción b («VENCE: —»). Depende del sabor y su familia, igual para todas las presentaciones.

## 4d. Vida útil por sabor (tabla de Alexander, 2026-11-17)

Igual para TPA-200, TPA-250, TPA-330, TBA-500 y TBA-1000 cm3.

| Familia | Sabor | Vida útil |
|---|---|---|
| Clásico | Coctel | 10 meses |
| Clásico | Durazno | 12 meses |
| Clásico | Mango | 12 meses |
| Clásico | Manzana | 12 meses |
| Clásico | Naranjada | 8 meses |
| Clásico | Pera | 12 meses |
| Bebida té negro (hoy «Especiales») | Té de durazno | 12 meses |
| Bebida té negro (hoy «Especiales») | Té de limón | 12 meses |
| Jucosa | Durazno | 12 meses |
| Jucosa | Manzana | 12 meses |
| Jucosa | Naranja | 7 meses |
| Jucosa | Pera | 12 meses |
| Premium | Agua de coco | 10 meses |
| Premium | Manzana clarificado | 12 meses |
| Premium | Naranja 100% | 7 meses |
| Selecto | Durazno | 12 meses |
| Selecto | Mango | 12 meses |
| Selecto | Manzana | 12 meses |
| Selecto | Pera | 12 meses |

La migración carga estos valores buscando cada sabor por familia y nombre (sin tildes ni mayúsculas). Los
sabores que no encuentre quedan vacíos y se completan en Edición de datos.

**Pendiente:** la tabla viene en **meses** y el pedido original decía **días**. 12 meses no son 360 ni 365
días exactos: con meses, 17/11/2026 + 12 meses = 17/11/2027; con 360 días daría 12/11/2027.

**Familia «Especiales» → «Bebida té negro»:** misma situación que «Clásico». El nombre «Especiales» se
compara al pie de la letra en `sabor_display()` (va sin sufijo), `sabores.ts`, `turno.ts`, `colores.ts`
(color de Especiales y nombre «Té» en Indicadores) y `VistaSemielaborado.tsx`, y es clave de los meses
cargados en Indicadores. Va en una migración como la 20261116390000.
