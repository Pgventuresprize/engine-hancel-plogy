# Marcas y personas dentro de una empresa

Plan acordado el 2026-10-19, ampliado el 2026-10-20 con las personas del
equipo y el 2026-10-22 con el cambio de enfoque, la investigacion previa y el
equipo de agentes conversacionales. Nada de esto esta construido todavia.

## Orden general

1. **Paso 0 — Investigar como se construyen las marcas** y dejarlo escrito
   como metodo, para cualquier tipo de marca.
2. **Revisar con ese metodo** las decisiones de herencia marcadas abajo.
3. **Fases 1 a 8:** la estructura en Hancel (personas, marcas hijas,
   conexiones, autonomia).
4. **Equipo de agentes conversacionales:** la interfaz principal donde se da
   direccion, se planea y se crea.
5. **Estrategias para Plogy y sus marcas**, hechas dentro de Hancel, con el
   metodo y con el equipo de agentes.

## Que se quiere

Una empresa (Plogy) tiene dos cosas nuevas:

- **Marcas.** La de la empresa y las marcas personales de su gente (Luciano,
  Juan Francisco). Cada marca publica en sus propias redes. Cualquier miembro de
  Plogy entra con su usuario, elige la marca y crea contenido para ella.
- **Personas del equipo.** Gente de Plogy que aparece en el contenido: narra
  una pieza o protagoniza un video que despues graba de verdad. No inician
  sesion ni tienen redes; tienen un perfil configurable (rol, temas, tono, como
  habla).

Las marcas personales y las personas existen para ganar audiencia y
retencion: la gente sigue a personas.

**Una marca personal es personal** (2026-10-22). No es contenido de Plogy
firmado por alguien: la persona es la marca, y su contenido es suyo, con su
historia, sus opiniones y su forma de ver las cosas. El embudo termina ayudando
a Plogy, porque la audiencia que confia en Luciano llega a Plogy, pero eso es
el destino del embudo, no el tema de cada pieza.

Por eso algunas decisiones de herencia de abajo quedan **por revisar con el
metodo del Paso 0**:

- El orden y el peso de los pilares en el prompt. El plan decia "primero los de
  Plogy"; lo probable es primero los personales, con Plogy como uno de sus
  temas.
- Cuanto y como menciona a Plogy una marca personal (`relacion_empresa`).
- Si los CTA de Plogy se heredan, o si cada marca tiene su propio embudo hacia
  Plogy.

Lo que no cambia: las reglas, las frases prohibidas y los temas vetados de
Plogy siguen aplicando. Una marca personal del equipo no puede dañar a la
empresa.

Decisiones tomadas:

| Tema | Decision |
|---|---|
| Pilares | Dos capas: los de Plogy (compartidos) y los de la marca personal |
| Redes | Cada marca publica en sus propias redes |
| Composio | Clave e IDs se configuran en la interfaz de la empresa; las marcas los heredan. Fuera del `.env` |
| LinkedIn | Se mantiene la conexion propia (ya funciona por cuenta); sus credenciales pasan a la interfaz |
| Noticias | Las marcas usan las noticias de Plogy por defecto; se puede encender un pipeline propio por marca |
| Visual | Todo compartido: plantillas, logo, paleta, biblioteca de fotos |
| Autonomia | Configurable por marca: genera sola o no, publica sola o no, requiere aprobacion o no |
| Personas: como salen | Narran la pieza en primera persona, y protagonizan guiones de video |
| Personas: quien elige | El agente propone segun los temas; quien crea la pieza la elige o la cambia |
| Persona y marca personal | La marca personal se arma sobre la persona: se define una vez |
| Personas: fotos | No por ahora. Los videos no se generan: se escriben guiones para grabarlos con la persona real |
| Enfoque | Cada marca personal es personal; el embudo ayuda a Plogy (2026-10-22) |
| Orden | Primero se investiga como se construyen las marcas; despues se diseñan las estrategias |
| Alcance | El metodo sirve para cualquier tipo de marca, no solo personales |
| Interfaz principal | Un equipo de agentes conversacionales para dar direccion, planear y crear |

