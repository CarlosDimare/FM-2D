# Plan de Evolución: Encabezado Único, Realismo del Simulador 2D y Charla con IA Integrada

Este plan resuelve el doble encabezado al explorar clubes desde las tablas, eleva la variedad táctica y visual del motor de partidos 2D (centros, cabezazos, tiros libres, córners y remates desde fuera del área) y transforma la charla con jugadores en una conversación real impulsada por un modelo de IA integrado con impacto directo en la moral, la confianza y las promesas del plantel.

## Revisión del Usuario y Decisiones Clave

> [!IMPORTANT]
> Todas las decisiones de alcance, interacción y prioridades fueron confirmadas en la entrevista previa y rigen el diseño completo de este plan.

- **Alcance de implementación tras aprobar el plan**: Ejecución completa en tres frentes — corrección del encabezado duplicado en vista de club externo, salto de realismo en el motor y visor 2D, y evolución de la charla con jugadores a chat con IA integrada.
- **Modo de interacción en la charla con IA**: Modalidad híbrida con **campo de texto libre** para escribir cualquier indicación y **respuestas rápidas sugeridas** contextuales generadas según el momento de la charla.
- **Impacto real en la partida**: Conversaciones realistas que modifican de forma tangible la **moral**, la **tensión con el DT**, la **confianza** y registran **promesas concretas** (minutos, titularidad, renovación, rol o futuro) evaluables en el progreso de la carrera.
- **Prioridades de realismo en el simulador 2D**: Énfasis en **centros y cabezazos**, **tiros libres directos e indirectos con barrera**, **rutinas variadas de córner** y **remates lejanos desde fuera del área**, junto con su representación visual en cancha y clasificación en crónicas/reportes.
- **Infraestructura del modelo de IA (Valor por defecto recomendado)**: Para mantener protegida la clave de API sin pedir configuraciones al jugador, la app incorporará un proxy liviano del lado del servidor en el mismo puerto 3000 usando el modelo **Gemini 4 Hydrogen** (`gemini-4-hydrogen`) con salida JSON estructurada, mostrando un aviso claro con reintento si ocurre un fallo de red o cuota (sin respuestas falsas simuladas).

---

## 1. Visión General y Concepto Central

- **Qué resuelve**:
  1. Elimina la redundancia visual al abrir cualquier club ajeno desde clasificaciones o estadísticas, dejando un único encabezado broadcast coherente con el resto del juego.
  2. Rompe la monotonía de jugadas y goles en el simulador 2D añadiendo física diferenciada de juego aéreo, disparos de media distancia, barreras reales en faltas peligrosas y variantes tácticas de balón parado.
  3. Convierte las charlas estáticas de tres botones en diálogos vivos donde cada futbolista responde acorde a su personalidad, edad, rendimiento reciente, situación contractual y relación previa con el entrenador.
- **Público objetivo**: Jugadores de fútbol mánager en móvil y escritorio que buscan profundidad táctica observable en el campo 2D y una gestión humana de vestuario creíble en carreras largas.
- **Valor principal**: Mayor fidelidad visual y táctica en cada minuto de partido y un vestuario con memoria real, donde saber qué decir y qué prometer importa tanto como el esquema táctico.

---

## 2. Experiencia de Usuario y Diseño Visual

### Flujos Principales del Usuario

1. **Exploración de Clubes desde Tablas y Estadísticas (Encabezado Único)**
   - Al tocar un club en cualquier tabla de posiciones o ficha estadística, se abre su plantilla bajo **una sola cabecera broadcast superior** con los colores, escudo y estadio de ese club.
   - El botón **Volver** y el indicador de fecha conviven ordenadamente en el extremo derecho del encabezado único, dejando todo el alto restante para las pestañas (`Primera / Reserva / Sub 20`), buscador y listado de jugadores.

2. **Simulador 2D: Jugadas Aéreas, Balón Parado y Remates Lejanos**
   - **Centros y cabezazos**: Los extremos y carrileros buscan más variedad de envíos (centro tenso al primer palo, globo pasado al segundo palo, pase atrás raso o centro anticipado). Al llegar por aire a la zona de remate, el atacante ejecuta un gesto de salto y golpeo de cabeza diferenciado, con separación visual balón-sombra, halo de salto en 2D y trayectoria de pique al suelo o bombeo por encima del arquero.
   - **Tiros libres con barrera**: En faltas entre 17 y 30 metros, el equipo defensor forma una **barrera visible de 3 a 5 jugadores** a la distancia reglamentaria cubriendo el palo cercano, mientras el arquero protege el lado opuesto. El especialista del equipo lanzador elige entre rosca por encima de la barrera, disparo potente al palo del portero o envío al área si el ángulo es cerrado.
   - **Córners con variantes**: Dejan de caer siempre al mismo punto; alternan envíos cerrados al primer palo con peinada, centros pasados al segundo palo, bloqueos para llegada desde atrás y córners en corto hacia el borde del área para remate de media distancia.
   - **Remates desde fuera del área**: Los mediocampistas y mediapuntas con buen disparo prueban con mayor criterio cuando tienen ventana libre entre 19 y 32 metros, produciendo efectos de caída (topspin), curva hacia el ángulo (finesse) o rechaces peligrosos del arquero.
   - **Celebración, relatos y clasificación**: Cada gol queda etiquetado según su ejecución (`Cabezazo`, `Remate lejano`, `Tiro libre`, `De córner`, `Volea`, `Penal`, `Jugada colectiva`) tanto en el banner titilante del partido como en el mapa de tiros, las estadísticas y las crónicas posteriores.

