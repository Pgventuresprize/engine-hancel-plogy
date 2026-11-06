# Onboarding: del link al primer post

Plan del 2026-11-05, tercera versión. En construcción en la rama `onboarding`.

**Cambios tras la revisión de Luciano:** el brief es mucho más denso y se llena por
muchas vías (web, archivos, posts, texto, conversación), sin Firecrawl, con Chromium
propio. Las plantillas se generan por marca en vez de usar familias de fábrica, y quien
no tiene nada puede planear su marca desde cero. El plan vigente es el aprobado el
mismo día; este documento conserva el razonamiento.

## Estado al 2026-11-05

Construido y probado de punta a punta en la rama `onboarding`. Migración aplicada.

**Modelos con la clave de plataforma.** Conversación, brief, auditoría y plantillas van en
Sonnet (`CLAUDE_PLATAFORMA_MODELO_MARCA`): se hacen una vez por marca y de ahí sale todo.
Cada post va en Haiku (`CLAUDE_PLATAFORMA_MODELO`). Se probó todo en Haiku: tarda menos y
cuesta 0,03 dólares por marca, pero el brief queda en tercera persona, más genérico, y las
plantillas pierden nivel. Todo en Sonnet cuesta unos 0,70 dólares y pasa de 5 minutos. El reparto elegido cuesta de 0,21 a 0,35 dólares por marca con su primer post, y cada post siguiente unos 0,012.

**Sin inventar.** Tres capas: el Estratega no mete hechos dentro de una propuesta, el brief
no usa lo propuesto en "sabe" ni en "material", y una auditoría separada contrasta el brief
con la evidencia y quita lo que no tenga respaldo. La auditoría existe porque en una prueba
"hechas a mano" se volvió "en pequeños lotes" y llegó al post.

**Web.** Chromium propio en `capturar.ts`. No hizo falta el paso aparte `mirar.ts`: las
capturas entran al primer turno del Estratega junto con lo medido. Una web con certificado
TLS inválido no se lee y la persona sigue con archivos o texto pegado.

**Tiempos reales, del tema elegido al post listo:** de 3:20 a 4:30, con tres corridas a la vez
en un equipo local. Falta medirlo en Vercel.

**Fotos.** `fotos.ts` baja las de la web y las que sube la persona, descarta íconos,
recortes, franjas y gráficos planos, y las deja etiquetadas en la biblioteca. Lo que el
etiquetador califica mal se guarda desactivado. Las plantillas llevan foto opcional en al
menos tres tipos y `fotos_por_carrusel` es 3. Se guardan al leer las fuentes, en paralelo con
la primera pregunta, para que quien se vaya antes de terminar no las pierda.

**Registro simultáneo.** Crear `engine_settings` reprogramaba un cron en cada cuenta nueva y
dos registros a la vez chocaban. `asegurarConfiguracion` reintenta (20 de 20 a la vez bien).
La solución de fondo es `2026-11-05-registro-concurrente.sql`, **sin aplicar**: el sistema de
permisos la bloqueó y la aplica Luciano.

**Probar en local.** `npx tsx --env-file=.env.local scripts/probar-local.ts` levanta la app,
crea una cuenta confirmada e imprime con qué entrar. Atiende también el chat, porque el
reparto de la base llama a producción, que corre otro código. Solo toca cuentas `prueba-*`.

**Reglas que aplica el código, sin depender del modelo** (repetir un diseño no cabe en los 5
minutos): el logo no queda sobre una foto ni sobre fondo oscuro (`logoEnSuSitio`), un logo blanco
no se usa y firma el nombre (`logoEsClaro`), un hueco opcional vacío no deja caja vacía
(`sinCajasVacias`), un texto ya dicho por el título o el botón no se repite (`sinRepetidos`), una
marca `{{...}}` nunca llega a la lámina y las condiciones se pueden anidar. Con
`fotos_siempre`, toda lámina que admite foto la lleva si la biblioteca tiene una.

**Falta:** los 3 caminos de `caminos.ts` (quien construye desde cero conversa y el Studio le
propone), Instagram conectado, trabajo de fondo por cron, confirmar lo visual sobre una lámina de muestra y redibujar al llegar el kit tras el plan B.
Ver `ITERACIONES.md`.