## Paso 0 — Investigar como se construyen las marcas

Va antes de diseñar cualquier estrategia. El resultado es un **metodo
escrito** para crear y hacer crecer una marca correctamente, con fuentes y
casos reales, no de memoria.

### Que tiene que responder

- **Confianza.** Como se afianza una marca: que hace que alguien pase de verla a
  confiar en ella, y de confiar a comprar, contactar o recomendarla.
- **Conexiones.** Como se generan relaciones con la audiencia y con otras
  cuentas: conversacion, comentarios, colaboraciones, comunidad, mensajes
  directos.
- **Creacion.** Como se arranca una marca desde cero: posicionamiento, a quien
  le habla, de que es referente, su historia, sus pilares, sus formatos, su
  frecuencia.
- **Embudo.** Como pasa la audiencia de una marca personal a la empresa sin que
  el contenido se vuelva publicidad.
- **Medicion.** Que señales dicen que la marca funciona, mas alla del numero de
  seguidores.

### No solo marcas personales

Hancel es multimarca, asi que el metodo tiene que servir para cualquier tipo de
marca: una parte comun y lo que cambia por tipo. Punto de partida, a validar
con la investigacion:

| Tipo | Ejemplos | Lo que probablemente cambia |
|---|---|---|
| Persona | Luciano, Juan Francisco | La persona es la marca; la confianza viene de su historia y su criterio |
| Empresa de servicios / B2B | Plogy | Autoridad, casos, prueba, ciclo de venta largo |
| Producto de consumo | Ropa | Estetica, deseo, identidad, comunidad, lanzamientos |
| Compra de alto valor | Carros | Aspiracion, confianza en la decision, prueba social, postventa |
| Negocio local | Restaurante, tienda | Cercania, lugar, oferta, recurrencia |

### Que se hace con el metodo

- Se guarda en el repo como documento, con sus fuentes.
- Se convierte en el **oficio de fabrica** de los agentes, por tipo de marca:
  neutro, sin contenido de Plogy, como pide la fabrica neutra. Una marca nueva
  elige su tipo y arranca con el metodo de ese tipo. Conecta con la idea
  aparcada de una biblioteca de skills base que cada empresa copia y adapta.
- Con el se revisan las decisiones de herencia marcadas arriba.
- Es lo que usa el estratega del equipo de agentes (ver abajo).

## Equipo de agentes conversacionales

### Que es

La interfaz principal de Hancel: un espacio donde se conversa con un equipo de
agentes para **dar direccion a las ideas, planear y crear contenido a partir de
ellas**, dentro de la marca abierta.

Hoy no existe nada parecido. Los agentes de Hancel son pasos del pipeline que
corren por horario o a mano desde el tablero (`engine/agents/turno.ts`); no hay
ninguno con el que se pueda hablar.

### Que tiene que poder hacer

- **Dar direccion.** "Esta semana quiero empujar X", "esta idea va por aca y no
  por alla", "menos noticias y mas historia propia".
- **Planear.** Campañas, calendario, mezcla de pilares y formatos, que persona
  narra que.
- **Crear.** Pasar de una idea conversada a la pieza (post, carrusel, guion para
  grabar) usando los agentes que ya existen.
- **Trabajar dentro de la marca abierta.** Lee su perfil, pilares, personas,
  piezas y resultados. Nunca mezcla dos marcas.

### Se habla con todos los agentes

Desde la conversacion se puede hablar con **todos los agentes de Hancel**, no
solo con un equipo nuevo (pedido 2026-10-22). Cada agente del pipeline pasa a
tener dos modos: el de siempre (corre solo, por horario o a mano) y el
conversacional (se le pregunta, se le corrige, se le pide otra version).