3. **Charla con Jugadores Evolucionada a Chat con IA**
   - **Punto de entrada unificado**: Tanto el aviso pendiente (punto rojo de jugador que pide hablar) como la pestaña de charla dentro de la ficha del jugador abren la misma sala de conversación privada con estilo de mensajería táctica integrada en el diseño del juego.
   - **Historial y contexto visible**: Al abrir el chat se muestra una franja compacta con el estado actual del futbolista (**Moral**, **Relación/Tensión** y **Promesas activas** con fecha límite) y los mensajes anteriores de la conversación.
   - **Interacción híbrida**: Sobre la barra inferior aparecen **3 chips de respuestas rápidas sugeridas** adaptadas al tema del jugador y al último mensaje (ej. prometer minutos, exigir más intensidad, cerrar la puerta a una salida, elogiar trabajo), junto a un **campo de texto libre** donde el DT puede escribir exactamente lo que quiera decirle.
   - **Consecuencia tangible**: Tras cada mensaje del jugador, un indicador discreto muestra el ajuste real aplicado (p. ej. `Moral +6`, `Tensión -4`, o nueva promesa registrada: `Titular en los próximos 3 partidos`) y actualiza los datos reales del plantel al instante.

### Identidad Visual y Sistema de Componentes

- **Dirección estética**: Continuidad estricta con la interfaz clásica **FM08 Broadcast** presente en toda la aplicación — acero cepillado en cabeceras, grafito oscuro (`#191c20`–`#23272c`) para paneles de cancha y pizarra, y lienzo claro verde-gris (`#d4dcd4` / `#e8ece8`) en vistas de gestión y conversación.
- **Tipografía y jerarquía**: `Barlow Condensed` para cabeceras, banners de gol y etiquetas de tipo de jugada; `Plus Jakarta Sans` para diálogos de chat, chips sugeridos y relatos; `JetBrains Mono` (`tabular-nums`) para minutos, distancias, deltas de moral y vencimientos de promesas.
- **Disciplina de interfaz**:
  - Controles de una sola línea (`whitespace-nowrap shrink-0`) en cabecera, barra de chat y botones tácticos.
  - En el chat, burbujas limpias diferenciadas por alineación y contraste (club/DT en verde sobrio `#2b5d2c` con texto claro, jugador en panel pizarra `#e8ece8` con acento sutil del club) sin abusar de badges ni bordes gruesos decorativos.
  - Los impactos de moral y promesas se muestran con texto e iconos explícitos (`+6 Moral · Tensión -3`), nunca solo por color.
- **Retroalimentación en el lienzo 2D y en la charla**:
  - En cancha 2D: mayor contraste sombra-balón según altura (`y`), anillo breve de impulso en duelos aéreos y cabezazos, alineación geométrica clara de los jugadores de la barrera en tiros libres y etiqueta breve del tipo de gol al festejar.
  - En el chat: estado de espera breve (`El jugador está pensando...`), errores explícitos con botón **Reintentar** ante fallos del servicio de IA y confirmación inmediata de promesas pactadas.

---

## 3. Decisiones Clave de Producto, Opinión Técnica y Compromisos

### Nuestra Opinión sobre la Charla con IA y el Motor 2D

- **Por qué evolucionar la charla a IA con salida estructurada (y no chat libre sin reglas)**
  - Un modelo de lenguaje suelto sin restricciones suele volverse complaciente, olvidar la situación de la tabla o prometer cosas imposibles dentro del simulador (como "subirte el sueldo mañana" sin cambiar el contrato real).
  - La arquitectura ideal es usar **IA generativa con contrato JSON estricto** (`gemini-4-hydrogen`), alimentada en cada turno con la ficha real del futbolista (personalidad, edad, rol en el plantel, moral, tensión, últimos partidos, minutos jugados, contrato, posición en la tabla y promesas vigentes).
  - *Beneficio*: El jugador siente que habla con un futbolista único que recuerda lo que pasó el domingo, mientras el motor recibe del mismo llamado los deltas seguros (`moraleDelta`, `tensionDelta`, `trustDelta`), una eventual **promesa tipificada** y 3 sugerencias nuevas de respuesta para el usuario en menos de un segundo.