**La idea:** el Studio sabe exactamente qué necesita para sacar un post decente y
listo para subir. Extrae lo que pueda, pide lo que falte y, **si la persona no sabe
qué responder, hace el trabajo con ella**: le propone opciones o lo rellena. Con eso
genera un **brief de marca** corto, y de ahí salen el kit y el primer post. Desde que
termina la conversación, **no pasan más de 5 minutos**.

Sirve igual para una empresa con web de años, para un negocio que recién empieza y
para **una persona que quiere construir su marca personal**.

Toma de `MARCA-DESDE-LINK.md` la parte de leer sitios y medir lo visual, y de
`MARCAS.md` la visión de marcas personales, el Estratega y el método por tipo de marca.
**Donde difieran en el onboarding, manda este.**

## 1. El flujo

```
Tipo → Traer lo que haya → Comparar con la lista → Conversación → GENERAR → Brief + post
                                                                  └─ 5 minutos ─┘
```

1. **Qué estamos creando.** Una marca personal, una empresa o un negocio (§3).
2. **Traer lo que haya.** Web, redes, archivos o nada. "Todavía no tengo nada" es una
   respuesta válida.
3. **Comparar.** El código cruza lo encontrado con la lista de §4.
4. **Conversación con el Estratega.** Muestra lo encontrado, pregunta lo que falta y
   ayuda cuando la persona no sabe (§5). Termina al elegir el tema del primer post.
5. **Generar.** Brief, kit y primer post, sin más preguntas.
6. **Entrega.** La persona ve su brief y su post, y entra al Studio normal.

**La revisión ocurre en la conversación.** Como ahí se confirma todo, la generación no
se detiene a pedir aprobación. Nada se publica solo: el post queda para que la persona
lo revise.

## 2. La regla: qué se puede rellenar y qué no

Rellenar y "no inventar nada" no chocan si se separan dos clases de datos.

| Clase | Qué es | Ejemplos | ¿Se rellena? |
|---|---|---|---|
| **Hechos** | Lo que es verdad o no | Clientes, cifras, años, títulos, premios, historia personal, precios, dirección | **Nunca.** Si no se sabe, no se afirma |
| **Decisiones** | Lo que la marca elige ser | A quién le habla, de qué quiere ser referente, temas, voz, CTA, colores, fuentes | **Sí.** Son elecciones, no datos |
| **Opiniones** | Lo que alguien cree | Qué cree, contra qué está, cómo ve las cosas | **Se propone y se muestra.** Nadie adopta una opinión sin verla |

**Por qué las opiniones van aparte:** una empresa puede elegir una postura, pero poner
una opinión en boca de una persona real es más delicado. El relleno se la muestra en la
conversación: "Puse esto. ¿Te representa?". Quien use "Rellenar todo" la verá marcada
en el brief.

Todo lo rellenado queda marcado como **propuesto por el Studio**, con su motivo.

## 3. Los tipos de marca

Es lo primero que se pregunta porque cambia lo que se necesita, cómo se conversa y qué
hace confiable a la marca. Parte de la tabla del Paso 0 de `MARCAS.md`, y debe ajustarse
con esa investigación.

| Tipo | La confianza viene de | Lo que más importa conseguir |
|---|---|---|
| **Persona** | Su historia y su criterio | Historia, opiniones, cómo habla |
| **Servicios / B2B** | Autoridad, casos, prueba | Método, casos, a quién ayuda |
| **Producto** | Estética, deseo, identidad | Fotos reales, por qué existe, comunidad |
| **Compra de alto valor** | Aspiración, prueba social | Pruebas, proceso, postventa |
| **Negocio local** | Cercanía, lugar, oferta | Dónde, qué ofrece, para quién |

**La marca personal es otra cosa.** Como dice `MARCAS.md`, la persona es la marca: el
contenido es suyo, con su historia y sus opiniones. No es contenido de empresa firmado.
Para el onboarding eso significa:

- **Entrada:** casi nunca tiene web. Empieza por Instagram, por su perfil de LinkedIn
  en PDF, por un CV o por contar quién es. No di por hecho que LinkedIn se pueda leer
  desde un link: hay que probarlo, y el PDF es la ruta segura.
