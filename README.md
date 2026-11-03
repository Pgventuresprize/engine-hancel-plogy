# Plogy Studio

Motor de investigacion de contenido sobre tecnologia, IA, startups y venture
capital. Investiga multiples fuentes, guarda los hechos en Supabase y produce
insumos para contenido original y oportuno.

Proyecto Next.js 16 (App Router, Node) en la raiz del repositorio: el motor y su
interfaz viven juntos. Base de datos: proyecto Supabase `iddjepduokjysnibjjqy`.

## Que hace

Busca noticias, las analiza y las puntua, decide un angulo editorial y escribe el
contenido para cada red. Dibuja las imagenes y publica, cada canal a su horario.
Todo corre aqui: no hay webhooks ni herramientas externas orquestando nada.

Cada paso es un **agente** con su modo, su horario, su prompt y su modelo,
configurables desde la aplicacion.

- **[MOTOR.md](MOTOR.md)** — que hace cada pieza, cuando corre y cuanto tarda.
  Los tiempos son medidos.
- **[FLUJO.md](FLUJO.md)** — el mismo recorrido en un diagrama.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena los valores
npm run dev                  # http://localhost:3000
```

## Variables de entorno

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx   # lectura de noticias
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # motor y configuracion
SERPER_API_KEY=xxx                            # busqueda de noticias
INGEST_SECRET=<openssl rand -hex 32>          # protege /api/ingest
ANALYSIS_ROUTINE_URL=https://api.anthropic.com/v1/claude_code/routines/<id>/fire
ANALYSIS_ROUTINE_TOKEN=sk-ant-oat01-xxx       # sin el prefijo "Bearer"
LINKEDIN_CLIENT_ID=xxx                        # publicar en LinkedIn
LINKEDIN_CLIENT_SECRET=xxx
LINKEDIN_REDIRECT_URI=https://<host>/api/auth/linkedin/callback
ANGLE_ROUTINE_URL=…/routines/<id>/fire        # etapa 2: angulo
ANGLE_ROUTINE_TOKEN=sk-ant-oat01-xxx
LINKEDIN_ROUTINE_URL=…/routines/<id>/fire     # etapa 2: post
LINKEDIN_ROUTINE_TOKEN=sk-ant-oat01-xxx
INSTAGRAM_ROUTINE_URL=…/routines/<id>/fire    # etapa 2: carrusel
INSTAGRAM_ROUTINE_TOKEN=sk-ant-oat01-xxx
```

**Ninguna lleva prefijo `NEXT_PUBLIC_`, a proposito.** `raw_news` y
`pipeline_runs` tienen RLS deshabilitado, asi que esas claves equivalen a acceso
total. Todo se lee y escribe en el servidor; nada llega al navegador.

Las tablas de configuracion (`engine_categories`, `engine_segments`,
`agent_settings`, `engine_settings`, `engine_secrets`, `pipeline_events`) **si**
tienen RLS activo y sin politicas: solo entra `service_role`. `engine_secrets`
guarda los tokens de Claude y de Serper, y la clave publicable no debe poder
leerlos.

## La interfaz

| Ruta                 | Que es                                                        |
| -------------------- | ------------------------------------------------------------- |
| `/engine`            | Consola en vivo: lanza corridas y las ve ocurrir              |
| `/engine/config`     | Taxonomia editable: categoria → segmento → keyword            |
| `/engine/schedule`   | Horario de ejecucion automatica                                |
| `/engine/routines`   | Rutinas de Claude (webhook + token)                            |
| `/engine/graph`      | Grafo categoria → segmento → noticia                          |
| `/noticias`          | Todas las noticias con todos sus campos y el articulo completo |
| `/contenido`         | Estudio: candidatas, angulos y piezas generadas                 |
| `/contenido/config`  | Variables de marca, umbral de score y modo                     |
| `/contenido/cola`    | Los buzones en crudo, para diagnosticar                        |
| `/api/auth/linkedin/*` | OAuth de LinkedIn: conectar la cuenta que publica            |
| `/api/render/preview` | Previsualiza una lamina del carrusel para ajustar el diseño   |
| `/pipeline`          | Historial de corridas                                          |
| `/api/ingest`        | Dispara la Etapa 1 desde un scheduler (requiere secreto)       |
| `/api/engine/stream` | Corrida con eventos en streaming (usa la consola en vivo)      |