Los que existen hoy (`lib/agentes-catalogo.ts` y `marca/bloque.ts`):

| Agente | Que hace hoy | Ejemplo de conversacion |
|---|---|---|
| Extraccion | Busca noticias de los temas de la taxonomia | "Busca esta semana sobre X" |
| Analisis | Lee cada noticia y le pone nota de 0 a 10 | "¿Por que esta noticia saco un 4?" |
| Angulo | La lectura no obvia de la noticia | "Dame tres angulos mas para esta" |
| Criterio | El punto de vista de la marca sobre la pieza | "Esto no es lo que pensamos, es asi" |
| LinkedIn | El post largo | "Reescribelo mas corto y menos formal" |
| Instagram | El guion del carrusel, lamina a lamina | "La lamina 3 sobra, junta 3 y 4" |
| Facebook | La pieza para Facebook | "Adaptalo para Facebook" |
| Revisor | Revisa las piezas contra las reglas | "¿Por que frenaste esta pieza?" |
| Redaccion | La noticia para el portal web | "Redacta esta para la web" |
| Ideas | Ideas para el estudio | "Diez ideas sobre este pilar" |
| Contenido | Las piezas del estudio | "Convierte esta idea en carrusel" |
| Guion | El guion de video (para grabar) | "Guion de 60 segundos para Juan Francisco" |
| Publicacion | Saca las piezas a cada red | "¿Que sale mañana y en que red?" |

Hablar con un agente usa **su mismo prompt** (oficio, marca, contrato) y la
misma marca abierta: lo que dice en la conversacion es coherente con lo que
hace cuando corre solo. Lo que se le corrige en conversacion se puede guardar
como regla o ejemplo de la marca, con confirmacion.

### Agentes nuevos

Por definir con el metodo del Paso 0. Son los que hoy no existen:

| Agente | Rol |
|---|---|
| Estratega | Posicionamiento, embudo y direccion de la marca; aplica el metodo |
| Planificador | Calendario, campañas y mezcla de pilares, formatos y personas |
| Coordinador | Entiende lo que se pide y lo pasa al agente que toca, o a varios en orden |

### Como funciona el chat

Un solo chat, varias voces (pedido 2026-10-22):

- **Responde el agente que toca.** Segun lo que se pide, contesta uno u otro.
  Se pregunta por la nota de una noticia y contesta Analisis; en el mismo hilo
  se pide el post y contesta LinkedIn.
- **Se nota quien habla.** Cada mensaje lleva el nombre del agente y su propia
  marca visual (color e icono). Nunca queda la duda de quien dijo que.