- **Escritura:** en primera persona singular.
- **Sin logo:** la firma es su nombre. Sus fotos importan más que en una empresa.
- **Límites personales:** es un dato requerido preguntar qué no se cuenta (familia,
  salud, dinero, dónde vive). `MARCAS.md` lo pide: no se escribe nada que la persona no
  quiera ver publicado.
- **Su historia es un hecho:** nunca se rellena. Se ayuda a contarla, no se escribe por
  ella.
- **Si trabaja en una empresa:** se pregunta cuánto habla de ella. Es el
  `relacion_empresa` de `MARCAS.md`.

**La marca personal es un producto, no un caso de Plogy.** Plogy es solo un ejemplo: el
Studio debe servirle a cualquier persona que llegue a construir su marca, sin empresa
detrás ni embudo hacia nadie. En `MARCAS.md` el destino de esas marcas era Plogy; aquí cada
persona define el suyo (consultas, un curso, seguidores o nada todavía). Nada del motor
puede asumir que hay una empresa.

### Lo que hay que cambiar en el Studio

Revisé el motor buscando lo que asume que toda marca es una empresa. Los oficios de los
agentes principales hablan de "la marca", no de "nosotros", y eso ayuda. Pero hay esto:

| Qué pasa hoy | Por qué falla | Cambio |
|---|---|---|
| El revisor solo reconoce opiniones en plural: "nuestra lectura", "creemos" (`revisor.ts:446`) | "Yo creo" o "para mí" no cuentan como opinión, y podrían tratarse como un dato sin respaldo. Además trae "criterio de plogy" escrito en el motor | Reconocer el singular y quitar Plogy del código |
| Los agentes reciben todo como "noticia" | Una historia personal o una opinión no son noticias | Prompts que entiendan contenido sin noticia (§8) |
| El registro dice "Crea tu empresa" | Una persona no se siente incluida | Hablar de "tu marca" |
| El plan basic se describe como noticias y sus agentes | Una marca personal vive de su historia y sus opiniones, no de noticias | Que la extracción de noticias sea opcional según el tipo |

También hay que probar si el criterio, que hoy son "2 acciones concretas para quien lee",
le sirve a una marca personal o si ahí debe ser una opinión. Lo sabremos en la Fase 0.

**Cuentas hijas.** Las marcas de un equipo dentro de una empresa son un caso aparte: esa
herencia es de `MARCAS.md` y sigue sin construir. Cuando exista, el onboarding de una hija
saltará lo visual, que se comparte, y solo pedirá lo personal.

## 4. Lo que se necesita para un post decente

Esta lista manda todo el flujo. Salió de leer lo que consume cada agente y la comprueba
el **código**, no el criterio de un modelo. Cada punto debe quedar confirmado o propuesto;
si no, no se genera.

### Común a todos

| # | Dato | Clase | Quién lo usa | Si nadie lo sabe |
|---|---|---|---|---|
| 1 | Nombre y usuario | Hecho | Todos | Se pregunta. Es el único obligatorio junto al 2 |
| 2 | Qué hace, en palabras simples | Hecho | Todos | Se pregunta |
| 3 | Idioma y país | Hecho | Todos | Se deduce y se confirma |
| 4 | A quién le habla | Decisión | Ángulo, escritores | 3 opciones |
| 5 | De qué quiere ser referente | Decisión | Ángulo, escritores | 3 opciones |
| 6 | Temas (al menos 2) | Decisión | Ángulo, escritores | Se proponen |
| 7 | Cómo suena | Decisión | Escritores, revisor | Elige entre frases de muestra |
| 8 | Qué cree (al menos 2 posturas) | Opinión | Ángulo, criterio | Preguntas fáciles, luego se propone |
| 9 | Cómo trabaja o cómo mira las cosas | Opinión | **Criterio** | Se saca de una historia concreta |
| 10 | Qué puede afirmar | Hecho | Todos | Queda vacío: el post no afirma nada de la marca |
| 11 | Qué debe hacer quien lee (CTA) | Decisión | Cierre del post | Se propone. Seguir la cuenta es la opción segura |
| 12 | Colores | Decisión | Kit | Medidos, o 3 paletas |
| 13 | Fuentes | Decisión | Kit | Medidas, o las de la familia de plantillas |
| 14 | Tema del primer post | Decisión | Primer post | 3 temas |