### La consola en vivo no simula nada

El centro es una **red de coautoria**, al estilo de las redes de Medline: una
maraña densa sobre blanco, con la masa en carmin y los racimos de la periferia
en el color de su categoria. Cada punto es una noticia real del corpus y cada
concentrador un segmento; el tamaño del concentrador crece con lo que ha traido.

En reposo dibuja lo que ya hay en la base. Durante una corrida, **cada busqueda
que responde hace brotar en su sector tantos nodos como noticias trajo de
verdad**, con sus aristas dibujandose hacia el centro. Los concentradores en
vuelo laten; los que fallaron se marcan en rojo. Con el motor parado no entra un
solo nodo.

Los sectores de cada segmento se solapan a proposito: asi las categorias se
funden en una sola masa en vez de verse como porciones de tarta, que es lo que
da la textura de red. La estructura local sigue ahi para quien la busque.

La colocacion es determinista (ruido sembrado, no `Math.random`): la red se
dibuja igual en cada render, o cambiaria de forma sola al llegar cada resultado.

Lo unico que se mueve siempre es la deriva lenta del conjunto, que es ambiente
del lienzo. Todo lo demas responde a trabajo real.

El transporte es SSE: `/api/engine/stream` ejecuta la corrida dentro de la
peticion y va empujando cada evento segun ocurre. Los mismos eventos se guardan
en `pipeline_events` para poder revisar corridas pasadas.

Dos modos: **Ensayo** busca de verdad pero no escribe nada (util para probar sin
tocar produccion ni gastar cuota de escritura), y **Ejecutar** hace la corrida
completa.

## Etapa 1 — Ingesta

```bash
npm run ingest              # corrida real
npm run ingest -- --dry-run # busca y reporta, sin escribir nada
```

1. Abre una fila en `pipeline_runs` con `status: running`.
2. Lanza las busquedas activas **en paralelo y aisladas**: si una falla, las
   demas siguen y el error queda en el resumen.
3. Normaliza y descarta lo que no trae link o titulo.
4. Colapsa links repetidos e inserta con `ON CONFLICT DO NOTHING` sobre el
   UNIQUE de `link`.
5. Deduplica por titulo entre **todo lo del dia** y borra lo repetido.
6. Cierra la corrida con `raw_inserted`, `duplicates_removed` y `ended_at`.

La deduplicacion de aqui compara conjuntos de palabras (Jaccard > 0.6) dentro de
cada categoria y en español apenas acierta: sobre 171 pares de titulares del
mismo hecho detecto 0. El filtro que si funciona esta en la etapa de angulo, y
agrupa por el hecho, no por las palabras. Ver [MOTOR.md](MOTOR.md).

### Taxonomia

Las busquedas **ya no estan en el codigo**: viven en `engine_categories` y
`engine_segments` y se editan en `/engine/config`.

- **Categoria** — el nicho. Su slug se escribe en `raw_news.niche`, por eso no
  se puede cambiar despues de crearla.
- **Segmento** — el tema dentro de la categoria. Se escribe en `raw_news.tema` y
  `query_used`.
- **Keyword** — la consulta literal que recibe Serper, junto con idioma, pais,
  numero de resultados y ventana temporal.

Categorias y segmentos se activan y desactivan por separado; el motor solo corre
segmentos activos dentro de categorias activas. Si no hay ninguno configurado,
cae al respaldo de [`src/engine/config.ts`](src/engine/config.ts).

### Analisis

Lo hace el agente de analisis en el tick, no la ingesta: Composio trae el
material de la web y Claude solo lo lee y lo puntua. La ingesta se limita a
dejar las noticias en cola. Ver [MOTOR.md](MOTOR.md).