- **Por qué el realismo 2D depende tanto de la toma de decisiones como de la física**
  - Hoy el simulador 2D concentra casi toda la amenaza en pases filtrados y tiros frontales rasos porque el cálculo de utilidad penaliza los remates de lejos y porque las pelotas paradas ejecutan el mismo algoritmo de pase o tiro genérico que una jugada abierta.
  - Separar **física de cabezazo**, **rutina de barrera en tiro libre**, **patrones reales de córner** y **curva de disparo lejano** transforma de inmediato tanto lo que se ve en los 90 minutos como la diversidad de goleadores (centrales que ganan de cabeza, extremos que tiran centros al segundo palo, especialistas de tiro libre y volantes con pegada media).

### Decisiones y Compromisos Técnicos

- **Modelo de IA: `gemini-4-hydrogen` vía Proxy Express en Servidor**
  - *Enfoque elegido*: Pasar la app a un servidor unificado en el puerto 3000 que sirve la aplicación web y expone un endpoint dedicado de conversación (`/api/player-chat`), invocando `@google/genai` con `gemini-4-hydrogen`, `ThinkingLevel.LOW` para baja latencia y esquema JSON tipado.
  - *Por qué*: Protege la credencial del servicio en servidor, mantiene respuestas rápidas para conversación turno a turno y no exige clave paga adicional.
  - *Alternativas descartadas*: Usar heurísticas locales de palabras clave (se vuelve repetitivo en 3 partidas) o llamar modelos pesados de razonamiento profundo (demoran demasiado para un chat ágil).

- **Sistema de Promesas Tipificadas Vinculadas al Calendario**
  - *Enfoque elegido*: Aunque el DT escriba con total libertad, la IA mapea cualquier compromiso concreto a categorías evaluables por el juego (`PLAYTIME_STARTER`, `NEXT_MATCH_MINUTES`, `CONTRACT_RENEWAL`, `POSITION_ROLE`, `CLUB_AMBITION`, `TRANSFER_LISTING`) con plazo en partidos o días.
  - *Por qué*: Permite que semanas después el sistema verifique automáticamente si cumpliste tu palabra (subiendo lealtad y confianza) o si faltaste a ella (generando malestar real, pérdida de moral o noticia en prensa).
  - *Alternativas descartadas*: Promesas puramente narrativas sin seguimiento posterior (perderían credibilidad rápidamente).

- **Física Dedicada para Cabezazos, Tiros Libres y Córners en el Motor 2D**
  - *Enfoque elegido*: Ampliar las utilidades de decisión y añadir un tipo explícito de remate (`shotType` / `goalType`) que gobierna trayectoria aérea (`spinY`, altura y pique), posicionamiento defensivo de la barrera y lectura de marcas en córners, propagando esa clasificación al banner del encuentro, mapa OPTA y crónicas.
  - *Por qué*: El mismo cambio mejora tanto el partido en vivo 2D como los reportes estadísticos y narrativos post-partido sin duplicar lógica.
  - *Alternativas descartadas*: Hacer cambios únicamente cosméticos en la animación o texto del relato sin alterar la física real de la pelota y los marcajes.

---

## 4. Arquitectura Técnica y Estrategia de Datos *(Referencia Técnica)*

### Diagrama de Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        INTERFAZ Y NAVEGACIÓN (CLIENTE)                     │
│                                                                            │
│   Cabecera Broadcast Única ──► Vista Club Externo (Botón Volver integrado) │
│   (Sin duplicación al entrar desde Tablas o Estadísticas)                  │
│                                                                            │
│   ┌──────────────────────────────────┐  ┌───────────────────────────────┐  │
│   │ Visor de Partido 2D & Crónicas   │  │ Sala de Chat IA del Jugador   │  │
│   │ • Barrera visible en tiro libre  │  │ • Historial + Estado/Promesas │  │
│   │ • Contraste aéreo + halo salto   │  │ • Texto libre + 3 sugerencias │  │
│   │ • Badges: Cabezazo / Tiro libre  │  │ • Deltas en vivo + reintento  │  │
│   └──────────────────┬───────────────┘  └───────────────┬───────────────┘  │
└──────────────────────┼──────────────────────────────────┼──────────────────┘
                       │                                  │ POST /api/player-chat
                       ▼                                  ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│     MOTOR DE PARTIDOS 2D MEJORADO    │  │   SERVIDOR EXPRESS (PUERTO 3000) │