### Lo que cambia por tipo

| Tipo | Se suma como requerido | Se quita o cambia |
|---|---|---|
| Persona | Su historia (hecho), límites personales, relación con su empresa si la tiene | Logo: va su nombre. Fotos propias, muy recomendadas |
| Servicios / B2B | Logo, al menos un caso o forma de trabajo real | |
| Producto | Logo, fotos reales del producto | No se altera el producto en ninguna imagen |
| Alto valor | Logo, prueba real o proceso de compra | |
| Local | Logo, ubicación y oferta real | Horarios y precios solo si están confirmados |

### Recomendados

No frenan la generación: por qué existe, contra qué está, temas que no toca, frases
prohibidas y posts reales, que se guardan como ejemplos.

### Estado de cada dato

| Estado | Regla | Qué hace la conversación |
|---|---|---|
| Listo | Tiene fuente y ninguna otra lo contradice | Lo muestra para corregir |
| Dudoso | Dos fuentes chocan o la evidencia es débil | Pregunta cuál manda |
| Falta | No hay evidencia | Lo pide, y ofrece ayuda |
| Propuesto | Lo puso el Studio | Lo muestra marcado |

## 5. La conversación

Es el corazón del onboarding y el primer trabajo del **Estratega**, el agente que
`MARCAS.md` planeó: posicionamiento y dirección, aplicando el método. Después sigue
disponible en el chat. No es un formulario: una persona sin ideas claras debe salir
con más claridad de la que traía.

### Tres ayudas, de menos a más

Debajo de cada pregunta hay tres caminos:

**Responder.** Con una frase basta.

**Ayúdame.** No repite la pregunta: la cambia por una más fácil y concreta, o da
opciones. Casi nadie sabe responder "¿cuál es tu método?", pero sí esto:

| En vez de preguntar | Pregunta |
|---|---|
| ¿Cuál es tu método? | Cuéntame la última vez que algo te salió bien con un cliente. ¿Qué hiciste primero? |
| ¿Qué crees? | ¿Qué hace la gente de tu sector que te parece un error? |
| ¿A quién le hablas? | ¿Quién fue la última persona a la que ayudaste? ¿Qué le preocupaba? |
| ¿Cuál es tu voz? | ¿Cuál de estas dos frases dirías tú? |
| ¿Cuál es tu historia? | ¿Qué estabas haciendo antes de esto? ¿Qué te hizo cambiar? |

El Estratega saca el dato de esa respuesta. Las respuestas son mejor material que
cualquier web, porque quedan las palabras reales de la persona.

**Rellénalo tú.** El Estratega decide con lo que tiene, explica por qué y sigue. La
persona lo ve, y puede cambiarlo.

Además, en cualquier momento hay un botón **Rellenar todo lo que falta**. Con solo el
nombre y qué hace ya se puede generar. Los hechos quedan vacíos y el resto, propuesto.

### Con qué rellena

Solo con esto, en este orden:

1. Lo que dijo la persona.
2. Lo que se extrajo de sus fuentes.
3. El **método** de su tipo de marca.

**La calidad depende del método.** Sin él, el relleno sale genérico. Por eso el Paso 0
de `MARCAS.md` pasa a ser requisito (Fase 0).

**Regla contra el relleno genérico:** si cualquiera del sector podría firmarlo, no sirve.
Las opciones deben ser caminos distintos de verdad, cada uno con lo que gana y lo que deja.
Elegir entre ellas es lo que le da dirección a una marca que no la tenía.

### Otras reglas

- Máximo 7 preguntas con material, 10 sin material. "Ayúdame" no suma una pregunta nueva.
- Nunca pregunta lo que ya está en sus fuentes.
- Abre mostrando lo encontrado, y muestra el avance: "Nos faltan 3 cosas".
- Muestra el motivo de cada duda.
- Lo que responde la persona pesa más que cualquier fuente.
- Termina eligiendo el tema, y ahí arranca el reloj.