### Programacion

Los horarios ya no son de la ingesta sino de cada agente, y se editan en su
ficha dentro de **Agentes**. Se escriben como se dicen —`9:00, 9:20, 18:00`—,
cada uno con su minuto propio. La zona horaria es de la cuenta y vive en
*Configuracion → General*. Ver [MOTOR.md](MOTOR.md).

## Etapa 2 — Generacion de contenido (LinkedIn)

De una noticia analizada a un post listo para revisar. Dos agentes encadenados:

```
noticia analizada
   ↓  la app encola en jobs_angle y avisa por webhook
[Rutina de angulo]    decide angulo, tesis y formato
   ↓  la app materializa content_angles y encola en jobs_linkedin
[Rutina de LinkedIn]  escribe el post
   ↓
content_pieces        listo para revisar en /contenido
```

La publicacion a LinkedIn **no** es parte de esta etapa: el pipeline termina en
`generated` y la revision ocurre dentro de Plogy Studio.

### El patron buzon

Un agente tiene un prompt fijo, asi que los datos variables no pueden viajar en
el webhook. Viajan en una tabla:

1. La app crea una fila con `input` y `status = 'pending'`.
2. La app dispara el webhook. El aviso solo dice "despierta y revisa la cola";
   no lleva el trabajo ni trae el resultado.
3. El agente procesa las filas `pending` que le toquen, escribe
   `respuesta` y marca `done` o `failed`.
4. La app materializa la respuesta en las tablas limpias.

Las tablas `content_*` **las escribe siempre la app**, nunca el agente: asi hay
un solo escritor por tabla y una respuesta con forma inesperada se marca
`failed` con el motivo en lugar de meter filas basura.

### Como se entera la app

No hay Supabase Realtime, y no lo habra mientras `raw_news` tenga RLS
deshabilitado: haria falta una clave `NEXT_PUBLIC_` en el navegador, y esa clave
da escritura sobre todo el corpus.

En su lugar, la misma maquinaria que ya dispara el cron. Triggers sobre los dos
buzones y sobre `raw_news`, que llaman por `pg_net` a `/api/content/tick`:

```
el agente marca 'done'  →  trigger  →  pg_net POST /api/content/tick  →  runContentTick()
```

`runContentTick()` es una pasada idempotente: toma lo que este hecho y sin
consumir, lo materializa, encadena lo que toque y sale. Recibir el aviso dos
veces es inofensivo — las filas se reclaman con un compare-and-set sobre
`consumed_at`, asi que dos pasadas solapadas no duplican nada. Un `pg_cron` cada
cinco minutos hace de red de seguridad por si `pg_net` o el despliegue fallan.

Se monta una vez, con la URL del despliegue:

```sql
select public.configure_content_tick('https://<host>/api/content/tick');
```

### El contrato del buzon

Los agentes viven aqui: su prompt esta en `src/engine/content/agentes.ts` y se
puede editar desde la ficha de cada agente. Lo que se guarda en la base es solo
el prompt editado; mientras no se toque, manda el del codigo y las mejoras de
cada despliegue llegan solas.

Lo que sigue siendo un contrato es la forma de `input` y `respuesta` en los
buzones: la app escribe `input`, el agente escribe `respuesta`, y `parse.ts`
comprueba que tiene la forma esperada. Si cambia, el trabajo se marca `failed`
con el motivo en vez de materializar algo roto.


### Las variables

La capa de personalizacion **no es texto libre** que se le pase al modelo como
instruccion: son selectores y campos acotados que rellenan ranuras que el prompt
base dejo abiertas. Esa es la defensa contra que se rompa el criterio editorial.

Se editan en `/contenido/config`, se guardan una vez en `generation_config` y se
inyectan en cada job. Hay ademas override puntual por generacion, que se aplica
encima sin modificar la configuracion guardada.

### Seleccion de noticias

- **Manual** (por defecto): tu eliges que noticias convertir.
- **Automatico**: una noticia que supere el umbral arranca el pipeline sola.