│                                      │  │                                  │
│  ┌────────────────────────────────┐  │  │ • Middleware Vite / Dist estático│
│  │ Árbol de Decisión y Física     │  │  │ • Valida contexto e historial    │
│  │ • Centros (1er/2do palo/raso)  │  │  │ • Llama @google/genai            │
│  │ • Cabezazos (duelo + remate)   │  │  │   (gemini-4-hydrogen, JSON Typed)│
│  │ • Barrera 9.15m en Tiro Libre  │  │  │ • Devuelve respuesta + deltas +  │
│  │ • Córners (4 rutinas tácticas) │  │  │   promesa + chips sugeridos      │
│  │ • Tiros lejanos (curva/topspin)│  │  └──────────────────────────────────┘
│  └────────────────┬───────────────┘  │
└───────────────────┼──────────────────┘
                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              ESTADO PERSISTENTE DEL MUNDO Y PARTIDA GUARDADA               │
│  • Player: chatHistory[], activePromises[], pendingDialogue, morale        │
│  • Relaciones DT ↔ Jugador: trust, respect, tension, interactionLog        │
│  • MatchSnapshot & Crónicas: shotType / goalType en tiros, eventos y actas │
└────────────────────────────────────────────────────────────────────────────┘
```

### Modelo de Datos y Estado

- **Historial de chat por jugador (`chatHistory`)**: Lista serializable de mensajes (`id`, `sender: 'MANAGER' | 'PLAYER' | 'SYSTEM'`, `text`, `timestamp`, `moraleDelta`, `tensionDelta`, `promiseLabel`), conservada dentro del estado de carrera y los guardados locales/JSON.
- **Promesas activas (`activePromises`)**: Estructura vinculada a cada jugador con `id`, `category`, `summary`, `createdAt`, `deadlineMatches` o `deadlineDate`, `matchesProgress`, `status` (`ACTIVE | FULFILLED | BROKEN`). Se evalúan tras cada partido y al avanzar días en el calendario mundial.
- **Metadatos de tiro y gol (`ShotType` / `GoalType`)**: Nueva propiedad en el registro de disparos y eventos del partido (`'open_play' | 'header' | 'long_range' | 'free_kick' | 'corner_header' | 'volley' | 'penalty' | 'tap_in'`) utilizada para renderizar etiquetas de celebración, narración en vivo, desglose OPTA y crónicas automáticas.
- **Estado de barrera en balón parado**: Coordenadas temporales de barrera calculadas entre el punto de la falta y el arco defensor para el visor 2D y la trayectoria del tiro libre.

### Mapeo de Interacciones y Flujos Clave

- **Clic en club desde Clasificación o Estadísticas → Vista de Club Externo**:
  - La cabecera global única recibe los datos del club externo junto con la acción **Volver**; la vista interna de plantilla deja de renderizar un segundo encabezado propio.
- **Falta cerca del área / Córner / Centro al área / Ventana de media distancia → Motor 2D + Lienzo**:
  1. *Falta frontal (< 30 m)*: Se calcula la línea de barrera a 9.15 m, 3–5 defensores se alinean antes de la orden del árbitro y el lanzador ejecuta disparo con curva lateral + topspin por encima o alrededor de la barrera; el visor 2D dibuja la barrera alineada y la sombra elevada del balón.
  2. *Córner*: El lanzador selecciona entre envío cerrado al primer palo, envío pasado al segundo palo, pelota al punto penal o toque en corto; atacantes ejecutan desmarques de cruce antes del golpeo.
  3. *Centro desde banda*: Diferencia entre centro tenso a media altura y envío llovido; en recepción alta dentro del área, el duelo aéreo dispara remate de cabeza con atributos de salto/anticipación/cabezazo, aro visual de salto y trayectoria picada o bombeada.
  4. *Remate lejano*: Se ajusta la curva de decisión entre 19 y 32 m para especialistas, aplicando física de efecto lateral o caída brusca y rebote realista del portero si despeja corto.
- **Mensaje del DT en Chat IA → Backend `/api/player-chat` → Actualización del Jugador**:
  1. El cliente envía el mensaje del usuario junto con el resumen compacto del contexto del futbolista (datos, atributos mentales/personalidad, moral, tensión, últimos partidos, situación contractual, motivo pendiente, promesas activas y últimos turnos de conversación).
  2. El servidor valida el payload y consulta a `gemini-4-hydrogen` con esquema JSON estricto (`reply`, `moodDelta`, `tensionDelta`, `trustDelta`, `suggestedReplies`, `newPromise`, `clearsPendingIssue`, `resolveTransferRequest`).
  3. Al recibir respuesta válida, el cliente agrega la réplica al historial, aplica los deltas acotados (`[-15, +15]` en moral), registra cualquier promesa pactada, actualiza el estado del diálogo pendiente o pedido de traspaso y muestra las nuevas 3 respuestas rápidas sugeridas.
  4. Si la solicitud falla (red, clave ausente o límite de cuota), se muestra un aviso claro con opción de reintento manteniendo el texto escrito para no perder el mensaje.