### Cómo se ve

Una persona sin web y sin nada claro:

```
Estratega   Cuéntame en una frase a qué te dedicas.
Persona     Soy nutricionista, atiendo en consulta.

Estratega   ¿A quién quieres llegar con tu contenido?
            [ Responder ]  [ Ayúdame ]  [ Rellénalo tú ]
Persona     Ayúdame

Estratega   ¿Quién fue la última persona que te agradeció de verdad?
            ¿Qué le preocupaba?
Persona     Una señora con diabetes, no sabía qué comer sin aburrirse.

Estratega   Veo tres caminos, y los tres son distintos:
            1. Gente con diabetes que quiere comer rico. Muy claro,
               pero más pequeño.
            2. Familias que cocinan para alguien con una condición.
               Menos gente habla de esto.
            3. Personas que se cansaron de las dietas. Mucho público,
               pero mucha competencia.
            [ 1 ]  [ 2 ]  [ 3 ]  [ Otra ]  [ Rellénalo tú ]
```

## 6. El brief

Un documento corto, de una o dos pantallas, que se puede leer, corregir y descargar.

```
BRIEF DE MARCA · [Nombre]

Quién es          Qué hace, de qué es referente, idioma y país
Su historia       Solo marcas personales
A quién le habla  Audiencias reales
De qué habla      Temas, del que más pesa al que menos
Cómo piensa       Qué cree, cómo trabaja, qué nunca haría
Cómo suena        Cómo sí, cómo no, frases reales de muestra
Qué puede afirmar Hechos, cada uno con su fuente
Qué pide          CTA
Cómo se ve        Logo o nombre, colores, fuentes, plantillas, fotos
```

**Cada dato lleva una etiqueta:**

| Etiqueta | Significa |
|---|---|
| Lo dijiste tú | Salió de la conversación |
| Lo encontramos | Trae la página o el post de donde salió |
| Propuesto por el Studio | Trae el motivo. Se ve resaltado |

Lo propuesto queda en una lista corta para revisar con calma en Marca. Una persona que
llegó sin idea puede aceptarlo hoy y cambiarlo cuando conozca mejor su marca.

**El brief no es un sistema nuevo.** Reparte su contenido en lo que los agentes ya leen,
y desde ahí se edita en Marca:

| Parte del brief | Destino |
|---|---|
| Quién es, cómo suena, vetos | `brand_profile` |
| A quién, de qué habla, qué pide | Identidad editorial |
| Su historia y cómo piensa | Skill "Cómo piensa la marca" |
| Qué puede afirmar | Skill "Lo que la marca sabe" |
| Primera persona, en marca personal | Skill "Cómo piensa la marca" |
| Cómo se ve | Kit de la marca |
| Posts reales | Ejemplos |
| Fuentes de cada dato | Campo `original` de cada skill |

La copia del brief es una foto de ese momento. La verdad queda en esas tablas, para que
no haya dos versiones de la marca compitiendo.

## 7. El kit y el diseño

Con 5 minutos, el diseño no puede salir de Opus inventando cada pieza: importar un kit
tarda 10 a 20 minutos y el diseñador libre, 2 a 4 por llamada.

**Por eso: plantillas de fábrica teñidas con la marca.** Es el kit neutro ya pedido en
`ITERACIONES.md` y, por lo que se ve del producto, probablemente es como trabaja Pomelli
(inferencia, no confirmado).

- **3 familias** de plantillas, una de ellas pensada para persona (foto y nombre en vez
  de logo). Cada una con portada, idea, lista, dato, comparación, cita y cierres por tipo
  de CTA, en claro y oscuro.
- **Paletas y pares de fuentes de fábrica** para quien no tenga. Son una decisión, así
  que se pueden rellenar sin inventar nada.
- El código elige la familia según el tipo de marca y lo medido. La persona puede cambiarla.
- El kit se crea, se llena y se activa por código, sin Claude, en segundos.

**Lo que se pierde:** estas plantillas no alcanzan el nivel de las piezas publicadas de
Plogy, y "se ve de plantilla" es la queja más común sobre Pomelli. Se acepta para el
primer post. Después se puede subir de nivel con el importador o el diseñador libre. **La
calidad de estas plantillas decide cómo se ve el producto entero.**