El **umbral nace sin definir** a proposito: el scoring lo decide el usuario desde
la interfaz, y sin el, el modo automatico no selecciona nada. El modo automatico
toma como mucho `MAX_AUTO_POR_TICK` noticias por pasada — un limite tecnico para
que una peticion no intente encolar cientos de trabajos, no un criterio
editorial; lo que no entra ahora entra en la siguiente pasada.

**Al margen de todo esto**, enviar cualquier noticia al pipeline a mano esta
disponible siempre, desde `/noticias` y desde las candidatas, sin importar el
modo ni el umbral.

### Diagnostico

`/contenido/cola` muestra los dos buzones en crudo: estado, `input`, `respuesta`
y el error si lo hubo, con un boton para reintentar un trabajo fallido y otro
para forzar una pasada. No hay reintento automatico a proposito: un prompt que
falla reintentado en bucle quema cuota sin converger.

### Elegir la red

Cada angulo ofrece **Generar post** (LinkedIn) y **Generar carrusel**
(Instagram), y las dos se piden por separado. Tener ya el post no impide generar
el carrusel del mismo angulo: esa es justamente la razon de decidir el angulo una
sola vez y aparte — las dos redes heredan la misma tesis y salen coherentes.

El boton de cada red se apaga cuando esa pieza ya existe, no cuando existe
cualquiera.

> El **modo automatico** sigue encolando solo LinkedIn al aparecer un angulo. Si
> se quiere que genere tambien el carrusel, hay que decidirlo: son dos agentes
> por noticia en vez de una.

### Carrusel de Instagram

La agente de Instagram devuelve el guion; la app lo convierte en imagenes reales
y las deja en URLs publicas. **Publicar en Instagram no es parte de esto** — el
modulo termina con las imagenes subidas y la pieza lista para revisar.

```
jobs_instagram.respuesta   guion: caption, hashtags y slides en orden
        ↓  el tick lo drena, igual que las otras redes
render (Satori)            un PNG de 1080x1080 por slide
        ↓
Supabase Storage           bucket publico `carousels`
        ↓
content_pieces             network 'instagram', payload con las URLs en orden
```

#### El contrato

```jsonc
{ "raw_news_id": "...", "slide_count": 5,
  "caption": "...", "hashtags": ["...", "..."],
  "slides": [
    { "n": 1, "type": "photo_hook", "hook": "..." },
    { "n": 2, "type": "text", "title": "...", "body": "..." }
  ] }
```

El array va en orden y **ese es el orden del carrusel**. El primer slide es
`photo_hook` y el resto son `text`.

Todas las fotos salen del banco, la portada incluida: la imagen que trae Serper
es una miniatura de unos 300px que al escalarla a 1080 se ve blanda, y ademas es
la misma que sale en cualquier agregador. Van desaturadas para no romper la
serie monocroma.

Instagram no admite carruseles de mas de 10, asi que lo que sobre se recorta. Si
llegan menos de 2 slides utiles, el trabajo se marca `failed` con el motivo, como
con las otras agentes.

#### La lamina de cierre

Un interruptor en `/contenido/config` añade una lamina final a todos los
carruseles, con su titulo y su texto, sobre una foto muy velada.

Va aparte del guion que escribe la agente a proposito: es una constante de la
marca, no contenido de la noticia, y no tiene sentido pedirsela al modelo cada
vez. Si el guion ya llega al tope de Instagram, se recorta uno para hacerle
sitio en vez de pasarse de diez.

Nace apagada.

#### El motor de render

Se dibuja con **Satori**, via `next/og`: renderiza un arbol de React a PNG sin
navegador. Se eligio sobre Puppeteer porque en serverless un Chromium son
cientos de megas y varios segundos de arranque por invocacion; esto tarda un
segundo por imagen y ya viene con Next.

El precio es que Satori entiende **un subconjunto de CSS**: hay flexbox pero no
grid, y todo div con varios hijos necesita `display: flex` explicito. Las
plantillas de [`templates.tsx`](src/engine/render/templates.tsx) estan escritas
para eso; conviene recordarlo antes de tocarlas.