- **Conversacion natural.** No hace falta saber como se llama cada agente ni
  usar comandos: se escribe como se le hablaria a un equipo, y el Coordinador
  decide a quien le toca. Si un pedido necesita a varios ("arma la semana de
  Luciano"), responden en orden en el mismo hilo, cada uno con su nombre.
- **Tambien se puede ir directo.** Con @ se le habla a uno en concreto
  ("@Revisor, ¿por que frenaste esto?"). Un agente que ya esta conversando
  sigue respondiendo mientras el tema no cambie.
- **Se puede preguntar por que respondio ese.** El Coordinador explica en una
  linea a quien le paso el pedido y por que, y se le puede pedir que lo pase a
  otro.
- **Lo que se crea queda enlazado.** Si un agente crea una idea, una pieza o un
  guion, el mensaje lleva su tarjeta con enlace a la pieza en el estudio.

### Conversaciones guardadas

- Cada conversacion se guarda, con su marca, su autor y la fecha.
- **Lista de conversaciones** por marca: titulo (lo pone el Coordinador a partir
  del primer pedido y se puede cambiar), ultima actividad y que agentes
  participaron.
- **Retomar:** se abre una conversacion vieja y se sigue donde quedo, con el
  contexto de lo hablado.
- **Buscar** en las conversaciones por texto, agente o fecha.
- **Fijar** las importantes (la de estrategia de la marca, por ejemplo) y
  **archivar** las que ya no sirven.
- Las conversaciones son del equipo: cualquier miembro de la empresa ve las de
  sus marcas y puede seguirlas.
- Desde una pieza se puede ver en que conversacion nacio.

Modelo de datos, tentativo:

- `conversaciones`: `id`, `account_id` (la marca), `creada_por`, `titulo`,
  `fijada`, `archivada`, `created_at`, `updated_at`.
- `mensajes`: `id`, `conversacion_id`, `rol` (`usuario` o `agente`), `agente`
  (cual respondio), `autor` (que miembro escribio), `contenido`,
  `referencias jsonb` (piezas, ideas o guiones creados), `created_at`.
- `studio_pieces`, `content_pieces` y `video_items` ganan `conversacion_id`
  nullable: de donde salio la pieza.

Las conversaciones largas no se mandan enteras al modelo en cada vuelta: se
resume lo viejo y se mandan los ultimos mensajes, o el consumo crece sin
techo.

### Acciones con efecto

Algunos agentes hacen cosas que cuestan o que se ven fuera: Extraccion gasta
Serper y Claude, Publicacion publica en redes reales. Desde la conversacion,
esas acciones **siempre piden confirmacion**, y Publicacion respeta la
autonomia de la marca: si requiere aprobacion, solo publica lo aprobado.

### Principios

- Lo que sale de la conversacion se guarda donde ya vive (ideas, piezas,
  ajustes de la marca). La conversacion no es un almacen paralelo.
- Nada se publica desde la conversacion sin pasar por la autonomia de la marca:
  si requiere aprobacion, requiere aprobacion.
- Los agentes del pipeline pasan a ser herramientas que el equipo puede llamar.
- Cambiar la direccion de fondo de la marca (pilares, voz, CTA) desde la
  conversacion pide confirmacion.

### Lo tecnico a resolver

- **Agente multi-vuelta con herramientas.** Es la "Opcion A" de
  `MIGRACION-IA-CLAUDE.md` (Agent SDK), que en su dia se freno por consumo. Hoy
  manda la calidad antes que el costo, pero el token de Claude es uno solo y lo
  comparten todas las marcas.
- **Historial.** Las tablas de conversaciones y mensajes de arriba, por marca.
  Ocupan base de datos: el plan gratuito tiene 1 GB, asi que hace falta una
  politica de limpieza (por ejemplo, archivadas de mas de N meses se borran o se
  resumen).
- **Enrutar.** El Coordinador decide quien responde con una llamada corta y
  barata antes de la respuesta del agente; esa decision se guarda en el mensaje
  para poder revisarla.
- **Interfaz.** Respuestas en streaming y los limites de duracion de Vercel.

### Orden

Despues del Paso 0, porque el estratega necesita el metodo. Puede arrancar con
la cuenta de Plogy sola; para trabajar por marca necesita las fases de marcas.

## Diseño

### Una marca es una cuenta hija

Todo el motor ya esta acotado por `account_id` (31 tablas) y una cuenta ya trae
aislado su contenido, sus conexiones de Composio, su LinkedIn, sus horarios y su
modo automatico/manual. Por eso una marca personal es **una cuenta con
`parent_id` apuntando a la empresa**, y no una columna `brand_id` nueva en cada
tabla (eso tocaria cientos de consultas: solo `raw_news`, `content_pillars` y
`studio_pieces` aparecen ya en ~60 consultas de 26 archivos).

Lo que hay que construir es la **herencia**:

| | Se hereda de la empresa | Propio de la marca |
|---|---|---|
| Acceso | Miembro de Plogy = acceso a todas sus marcas, con el mismo rol | — |
| Plan | El de la empresa (plan efectivo) | — |
| Claude, Serper, modelos | Heredados | Se pueden sobrescribir |
| Composio (clave, auth configs) | Heredados | Usuario de Composio propio, y con el sus redes |
| App de LinkedIn | Heredada | Su LinkedIn conectado (`linkedin_account`) |
| Identidad | Quien es Plogy, que hace, mensaje central (como contexto) | La de su persona: nombre, rol, historia, voz |
| Pilares | Los de Plogy, solo lectura | Los personales |
| Audiencias, CTA | Los de Plogy | Se suman los propios |
| Reglas, frases prohibidas, temas vetados | Los de Plogy (siempre aplican) | Se suman los propios |
| Visual | Todo: plantillas, logo, paleta, fotos, Canva | — |
| Personas | Todo el equipo de la empresa | — |
| Noticias | Las de Plogy, por defecto | Pipeline propio si se enciende |
| Autonomia | — | Toda: modo, horarios, aprobacion |

Un solo nivel: una marca hija no puede tener hijas.

### Una persona es un perfil de la empresa

Las personas viven en la empresa y cualquiera de sus marcas puede usarlas: en
una pieza de Plogy narra Maria, la agronoma; en la marca de Luciano puede
aparecer Juan Francisco.

Una marca personal **apunta a su persona** (`accounts.persona_id`): Luciano se
define una sola vez, como persona, y su marca toma de ahi el nombre, el rol, la
historia y la voz. La marca solo añade lo que es de marca: handle, pilares
personales, CTA, redes y autonomia. Asi no hay dos perfiles de Luciano que se
desincronizan.

Cada pieza puede llevar una persona que la narra (`persona_id`). Cuando la
lleva, la pieza se escribe en primera persona, con el tono de la persona; las
reglas, vetos y CTA de la marca siguen mandando. En una marca personal, la
persona por defecto es la duena de la marca.

### Los videos son guiones para grabar

Video studio no genera video: escribe guiones para que la persona real los
grabe. El formato de hoy (`videos/prompt.ts`) es para generar video con IA
(blocking en ingles, `CUT TO:`, `@tag`, voz `off-screen`) y no le sirve a
alguien que se pone delante de una camara. Hace falta un formato **para
grabar**:

- Gancho de los primeros segundos, escrito como lo diria esa persona.
- La estructura: los puntos, en orden, con la duracion de cada uno.
- El texto en sus palabras, listo para leer en un teleprompter.
- Indicaciones simples de grabacion: donde, que plano, que mostrar.
- Tomas de apoyo (b-roll) sugeridas.
- Duracion total y CTA final.

El personaje unico de hoy (`video_settings.personaje_tag` / `personaje_nombre`,
con `@juan` y "Juan" como valores de fabrica) se reemplaza por las personas.

## Fases

Cada fase deja algo que se puede probar. Las personas van antes que las marcas a
proposito: no dependen de la herencia y ya sirven en la cuenta de Plogy tal como
esta hoy. Las marcas personales, a su vez, necesitan a su persona.

### Fase 1 — Modelo de datos

Una migracion, idempotente, que solo añade:

**Personas**

- Tabla `team_people`: `account_id` (la empresa), `nombre` (≤ 60), `tag`
  (≤ 30, empieza por @), `rol` (≤ 120), `historia` (≤ 1200), `temas`
  (≤ 600), `pilar_ids uuid[]` (de que pilares sabe: es lo que usa el agente
  para proponerla), `voz_si` (≤ 800), `voz_no` (≤ 800), `muletillas text[]`
  (≤ 20: frases que si dice), `frases_prohibidas text[]` (≤ 30),
  `relacion_empresa` (≤ 600: como y cuanto habla de Plogy), `a_camara`
  (≤ 600: ritmo, energia, como se planta frente a la camara), `activo`,
  `position`. Con topes, como el resto: todo entra en el prompt. RLS activo y
  sin politicas, como las demas.
- `persona_id uuid null references team_people(id) on delete set null` en
  `studio_pieces`, `content_pieces` y `video_items`.
- `video_settings.persona_id`: la persona por defecto de los videos.

**Marcas**

- `accounts.parent_id uuid null references accounts(id) on delete cascade`,
  con check `parent_id <> id`. El "un solo nivel" se valida en codigo al crear.
- `accounts.tipo text not null default 'empresa'`, check `in ('empresa', 'persona')`.
- `accounts.persona_id uuid null references team_people(id) on delete set null`:
  la persona sobre la que se arma una marca personal.
- `account_secrets`: `composio_api_key`, `composio_auth_configs jsonb`
  (`{canva, facebook, instagram}`), `linkedin_client_id`,
  `linkedin_client_secret` y `linkedin_redirect_uri`. Solo se leen en la fila
  de la empresa.
- `engine_settings.fuente_noticias text not null default 'propia'`, check
  `in ('propia', 'empresa')`. Las marcas hijas se crean con `'empresa'`.
- `generation_config.publicar_solo_aprobadas boolean not null default false`.
  Las marcas hijas se crean con `true`.

### Fase 2 — Personas del equipo

Funciona en la cuenta de Plogy tal como esta, sin marcas hijas.

- `src/engine/personas.ts`: leer, crear, editar y desactivar personas.
  `personasDe(accountId)` siempre lee las de la empresa (con marcas hijas, las
  de su `parent_id`).
- Pantalla **Configuracion > Equipo**: lista de personas y editor del perfil,
  con la misma forma que las pestañas de Marca.
- Prompt: seccion nueva en `marca/bloque.ts`, **"QUIEN NARRA"**, cuando la
  pieza tiene persona: nombre, rol, historia, temas, voz, muletillas, frases que
  no dice y, en video, como es frente a la camara. Escribe en primera persona;
  si la voz de la persona choca con la de la marca, manda la persona en el tono
  y la marca en reglas, vetos y CTA.
- **Eleccion:** el agente de ideas y el de contenido proponen la persona cuyo
  `pilar_ids` cubre el pilar de la pieza (y si ninguna, sus `temas`). En el
  estudio y en la ficha de la pieza hay un selector para elegirla o cambiarla.
  Cambiarla en una pieza ya escrita la reescribe.
- **Video studio:** formato de guion **para grabar** (ver arriba), con la
  persona del video. `video_settings.persona_id` reemplaza a
  `personaje_tag`/`personaje_nombre`, que se dejan de leer cuando haya persona.
  El formato de video con IA queda o se retira: se decide al empezar esta parte.

### Fase 3 — Herencia de marcas en el motor

Un modulo nuevo, `src/engine/marcas.ts`, como unico sitio que sabe de la
herencia. El resto pregunta ahi.

- `Cuenta` gana `parent_id`, `tipo` y `persona_id`. `todasLasCuentas`,
  `cuentaPorId` y `cuentaPorSlug` devuelven el **plan efectivo** (el de la
  empresa). **Sin esto las marcas hijas no corren:** los ticks de estudio,
  publicacion y videos filtran por `esAdvance(c)`, y una cuenta nueva nace
  `basic`.
- `empresaDe(accountId)`: la empresa, o la propia cuenta si ya lo es.
- `secretosDe` pasa a mezclar: lo heredable (Claude, Serper, modelos, Composio,
  app de LinkedIn) sale de la empresa si la marca no tiene valor propio; lo
  propio (`composio_user_id`, Facebook, Instagram, webhook web) nunca se hereda.
- `claveComposio(accountId)` y `AUTH_CONFIG` resuelven en este orden: empresa
  (interfaz), `.env`, `engine_secrets`, valor del codigo. Hoy hay dos
  `claveComposio` (`composio/conexiones.ts` y `content/composio.ts`): quedan en
  una.
- `linkedinConfig(accountId)`: el mismo orden, empresa y luego `.env`.
- **Visual:** `cuentaVisual(accountId)` devuelve la empresa. Plantillas
  (`content_templates`), logos, paleta y fotos se leen de ahi. Las plantillas
  viven en el Canva de Plogy, asi que todo lo que toca Canva para una marca hija
  usa la conexion de Canva de la empresa.
- **Editorial:** `identidadEditorial(hija)` devuelve los pilares separados
  (`empresa` y `propios`) y la union de audiencias y CTA. Las consultas que
  filtran `content_pillars` por `account_id` pasan a `in (hija, empresa)`. Una
  pieza de la marca puede apuntar a un pilar de Plogy (la FK lo admite).
- **Noticias:** con `fuente_noticias = 'empresa'`, la ingesta y el analisis se
  saltan para la marca, y su pipeline de contenido lee las noticias ya
  analizadas de la empresa **en solo lectura**. Es la parte delicada: hoy el
  pipeline avanza el estado de cada fila de `raw_news` (`analyzed`, `angled`,
  `pending_generation`), y una marca no puede mover las filas de Plogy. El uso
  por marca se registra del lado de la marca (en sus `content_angles` o en una
  tabla de uso). Se diseña en detalle al empezar esta parte, leyendo
  `content/tick.ts` entero.

### Fase 4 — Prompts de marca personal

En `marca/bloque.ts`, para una cuenta `tipo = 'persona'`:

- Seccion nueva **"LA EMPRESA DE LA QUE FORMA PARTE"**: nombre, que hace y
  mensaje central de Plogy, y el `relacion_empresa` de la persona.
- **"QUIEN ES"** sale de la persona de la marca: nombre, handle, rol, historia.
- **"DE QUE HABLA"**: los pilares en dos grupos, los personales y los de Plogy.
  El orden y el peso de cada grupo se deciden con el metodo del Paso 0.
- **"CÓMO SUENA"**: la voz de la persona.
- Reglas, frases prohibidas y vetos: los de Plogy mas los propios.
- Si la pieza la narra otra persona del equipo (Juan Francisco en la marca de
  Luciano), "QUIEN NARRA" es esa persona y la marca sigue siendo la de Luciano.
- `datosParaPrompt` lee la empresa, la marca y la persona de una vez.
- La pantalla que pinta el prompt final lo muestra igual. Hay que vigilar
  `TOPE_PROMPT`: con empresa, marca y persona el bloque crece.

### Fase 5 — Acceso, selector y crear marcas

- `cuentasDelUsuario` devuelve las empresas donde el usuario es miembro **y sus
  marcas hijas**, con el rol que tiene en la empresa. Es el control de seguridad:
  la cookie solo propone; una marca hija entra si su empresa esta en las
  membresias del usuario.
- Selector agrupado: `Plogy`, y debajo `Luciano` y `Juan Francisco`.
- Configuracion > Empresa (owner): seccion **Marcas** para crear, renombrar y
  archivar. `crearMarca(empresaId, personaId)` crea la marca sobre una persona
  del equipo: inserta la cuenta con `parent_id`, `tipo = 'persona'` y
  `persona_id`, crea su `account_secrets`, llama `asegurarConfiguracion` y deja
  los valores de marca hija (`fuente_noticias = 'empresa'`, ingesta apagada,
  `publicar_solo_aprobadas = true`).
- Los miembros y las personas se gestionan solo en la empresa.
- Dentro de una marca hija, lo heredado se ve con un candado y "se edita en
  Plogy": pilares de Plogy, pestaña Visual, Equipo, Claude y Serper en
  Conexiones. La identidad y la voz enlazan a la ficha de su persona.

### Fase 6 — Conexiones desde la interfaz

En Configuracion > Conexiones de la **empresa**:

- Tarjeta **Composio**: clave (se muestra enmascarada, solo los ultimos 4),
  boton "Probar conexion" y, en avanzado, los IDs de Canva, Facebook e
  Instagram.
- Tarjeta **App de LinkedIn**: client id, secret, redirect URI.
- La clave nunca viaja al navegador.

En cada **marca**: solo los botones para conectar sus redes (Instagram,
Facebook, LinkedIn). Canva no aparece: lo visual es de la empresa.

El `.env` queda como respaldo; cuando todo este en la interfaz se puede retirar.

### Fase 7 — Autonomia por marca

Ya existe por cuenta: `generation_mode`, `publish_schedule` por red, `modo` de
videos y la cadencia de ideas. Falta la aprobacion:

- Con `publicar_solo_aprobadas`, las tandas solo publican `approved`. Hay tres
  sitios que hoy publican sin aprobacion: `publish/publish-piece.ts:195`
  (`generated` o `approved`), `studio/publicar.ts:226` (`generated`) y
  `videos/publicar.ts` (estado `video`). Los tres respetan el interruptor.
- En cada marca, un resumen de autonomia en una linea: genera sola, publica
  sola, requiere aprobacion.

### Fase 8 — Sembrar Plogy, el equipo y las dos marcas

- La cuenta actual (slug `hancel`) es Plogy: se confirma o se renombra.
- Se crean las personas del equipo desde Configuracion > Equipo, empezando por
  Luciano y Juan Francisco.
- Se crean las marcas `Luciano` y `Juan Francisco` sobre sus personas, desde la
  interfaz, no con SQL ni constantes: lo de marca vive en filas de la cuenta,
  nunca en el codigo.
- Cada marca rellena sus pilares personales y conecta sus redes.
- Se prueba de punta a punta, con aprobacion, antes de encender nada
  automatico: una pieza por marca, una pieza de Plogy narrada por alguien del
  equipo y un guion de video para grabar.

## Riesgos

- **Plan efectivo.** Si falla, las marcas hijas quedan fuera de todos los ticks
  sin dar error (Fase 3).
- **Fuga entre empresas.** Una empresa sin `parent_id` sigue empezando en
  blanco; la herencia solo mira hacia su propia empresa. Hay que probar que una
  empresa nueva no ve nada de Plogy, ni de sus marcas, ni de su equipo.
- **Datos de personas reales.** Las personas son gente del equipo con nombre,
  rol e historia. No se escribe en su perfil nada que ellas no quieran ver
  publicado, porque el agente puede usarlo.
- **Un solo token de Claude.** Tres marcas comparten la suscripcion de Plogy:
  el consumo se multiplica y los limites llegan antes.
- **Storage (1 GB, plan gratuito).** Lo visual compartido ayuda; aun asi, la
  limpieza de renders hay que mirarla por marca.
- **Borrado en cascada.** Borrar la empresa borra sus marcas y su equipo. Es lo
  esperado, pero en la interfaz "archivar" va antes que "borrar". Desactivar una
  persona no borra las piezas que narro.
- **Secretos en la base.** La clave de Composio pasa a `account_secrets`, igual
  que hoy el token de Claude: RLS sin politicas, solo la alcanza la service
  role.

## Preguntas abiertas

- Aprobacion: ¿cualquiera del equipo aprueba una pieza de la marca de Juan
  Francisco, o solo el? Por defecto, cualquier miembro.
- ¿Quien edita el perfil de una persona: cualquier miembro o solo un owner?
  ¿Y la propia persona, si tiene usuario?
- ¿Se evita que la misma noticia salga el mismo dia en Plogy y en una marca
  personal?
- Video studio: ¿el formato de video con IA se retira o se queda como segunda
  opcion junto al guion para grabar?
- Fotos de las personas: fuera por ahora; si vuelven, se etiquetan por persona
  en la biblioteca compartida.
- Conversaciones: ¿cuanto tiempo se guardan antes de limpiarlas? ¿Alguna es
  privada de quien la escribio, o todas son del equipo?
- Tipos de marca: ¿con cuales arranca Hancel? La tabla del Paso 0 es un punto
  de partida.
- La investigacion del Paso 0: ¿la hacemos en una sesion aparte, con fuentes, y
  sale como documento en el repo?