**Fotos.** Solo propias. Sin fotos, el post va tipográfico. Sin stock ni imágenes generadas
en el primer post.

## 8. Sin inventar nada

El agente no recibe internet por defecto. `crear_piezas` ya permite trabajar sin búsqueda
(`investigar: false`), así que el material será el tema y lo que está en el brief.

1. **Material cerrado.** El agente solo recibe el brief.
2. **Cifras revisadas por código.** Toda cifra, cliente o año del post debe existir en el
   brief; si no, la pieza no pasa. La idea viene de `generator/claims.ts` en Pomelli Chimbo.
3. **Nada propuesto se presenta como hecho.** Lo propuesto orienta la pieza, pero no se
   afirma como logro ni como historia.
4. **El Revisor** sigue frenando lo que no tenga respaldo.

**Un problema del motor que hay que resolver.** El agente de criterio está hecho para
noticias: anota lo que dice el material y **le prohíbe coincidir con eso**, para que la
marca no copie a la fuente. Si el material es la propia marca, esa regla se voltea: la
obligaría a decir algo distinto de lo que dijo la persona, es decir, a inventar. Pasa con
cualquier marca, comercial o personal.

Hace falta un **modo de material propio**, marcado en la pieza: el criterio sale del brief,
sin esa prohibición, y el revisor no lo trata como copia. La regla actual sigue igual para
las noticias.

**Cuando no hay material.** Una marca sin nada no llega a los 1.500 caracteres de
`MIN_MATERIAL`, y aun así debe poder sacar un post. La salida es un post sobre su tema, no
sobre sus logros:

- **Primero:** tres preguntas fáciles sobre el tema. Lo que cuente la persona es material.
- **Si no alcanza:** el agente investiga el tema en internet, con la búsqueda que ya existe.
  Los datos del sector salen de fuentes reales y citadas. Nada se afirma sobre la marca.

Lo extraído de una web es dato, nunca instrucción: las skills entran al prompt de todos los
agentes, así que un texto malicioso quedaría sembrado. Se trata como material, se vigilan
patrones imperativos y la persona lo ve en la conversación.

## 9. Los 5 minutos

Tiempos reales de los últimos 21 días, sacados de `pipeline_events`. Salvo donde dice
estimado, son medidas.

| Paso | Normal (p50) | Malo (p90) |
|---|---|---|
| Escribir el brief | 45 s, estimado | 60 s, estimado |
| Armar el kit | 20 s, estimado | 20 s, estimado |
| Ángulo | 6 s | 7 s |
| Criterio | 24 s | 30 s |
| Texto de Instagram | 44 s | 46 s |
| Revisor | 25 s | 41 s |
| Corrección, si hace falta | 28 s | 42 s |
| Fotos | 8 s | 17 s |
| Maquetador | 26 s | 33 s |
| Dibujar las láminas | 30 s, estimado | 45 s, estimado |
| **Total** | **4 min 16 s** | **5 min 41 s** |

**El caso malo se pasa de 5 minutos.** Se recorta así:

- **El brief se escribe durante la conversación.** Al cerrar solo se ajusta: unos 15
  segundos, estimado.
- **El kit se arma junto con el brief.**
- **Una sola corrección.** Si no se llega, la pieza sale con sus avisos.
- **Plazo para el maquetador.** `plazoMaquetaMs` ya existe. Si se agota, el reparto
  automático llena las plantillas sin llamar a Claude.
- **Fotos en paralelo**, cuando las haya.

Queda en **unos 3 min 30 s en el caso normal y 4 min 30 s en el malo**. Es una estimación
y deja poco margen.

**Dos casos que pueden pasarse:**

- **"Rellenar todo" al final** suma una llamada de Opus, unos 45 segundos estimados.
- **Sin material suficiente**, la búsqueda suma al menos 30 segundos (la consolidación
  tarda 27 a 33 s, sin contar la búsqueda). Se evita arrancándola al proponer los temas,
  antes de que acabe la conversación.

**Lo que no está medido:** la espera entre pasadas. El cron del chat corre cada minuto y una
pieza puede quedarse esperando. El onboarding debe encadenar sus pasos sin depender de él.