#### Ajustar el diseño

Las paletas son **estrictamente blanco y negro** —`negro`, `blanco` y `carbon`—
sin acento de color: en un feed saturado una serie monocroma se reconoce de un
vistazo, y el contraste puro deja el peso en la tipografia y en la foto. El
acento sigue existiendo (la barra de la cita, el numero grande, el punto de la
marca) pero es el propio blanco o negro, asi que marca por contraste y no por
tono.

Todo lo que un diseñador querria cambiar vive en
[`theme.ts`](src/engine/render/theme.ts): paleta, escala tipografica y margenes.
Las plantillas no llevan colores ni tamaños propios.

Para verlo sin generar un carrusel entero hay una ruta de previsualizacion:

```
/api/render/preview?tipo=portada&hook=...&foto=https://...
/api/render/preview?tipo=texto&title=...&body=...&n=2&total=5
```

#### Fuentes

Viven en [`src/engine/render/fonts/`](src/engine/render/fonts) y se declaran en
`theme.ts`. Ahora mismo solo **HeroFont** (light, regular, semibold, bold), pero
añadir otra familia es dejar sus cuatro pesos ahi y sumarla a `FUENTES`.

Satori admite **TTF, OTF y WOFF**; WOFF2 no, que es la trampa clasica. Y como las
fuentes se leen del disco por ruta y nadie las importa, hay que declararlas en
`outputFileTracingIncludes` de `next.config.ts` o el trazado de Vercel no las
empaqueta: el render funcionaria en local y fallaria en produccion.

#### Cuando la foto falla

Si `raw_news.image_url` no existe, no responde, no es un mapa de bits o pesa
demasiado, la portada se dibuja **sobre fondo liso** en vez de romper el
carrusel, y la pieza queda marcada con `portadaSinFoto` para poder revisarlo. La
descarga nunca lanza: una portada sin foto sigue siendo una portada, pero un
carrusel a medias no es nada.

#### Tamaños de letra fijos

Un titulo mide lo mismo en todas las laminas, y lo mismo una descripcion. Antes
la letra encogia segun el largo del texto, y eso hacia que cada lamina tuviera su
propia escala y el carrusel se leyera desparejo.

El precio de esa consistencia es que un texto muy largo hay que recortarlo, con
puntos suspensivos y por palabra: Satori no ajusta el texto al hueco, lo desborda
y lo corta contra el borde. Los topes estan en `TOPES`, en `theme.ts`, y cambian
segun el hueco de cada composicion.

### Publicar el carrusel: Instagram via Buffer

Los carruseles se publican a traves de **Buffer**, no contra la Graph API de
Meta. Esta exige cuenta business vinculada a una pagina de Facebook, revision de
la app y un token de larga duracion que hay que renovar; Buffer ya tiene esa
relacion resuelta y expone una sola llamada.

```
BUFFER_API_KEY=xxx
BUFFER_CHANNEL_ID=xxx
```

El canal va en el entorno y no en la interfaz: la cuenta ya esta conectada en
Buffer, y elegirla tambien aqui seria configurar dos veces lo mismo. El id es el
que aparece en la URL del canal:

```
https://publish.buffer.com/channels/<BUFFER_CHANNEL_ID>/schedule
```

Sin la variable se cae al primer canal de Instagram que devuelva Buffer, lo cual
sirve mientras solo haya uno. **Con varias cuentas conectadas hay que fijarla** o
se publicaria en la que no toca.

#### Lo que hubo que averiguar

La REST v1 de Buffer esta retirada para estos tokens —responde *"Public API
tokens are not accepted for REST API access"*— asi que se usa su **GraphQL** en
`https://api.buffer.com` con `Authorization: Bearer`.

Dos cosas que la documentacion no dice y salieron probando contra la API:

- **El carrusel no se declara.** Instagram rechaza `type: "carousel"`
  explicitamente (*"Valid types are post, story, or reel"*): se manda como
  `post` con varios `assets`, y el carrusel se infiere.
- **Buffer descarga las imagenes para validarlas**, asi que necesita URLs
  publicas —las del bucket `carousels` sirven tal cual— y rechaza las que pasan
  de 5.000 px de ancho. Los 1080x1080 del carrusel entran sin problema.

Los errores llegan dentro de la respuesta con su propio `__typename`, no como
codigo HTTP: un fallo devuelve 200 igual, y hay que mirar el cuerpo.

## Etapa 3 — Publicar en LinkedIn

La pieza generada se publica en el feed de una cuenta conectada por OAuth. Dos
modos, como en la generacion:

- **Manual** (por defecto): el boton **Publicar** de cada pieza en `/contenido`.
- **Automatico**: el interruptor de `/contenido/config`. Cada post generado se
  publica **sin que nadie lo lea antes**. Nace apagado y no se puede encender
  sin una cuenta conectada.

### Conectar la cuenta

```
LINKEDIN_CLIENT_ID=xxx
LINKEDIN_CLIENT_SECRET=xxx
LINKEDIN_REDIRECT_URI=https://<host>/api/auth/linkedin/callback
```

El redirect tiene que estar dado de alta **tal cual** en la app de LinkedIn
Developers, pestaña Auth. LinkedIn solo admite `https`, asi que la conexion se
hace desde el despliegue, no desde `localhost`.

Con eso, **Conectar LinkedIn** en `/contenido/config` lanza el flujo de 3 patas:

```
/api/auth/linkedin/start     genera un `state`, lo guarda en cookie httpOnly
   ↓                          y manda al usuario a LinkedIn
LinkedIn                     el miembro autoriza (en el dominio de LinkedIn)
   ↓
/api/auth/linkedin/callback  compara el `state`, cambia el codigo por el token,
                             lee /v2/userinfo y guarda la cuenta
```

Permisos que se piden: `openid profile w_member_social`. Los dos primeros son
para leer el `sub` de `/v2/userinfo`, que es el id con el que se arma el URN del
autor; el tercero es el permiso de publicar en nombre del miembro, abierto a
cualquier app.

El token se guarda en `linkedin_account` porque el modo automatico publica
cuando no hay nadie delante — una sesion de navegador no serviria.

### Caducidad: hay que reconectar a mano

LinkedIn emite tokens de **60 dias** y los *refresh tokens programaticos estan
restringidos a partners*. Sin ese permiso no se puede renovar por codigo: hay que
volver a pasar por **Reconectar**, que es transparente si la sesion de LinkedIn
sigue abierta. La tarjeta de `/contenido/config` avisa una semana antes y marca
la cuenta como caducada cuando pasa.

### Cuando se publica: horas y tandas

`/contenido/config` tiene una seccion por red. Cada una va por su cuenta: se
puede tener LinkedIn publicando a diario e Instagram parado.

- **Horas**: las tandas del dia, en la zona de `engine_settings` — un solo huso
  para toda la aplicacion.
- **Minuto**: comun a todas las horas de esa red.
- **Piezas por tanda**: cuantas se publican en cada una. Si no hay tantas listas,
  se publica lo que haya.
- **Sin horas y encendido**: publica en cuanto hay una pieza lista. Es lo que
  hacia el viejo interruptor de autopublicar, que se ha retirado por duplicado.

Se ejecuta desde el mismo tick que drena las colas, asi que funciona sin nadie
delante. Como el tick pasa cada cinco minutos, la misma hora programada se
evalua varias veces: `last_batch_at` es lo que impide repetir la tanda, y se
compara por hora local porque el disparo nunca cae en el mismo segundo.

La tanda se cierra aunque alguna pieza falle: reintentarla entera cinco minutos
despues republicaria las que si salieron.

Las dos redes publican de verdad: LinkedIn contra su propia API e Instagram a
traves de Buffer.

### Como se publica

