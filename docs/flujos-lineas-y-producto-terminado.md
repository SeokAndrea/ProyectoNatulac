# Flujos: Líneas y Producto Terminado (cómo funciona hoy)

Los diagramas muestran lo que el código **hace hoy** (rama `main`, 2026-09-30),
no lo que debería hacer. El diseño nuevo está en `plan-lineas-pt-paradas.md`.

Se leyó el código de las pantallas y las reglas de la base de datos
(migraciones). Los problemas de la sección 5 son hallazgos por lectura:
hay que confirmarlos en planta.

## Cómo leer y editar los diagramas

- Cada caja `[Texto]` es un paso.
- Cada rombo `{¿Pregunta?}` es una decisión.
- Cada flecha `-->` indica qué pasa después. `-- texto -->` pone una etiqueta.
- Para cambiar un diagrama, edita el texto. GitHub y VS Code lo dibujan solos.

| Término | Qué significa | Cómo se guarda |
|---|---|---|
| Corrida | Una línea produciendo un lote | `turno_lineas` |
| Activa | La corrida está produciendo | `activa = true` |
| Esperando PT | Se detuvo, falta cargar su Producto Terminado | `activa = false` y `finalizada_en` vacío |
| Cerrada | Terminó del todo | `finalizada_en` con fecha |
| Entregada | Sigue corriendo para el próximo turno | `entregada_en` con fecha |

---

## 1. Estados de una corrida

```mermaid
stateDiagram-v2
    [*] --> Activa: Arrancar línea
    Activa --> Pausada: Parada Operacional
    Pausada --> Activa: Continuar
    Pausada --> EsperandoPT: Detener línea
    Activa --> LoteTerminado: Se agota el lote (aviso)
    LoteTerminado --> Activa: Seguir con el mismo lote
    LoteTerminado --> EsperandoPT: Continuar al siguiente lote (la vieja queda esperando)
    LoteTerminado --> EsperandoPT: Detener línea
    Activa --> EsperandoPT: Terminar (pantalla Producto Terminado)
    Activa --> Entregada: Entregar línea
    Activa --> Entregada: El sistema la entrega solo al abrir el turno siguiente
    EsperandoPT --> Cerrada: Se registra Contador o Producto Terminado
    Cerrada --> [*]
```

Al abrir un turno, el sistema **copia** las corridas activas del turno
anterior al turno nuevo, sin confirmar.

---

## 2. Pantalla Líneas: qué botón aparece en cada estado

```mermaid
flowchart TD
    A[Tarjeta de una línea] --> B{¿Hay corrida activa?}
    B -- No --> C{¿Hay corrida Esperando PT?}
    C -- Sí --> C1["Mensaje: carga su Producto Terminado<br/>Botón: Arrancar otra línea"]
    C -- No --> C2["Arrancar línea,<br/>Sin programación, Cambio de Presentación, Iniciar CIP"]
    B -- Sí --> D{¿Sin confirmar y pantalla Status?}
    D -- Sí --> D1["Confirmar o Corregir"]
    D -- No --> E{¿Se avisó que terminó el lote?}
    E -- Sí --> E1["Seguir con el mismo lote<br/>Continuar al siguiente lote<br/>Detener línea"]
    E -- No --> F{¿Está pausada?}
    F -- Sí --> F1["Continuar<br/>Detener línea"]
    F -- No --> F2["Parada Operacional (pide motivo)"]
```

- Con una corrida activa o Esperando PT, **no** se puede poner la línea en CIP,
  Sin programación ni Cambio de Presentación.
- El CIP de línea **no guarda motivo**. Solo la condición "Parada" guarda texto.

---

## 3. Arrancar una línea (reglas de la base de datos)

```mermaid
flowchart TD
    A[Arrancar línea: tanque, presentación, velocidad] --> B{¿El tanque está Listo?}
    B -- No --> X1[Error: el tanque no está Listo]
    B -- Sí --> B2{"¿Lote heredado sin confirmar el tanque?"}
    B2 -- Sí --> X0[Error: confirma el tanque en Status]
    B2 -- No --> B3{"¿Esta línea ya corrió este lote en el turno?"}
    B3 -- Sí --> X4[Error: ya corrió el lote]
    B3 -- No --> C{"¿La línea tiene corrida activa<br/>y NO viene de Status?"}
    C -- Sí --> X2[Error: detén la línea y carga su PT]
    C -- No --> D{"¿El lote tiene una corrida Esperando PT?"}
    D -- Sí --> X3[Error: carga ese PT antes]
    D -- No --> E["Si viene de Status: cierra la corrida heredada<br/>(queda cerrada sin PT, pero sigue contando en el turno)"]
    E --> F[Crea la corrida nueva]
```

---

## 4. Pantalla Producto Terminado: botón "Cerrar" / "Registrar"

Cada paso es una llamada **separada** a la base de datos.

```mermaid
sequenceDiagram
    actor S as Supervisor
    participant P as Pantalla PT
    participant BD as Base de datos

    S->>P: Elige Terminar o Entregar, escribe Contador y PT
    opt Eligió Terminar
        P->>BD: terminar_sabor_linea (queda Esperando PT)
    end
    opt Escribió Contador
        P->>BD: registrar_contador
        BD->>BD: la corrida queda CERRADA
    end
    opt Escribió Paletas o Cajas
        P->>BD: registrar_producto_terminado
        BD->>BD: baja el volumen del lote, revisa si se cierra el tanque
    end
    opt Eligió Entregar
        P->>BD: entregar_corrida
    end
    P->>S: Pide medir el tanque
```

Reglas de la base de datos:

- Contador 2 (envases buenos) es obligatorio y no puede superar al Contador 1.
- El PT solo se edita durante 1 hora. Después se corrige en Validar.
- Cargar Contador o PT confirma la línea si estaba sin confirmar.
- No se puede finalizar el turno con una corrida Esperando PT, ni con una
  activa sin entregar.

---

## 5. Problemas encontrados

| # | Problema | Dónde |
|---|---|---|
| 1 | "Terminar" con solo el Contador cierra la corrida **sin PT**, y Finalizar Turno no lo detecta | `ProductoTerminado.tsx` (`valido`, `guardar`), `registrar_contador` |
| 2 | Si el Contador guarda y el PT falla, al reintentar el Contador **se suma dos veces** | `ProductoTerminado.tsx`, `guardar()` |
| 3 | Los errores de PT, pausar, continuar, terminar, confirmar y detener dicen "Intenta de nuevo" y ocultan la causa real | `src/lib/productoTerminado.ts`, `src/lib/produccion/nucleo.ts`, `ajustes.ts` |
| 4 | El aviso "Medir tanque" probablemente no se ve: la tarjeta pasa a "cerradas" y se desmonta | `ProductoTerminado.tsx` (`medicionTanque`) |
| 5 | Dos textos mandan a "Preparación" cuando ahora es "Líneas" | `ProductoTerminado.tsx` líneas 217 y 842 |
| 6 | Una línea Esperando PT bloquea a otras líneas que quieran tomar ese mismo lote | `activar_linea` (puede ser intencional) |
| 7 | Tras "Continuar al siguiente lote", la tarjeta de Líneas no muestra la corrida vieja Esperando PT | `LineasEstadoPlanta.tsx` (`corridaEsperandoPt`) |
| 8 | Corregir una línea heredada en Status la deja cerrada en el turno nuevo: cuenta para la eficiencia aunque no produjo | `activar_linea` (camino de Status), `src/lib/eficiencia.ts` |