**Fuera del reloj:** la extracción y la conversación. La meta propuesta para extraer es
menos de 2 minutos, por medir. Pomelli tarda hasta 8.

## 10. Lo que hay que decidir antes de construir

Sin esto, el flujo no funciona para una persona nueva.

### Una cuenta nueva no puede usar a Claude

Cada empresa usa su propio token y una recién creada no tiene ninguno.

**Recomendación:** una API key de consola de la plataforma, con tope por cuenta. El motor ya
acepta ese tipo de clave y anota cada llamada. La clave de Firecrawl también debe ser de la
plataforma.

**Riesgo:** con registro abierto, cualquiera puede gastar Opus de Plogy. Antes de abrirlo
hacen falta correo confirmado, captcha, un onboarding por cuenta y un tope diario total.

### "Listo para subir" todavía no existe del todo

No encontré un botón de descarga en el panel de la pieza, y programar es del plan advance.

**Recomendación:** agregar "Descargar láminas y copiar texto" en la entrega.

## 11. Qué se construye

**Puerta.** Campo `accounts.onboarding` con `listo` por defecto, para que las cuentas
existentes no noten nada. `crearEmpresa` pone `pendiente` en las nuevas. Se comprueba en
`app/page.tsx` y `DashboardShell`, y se enciende con `ONBOARDING_ACTIVO`.

| Estado | Qué ve |
|---|---|
| `pendiente` o `en_curso`, owner | `/empezar`, en el paso donde iba |
| `pendiente` o `en_curso`, no owner | El chat, con un aviso |
| `listo` | El Studio normal |
| `omitido` | El Studio normal, con un aviso para retomarlo |

**Base.** `accounts.tipo`, adelantando la columna de `MARCAS.md` con los 5 tipos de §3
(`persona`, `servicios`, `producto`, `alto_valor`, `local`), y la tabla `marca_analisis`:
entradas, permiso (quién y cuándo), evidencia, estado de cada dato, conversación, brief y
error. Con RLS.

**Método.** `METODO-MARCAS.md`, con fuentes, y su versión corta en código por tipo. Neutro,
sin nada de Plogy, como pide la fábrica neutra.

**Motor, en `src/engine/onboarding/`:**

| Archivo | Qué hace |
|---|---|
| `requisitos.ts` | **La lista de §4 como código:** común, por tipo y clase de cada dato |
| `metodo.ts` | Lo que el Estratega sabe de cada tipo de marca |
| `captura.ts` | Interfaz propia con Firecrawl detrás |
| `medir.ts` | Color, logo y fuentes |
| `corpus.ts` | Une web, posts y archivos, cada trozo con su fuente |
| `extraer.ts` | Llena la lista con evidencia y comprueba las citas |
| `estratega.ts` | Siguiente pregunta, ayuda, opciones y relleno |
| `brief.ts` | Escribe el brief y lo reparte en las tablas |
| `kit-fabrica.ts` | Tiñe la familia elegida y crea y activa el kit |
| `primer-post.ts` | Lanza la pieza con material cerrado y control de tiempo |
| `cifras.ts` | Revisa que toda cifra del post exista en el brief |

**Cambios en lo existente:**

- `claude/messages.ts`: clave de plataforma mientras haya saldo. Es el cambio más delicado:
  un descuido hace que cualquier cuenta gaste de Plogy. Va con pruebas y corte duro.
- `content/criterio.ts`, `content/revisor.ts` y los prompts de escritura: modo de material
  propio (§8) y opinión en singular (§3).
- `publish/meta.ts`: leer posts con imagen.
- `empresas.ts`, `app/page.tsx`, `dashboard-shell.tsx`: la puerta.
- `panel-pieza.tsx`: descargar.
- Textos de registro y bienvenida: "tu marca" en vez de "tu empresa".

**Pantallas:** `app/(acceso)/empezar/` con tipo, entrada, conversación, generación y entrega.
Antes de programarlas, un prototipo HTML como `prototipo-chat-pieza.html`.

**Lo que sale del onboarding:** importador de kits, diseñador libre, direcciones de diseño y
prueba del criterio como pantalla. Los dos primeros siguen en Marca.