`POST https://api.linkedin.com/rest/posts` con `Linkedin-Version` y
`X-Restli-Protocol-Version: 2.0.0`. El texto va en `commentary` (hook, cuerpo y
hashtags, en ese orden) y el `author` es el URN de la persona. LinkedIn responde
`201` y devuelve el id del post **en la cabecera `x-restli-id`**, no en el
cuerpo; ese URN se guarda en `content_pieces.linkedin_urn` y con el se arma el
enlace al post.

Los posts llevan **siempre una imagen**: el titular sobre una foto de banco
velada, en 1200x627, que es la proporcion que LinkedIn muestra sin recortar. La
foto se busca con los mismos criterios que el carrusel — el tema concreto de la
noticia, nunca su nicho.

LinkedIn no acepta una URL para la imagen: hay que registrar la subida
(`/rest/images?action=initializeUpload`), mandar los bytes a la direccion que
devuelve y usar el URN resultante en `content.media`. Si cualquiera de esos pasos
falla, el post sale igual solo con texto: perder la pieza por la ilustracion
seria absurdo.

Publicar no lanza nunca: el fallo se guarda en `content_pieces.publish_error` y
se ve bajo la pieza. La guarda contra publicar dos veces es `published_at`.

En automatico se publica desde el mismo tick que drena las colas, con un tope de
tres por pasada — LinkedIn limita el ritmo y no hay ninguna prisa.

## ⚠ El dashboard no tiene autenticacion

Cualquiera que alcance la URL puede ver las noticias, editar la taxonomia,
leer que agentes existen y **lanzar corridas** (que gastan cuota de Serper y
escriben en la base). `/api/engine/stream` solo comprueba que la peticion venga
del mismo origen, lo cual frena llamadas cruzadas pero no es autenticacion.

Mientras no haya login, no publiques esto en una URL abierta.

## Estructura

```
scripts/
  ingest.ts              CLI de la Etapa 1
src/
  app/
    api/engine/stream/   SSE: corrida con eventos en vivo
    api/ingest/          Endpoint para schedulers
    engine/              Consola, taxonomia, agentes, grafo
    engine/actions.ts    Server Actions de configuracion
    noticias/ pipeline/  Lectura de resultados
  engine/                EL MOTOR (no depende de Next: corre tambien en Node)
    config.ts            Constantes y respaldo de busquedas
    taxonomy.ts          Carga la taxonomia desde la base
    schedule.ts          Horario: decide si al cron le toca correr
    serper.ts            Cliente de Serper News
    normalize.ts         Serper -> filas de raw_news
    dedupe.ts            Similitud de titulos (debil en español)
    events.ts            Traza de la corrida (vivo + pipeline_events)
    routines.ts          Invocacion de webhooks de Claude
    ingest.ts            Orquesta la corrida completa
    supabase-admin.ts    Cliente service-role
  components/engine/     Consola en vivo, nucleo, grafo, editores
  lib/
    engine-data.ts       Lecturas de configuracion y datos del grafo
    news.ts              Consultas de noticias
```

`src/engine/` no importa nada de Next a proposito: el mismo codigo corre desde
la CLI, desde el endpoint y desde cualquier runner.

## Datos

| Tabla                | Contenido                                       |
| -------------------- | ----------------------------------------------- |
| `raw_news`           | Noticias, con `full_content` cuando se descargo  |
| `pipeline_runs`      | Corridas del motor                               |
| `pipeline_events`    | Traza fina de cada corrida                       |
| `engine_categories`  | Categorias (nichos)                              |
| `engine_segments`    | Segmentos y sus keywords                         |
| `engine_routines`    | Rutinas de Claude (webhook + token)              |
| `engine_settings`    | Horario de ejecucion automatica                  |

## Nota sobre `src/hooks/use-mobile.ts`

La version que genera shadcn hace `setState` dentro de un efecto, lo que falla el
lint de `react-hooks`. Esta reescrito con `useSyncExternalStore`. Si se
reinstalan componentes de shadcn, conviene no dejar que lo sobrescriba.