## 12. Cómo saber si funciona

| Qué | Meta |
|---|---|
| De cerrar la conversación al post dibujado | **Menos de 5 minutos, 9 de cada 10 veces** |
| Datos inventados en el post | 0 |
| Opiniones atribuidas a una persona sin mostrárselas | 0 |
| Preguntas por onboarding | 7 con material, 10 sin material |
| Post que la persona subiría con cambios menores | 4 de cada 5 |
| Marca sin nada: la persona dice que el brief la representa | 4 de cada 5 |
| El relleno contra lo que la marca decidiría de verdad | Personas lo juzgan a ciegas |
| Marca personal: suena a esa persona, no a una empresa | Lo juzga la propia persona |
| Personas que terminan el flujo | Se mide desde el primer día |

Son metas mías. La calidad la juzgan personas, a ciegas, no un modelo.

## 13. Orden de trabajo

Cada fase termina en algo que se puede probar.

### Fase 0. El método y la prueba

Sin tocar el Studio.

- **Paso 0 corto:** el método por tipo de marca, con fuentes, en `METODO-MARCAS.md`.
- **Prueba con 5 casos:** Plogy (servicios), un negocio local del banco, una marca personal
  sin relación con Plogy, la de Luciano sin mirar su empresa y una marca que no tenga nada,
  con alguien que de verdad esté empezando.
- **Se comprueba:** si la lista alcanza, si el relleno sale con carácter, si el criterio sirve
  en una marca personal, si el modo de material propio evita inventar y cuánto tarda todo de
  punta a punta.
- **Firecrawl gratis** y lectura de LinkedIn.

**Sale con:** el método, la lista final, los tiempos reales y un sí o un no. Si el relleno
sale genérico, se corrige el método antes de construir nada.

### Fase 1. Las plantillas de fábrica

Las 3 familias, paletas, pares de fuentes y `kit-fabrica.ts`.

**Sale con:** un kit teñido para cada caso de prueba y piezas que Luciano aprueba. Va tan
temprano porque es lo más riesgoso: si no convencen, no hay producto.

### Fase 2. Brief y post, con datos a mano

Puerta, tipos, clave de plataforma con tope, formulario con la lista, brief, modo de material
propio, opinión en singular, cifras, reloj y descarga.

**Sale con:** de datos ya escritos a post dibujado en menos de 5 minutos, con una empresa y
con una marca personal.

### Fase 3. El Estratega

La conversación con las tres ayudas y "Rellenar todo". Va antes que la extracción a propósito:
una marca sin nada ya puede completar el flujo, y es el caso más difícil.

**Sale con:** una persona sin web que termina con brief y post.

### Fase 4. Extraer

Firecrawl, PDF, corpus, medición e Instagram.

**Sale con:** la lista llena sola con evidencia, y el Estratega preguntando solo lo que falta.

### Fase 5. Abrir

Captcha, tope diario y pruebas con personas que no conozcan el Studio: una empresa, una marca
personal y alguien sin nada. Después, encender el interruptor.

**Sale con:** las metas de §12 medidas con gente real.

### Después

Marcas personales como cuentas hijas (`MARCAS.md`), subir de nivel con el importador, "volver a
analizar" sin pisar lo confirmado, revisar lo propuesto en el chat y respuestas por nota de voz.

## 14. Decisiones pendientes

1. **¿Quién paga las primeras llamadas?** Recomiendo clave de plataforma con tope. Falta definir
   cuánto incluye y qué pasa al acabarse.
2. **¿Qué formato tiene el primer post?** Recomiendo carrusel de Instagram para todos, y que una
   marca personal pueda elegir un post de LinkedIn para copiar, porque suele ser su red principal.
3. **¿Fotos de stock?** Recomiendo que no en el primer post. `MARCAS.md` dejó fuera las fotos de
   personas del equipo, pero aquí la persona sube las suyas a su propia biblioteca.
4. **¿Se puede saltar?** Recomiendo que no haya botón visible. "Rellenar todo" ya resuelve al que
   tiene prisa, y "Seguir sin esto" solo aparece si algo falla.
5. **Pagar Firecrawl.** $19 al mes tras la Fase 0.
