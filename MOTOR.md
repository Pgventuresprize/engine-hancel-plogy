# Cómo funciona el motor

Qué hace cada pieza, cuándo corre y cuánto tarda. Los tiempos son medidos, no
estimados: si dice 17 segundos es porque se cronometró.

---

## El recorrido de una noticia

```
Extracción → Análisis → Ángulo → Contenido → Publicación
  (Serper)   (Claude)   (Claude)  (Claude +    (LinkedIn
                                   Pexels +     Buffer)
                                   Serper)
```

Cada paso es un **agente** con su propia ficha en la aplicación: su modo, su
horario, su prompt y su modelo. Se configuran en **Agentes**, uno por pantalla.

---

## Los tres modos

Todo agente está en uno de tres estados, y son independientes entre sí:

| Modo | Qué significa |
|---|---|
| **Manual** | No corre solo. Lo disparas tú desde el estudio, con el botón de su etapa o arrastrando una tarjeta. |
| **Programado** | Corre a las horas que marques. Entre medias el trabajo se acumula en cola. |
| **Automático** | Corre en cuanto el paso anterior le entrega trabajo. |

Además cada agente tiene un **interruptor de servicio**. Apagado no es lo mismo
que manual: manual es "lo disparas tú", apagado es "este paso no existe para
esta cuenta" — no corre y su columna desaparece del estudio.

Poner un agente en automático, o encenderlo, dispara una pasada ahí mismo. No
hay que esperar al reloj para ver si el cambio hizo algo.

**Los horarios** se escriben como se dicen: `9:00, 9:20, 13:30, 18:00`. Cada uno
con su minuto propio. Una hora suelta vale como en punto. Al guardar, el campo
se repinta normalizado, así se ve qué entendió y qué descartó.

---

## El reloj: cada cuánto pasa algo

Dos relojes, dentro de Postgres:

| Trabajo | Frecuencia | Qué hace |
|---|---|---|
| **Tick de contenido** | cada **2 minutos** | Una pasada del pipeline entero |
| **Ingesta** | 11:00 y 18:00 (Bogotá) | Dispara la extracción |
| **Tick del calendario** | cada **5 minutos** | Publica lo programado que llegó a su hora, si el interruptor está encendido |

El tick es el corazón. Cada pasada recorre todos los pasos, pero **hace un solo
trabajo por buzón**. No es pereza: la petición tiene 60 segundos de límite y una
generación son ~15 s de Claude más ~18 s dibujando el carrusel. Sin tope, la
pasada moría a medias y dejaba trabajos reclamados que nadie tocaba en media
hora.

**Tiempos medidos de una pasada:** entre **33 y 43 segundos** cuando hay trabajo,
unos 13 cuando no lo hay. Si una pasada ya gastó 30 segundos, la generación se
aplaza a la siguiente en vez de arriesgarse a no terminar.

**Ritmo real: una pieza cada 2 minutos.** Unas 30 por hora. Una cola de 30
ángulos tarda algo más de una hora en vaciarse.

---

## 1 · Extracción

**Qué hace.** Sale a Serper con las consultas de la taxonomía —una por segmento—
y guarda lo que vuelve.

**Modos:** manual o programado. No tiene automático porque no hay ningún paso
antes que le entregue trabajo.

**Cuándo:** hoy, 11:00 y 18:00 hora de Bogotá.

**Filtros al entrar:**
- **Por enlace.** El mismo URL no entra dos veces, nunca.
- **Por fecha.** Una noticia de más de **5 días** se descarta al llegar y va a la
  columna *Por fecha*. No se analiza ni cuenta.
- **Por titular.** Hay un deduplicador que compara palabras. En español apenas
  acierta: sobre 171 pares de titulares del mismo hecho detectó 0. El trabajo de
  verdad lo hace el filtro de la etapa de ángulo.

**Configuración:** la **taxonomía** vive en su ficha. Cada segmento es una
consulta a Serper con su idioma, su país y su frescura.

**Conexión:** Serper. La clave se pone en *Configuración → Conexiones*.

---

## 2 · Análisis

**Qué hace.** Por cada noticia pendiente: Composio sale a la web y trae el
material; Claude solo lee ese material y lo puntúa. La IA no navega.

Esa separación es la que bajó el coste un 96%: de 26.029 tokens de entrada por
análisis a **~1.000**.

**Salida:** una nota de 1 a 10, las palabras clave y unas notas de por dónde
enfocar.

**El veto.** Antes de calificar, el agente decide si la noticia es de un tema que
esta cuenta no cubre: corrupción, escándalos o señalamientos a figuras públicas,
investigaciones y procesos judiciales, peleas políticas. Si lo es, la noticia
queda en **Vetadas** y no llega nunca a la etapa de ángulo.

No es una nota baja. Una nota baja se puede empujar a mano desde el estudio;
una vetada no se puede arrastrar, y el servidor la rechaza aunque se intente por
otra vía.

La prueba que aplica: **si el sujeto de la noticia es una persona señalada, está
vetada; si el sujeto es un hecho del sector, no.** Un decreto, un arancel, una
línea de crédito o una crítica técnica a una medida son noticias normales aunque
las anuncie el Gobierno. "Finagro amplió la línea de crédito rural" pasa;
"Finagro dio crédito de pequeño productor al hijo de un dirigente gremial" no.

**Consumo medido:** ~1.005 tokens de entrada, ~454 de salida por noticia.

**Modelo por defecto:** Haiku 4.5. Es el paso más mecánico y el más repetido.

**Ritmo:** hasta 6 noticias por pasada cuando corre sin límite; 1 cuando alguien
espera delante.

---

## 3 · Ángulo

**Qué hace.** Decide la lectura no obvia del hecho: no lo que pasó, sino lo que
revela.

**Qué noticias toma.** Las analizadas que superan el **umbral de score**
(*Configuración → General*). Dos matices que importan:

- El umbral solo rige para lo que entró **después** de fijarlo. Cambiarlo no
  resucita noticias viejas ni descarta las que ya cumplían.
- Por debajo del umbral una noticia **no desaparece**: se puede empujar a mano
  arrastrándola en el estudio, y queda anotado que entró sin llegar. Score y
  umbral se congelan en ese momento, para poder estudiar después qué infravalora
  el agente de análisis.

**El filtro de hechos repetidos.** Aquí, y no antes. Cuando varias noticias
cuentan el mismo hecho —27 medios publicando el mismo anuncio de la FNC es lo
normal— se agrupan y solo pasa una: gana el score más alto y, a igual score, la
que llegó primero. Las demás quedan marcadas como *Repetidas*, enlazadas a la
que ganó.

Se compara contra los hechos ya cubiertos en los **últimos 7 días**, no solo
contra la tanda actual. Los dos posts duplicados que hubo se generaron con seis
horas de diferencia: mirar solo la cola no los habría pillado.

**Consumo:** ~1.400 tokens de entrada, ~300 de salida. El agrupador son ~1.500 /
~130 para toda una tanda.

---

## 4 · Contenido

Un ángulo, varias redes. Que compartan ángulo es lo que hace que el post y el
carrusel cuenten lo mismo con distinta forma.

### Instagram

**Qué escribe:** el guion del carrusel, **5 láminas de contenido**. La sexta es
el cierre, que pone el motor.

**Reglas que lleva el prompt:**
- El hook de la portada lleva **el dato duro**: actor con nombre propio y la
  cifra. El hueco de curiosidad va sobre la consecuencia, nunca sobre el hecho.
  Máximo 95 caracteres.
- Los títulos de lámina, **65 caracteres**. Una idea cada uno.
- Español con tildes y eñes. El prompt está escrito acentuado a propósito: antes
  iba sin tildes por una convención del código y el modelo imitaba esa forma de
  escribir.
- Para logros de Colombia, el hook abre con una palabra de celebración.

**Consumo:** ~2.900 tokens de entrada, ~900 de salida.

### Facebook

**No tiene agente propio.** Su pieza sale del guion que ya escribió Instagram,
**sin una sola llamada de más**: la portada del carrusel (redibujada sin la
numeración ni el "desliza", que ahí no llevan a ninguna parte) y el texto de
todas las láminas seguido.

Su ficha existe para ver eso: el mismo prompt, el mismo modo, y las dos redes
conectadas.

### LinkedIn

Post largo desde el mismo ángulo, con su propio criterio de forma. Su tarjeta se
dibuja **al publicar**, no antes.

**Qué redes generan solas.** Las que tienen su agente en servicio **y** el canal
conectado. Las dos condiciones. Una columna de LinkedIn sin cuenta enlazada
sería un sitio donde las piezas se acumulan sin poder salir.

---

## 5 · Las imágenes

**El fondo: Pexels.** Las búsquedas las escribe el agente de Instagram, en
inglés, porque es el único que sabe de qué habla cada lámina. Antes salían de
las palabras del titular y eso daba montañas para una noticia de cannabis.

El prompt pide cosas fotografiables y los dos lados del hecho: una noticia de
pérdidas ganaderas por lluvia pide vacas **y** lluvia. Y pide cultivos,
productos y trabajo, no retratos.

**El elemento de la portada: Serper.** El círculo o cuadrado con un logo, un
producto o un objeto reconocible. Va a Google, no a un banco de fotos: Pexels
sabe de "cafetal" pero no de "logo de Fedegán".

- Se piden varias candidatas y se prueban **de la más cuadrada a la menos**.
- Entre las seis mejores se elige **al azar**, para que dos noticias del mismo
  gremio no salgan con la misma imagen.
- Forma y esquina también se sortean: círculo o cuadrado, cuatro posiciones.
- Es opcional de verdad: si no hay nada descargable, la portada sale sin él.

**La lámina de cierre.** Va siempre. Dos estilos, en *Configuración → Marca*:
- **Marca:** el logo sobre una foto, con el titular debajo.
- **Perfil:** el titular grande y una captura de tu perfil con el cursor sobre
  el botón de seguir.

El **logo** se sube en dos versiones, clara y oscura, y se elige por la paleta.

**Tiempos:** dibujar un carrusel de 6 láminas son **~18 segundos**. La portada
de Facebook añade una llamada más a Satori y ninguna a Pexels.

---

## 6 · Publicación

**Un horario por canal.** Cada red tiene su modo, sus horas y cuántas piezas
salen en cada una.

| Canal | Por dónde sale |
|---|---|
| LinkedIn | API de LinkedIn, directo |
| Instagram | Composio |
| Facebook | Composio |

**La imagen de LinkedIn no es opcional.** Si falla al dibujarla o subirla, no
hay post: la pieza se queda sin publicar con el motivo escrito y la siguiente
tanda lo reintenta. Un fallo pasajero se cura solo y uno de verdad se ve en la
interfaz.

**Las horas son de la cuenta,** no del servidor. El huso se pone en
*Configuración → General*. Esto importa más de lo que parece: durante un día,
comparar la hora en Bogotá con el día en UTC hizo que el motor se saltara todos
los horarios.

### El calendario

En `/calendario` se arrastra una pieza a una fecha y hora, o se reparten muchas
según los horarios de cada red. Solo Instagram y LinkedIn. Programar a mano es una
orden explícita: sale aunque el agente de publicación esté en manual, y lo que
tiene fecha no entra en las tandas automáticas.

**La regla: ante la duda, no publica y lo enseña.** Perder la hora de un post se
arregla; un post doble o uno frenado, no.

- **Interruptor por cuenta** (`calendario_ajustes.publicar_activo`), apagado por
  defecto. Encender es de un owner y pide confirmación; apagar lo puede cualquiera.
  Apagado, el tick responde en `tocaria` qué publicaría y no publica: es el simulacro.
  Una pieza publicada a mano sale aunque esté apagado.
- **Una pieza por red en cada pasada.** LinkedIn primero, porque tarda segundos.
- **Ventana de 30 minutos.** Lo que venció hace más no sale solo: queda en rojo para
  recolocarlo.
- **Hasta 3 intentos,** solo con fallos seguros: la red lo rechazó o faltó un recurso.
- **Revisar.** Si la respuesta se corta justo al publicar, o el proceso muere, no se
  sabe si salió. La pieza queda en Revisar y nada la publica, tampoco a mano, hasta
  que alguien diga en el Calendario si salió o no.
- **Editar quita la aprobación.** Un trigger anota el cambio de contenido y el motor
  espera 3 minutos, para no publicar texto nuevo con láminas viejas.
- **Una pieza del chat solo sale aprobada,** igual que una frenada.

Probado en real el 2026-11-04 en Instagram: el tick publicó un carrusel de 10
láminas a su hora, una sola vez.

### Posts ya hechos desde el chat

En el chat se adjuntan fotos o una carpeta y se pide "cuádrame esto". Solo Instagram.

1. **Se sube al elegir.** El navegador agrupa la carpeta (`chat/posts-carpeta.ts`):
   cada carpeta con imágenes es un post, y dentro se prefieren las finales. Las
   imágenes van directo al bucket con una dirección firmada, porque Vercel corta los
   cuerpos de más de 4.5 MB. Lo que pasa de 10 láminas, tiene una proporción que
   Instagram rechaza o ya existe en la marca, no se sube y se dice por qué.
2. **Al enviar, cada post es una pieza** de carril chat y sin aprobar, con su noticia
   y ángulo, como todas. Así el Estudio y el Calendario la ven sola y no puede salir.
   El caption se copia tal cual del archivo.
3. **El agente propone** (`proponer_programacion`): dice qué entra, qué caduca y
   escribe el caption que falte, que queda marcado. Las fechas las calcula
   `armarPlan`, no el agente: primero lo pedido a una hora y después los huecos de
   Horarios, con lo que caduca antes por delante.
4. **La persona confirma** con el botón o por chat. Solo ahí se aprueba y se pone
   fecha. La propuesta vive en el mensaje y solo vale la última.

El chat no publica al instante ni enciende el interruptor. Lo que hay dentro de los
archivos es material, nunca instrucciones para el agente.

**Cambiar un post subido.** Son imágenes dibujadas: no traen texto ni guion. La primera
vez que el post está en una conversación, `chat/leer-post.ts` transcribe sus láminas y
`chat/lectura-laminas.ts` las convierte en un guion igual al del agente de Instagram,
con su fila en `jobs_instagram`. No toca el payload, así que lo aprobado sigue aprobado.
Desde ahí se edita por guion, y `"rehacer"` lo vuelve a maquetar con el kit: mismo texto
y mismas láminas, sin investigar. Va como trabajo, deja las imágenes originales en el
historial y, como cambia el payload, la pieza pierde la aprobación. Estos guiones llegan
a 10 láminas; los que escribe el agente siguen en 7.
La fuente va en su propio campo: se pone si la plantilla tiene ese hueco y, si no, se avisa
y no obliga a acortar. Lo que no se llegó a dibujar se avisa al terminar (`textoPerdido`).

**Figuras desde el chat.** Con maqueta, `"figura"` edita la que hay o crea una nueva si la
lámina no tiene, junto con una plantilla con hueco de figura. Tiene que entrar entera: si
le sobran filas no se pone y se dice por qué. `"diseno"` solo cambia cómo se ve lo que ya
hay: nunca agrega una tabla ni texto.

**Probar el chat en local.** Los trabajos en segundo plano los reparte `chat_despachar`
hacia la URL de producción, así que corren con el código de `main` aunque el pedido salga
del local. Para probar código sin subirlo: `CHAT_SIN_DESPACHO=1` en `.env.local` y correr
`scripts/pasada-chat.ts <conversacion>` después de enviar el mensaje.

---

## El estudio

El tablero es la portada. Una tarjeta por hecho, que se mueve sola según avanza.

**Columnas:** Traídas · Analizadas · Ángulo · una por red activa · Publicado ·
Descartados (a mano, por fecha, repetidas).

**Arrastrar dispara el trabajo que falta.** La etapa no es una etiqueta: se
deduce de lo que existe. Soltar una tarjeta más adelante solo puede significar
hacer lo que falta para llegar ahí, así que eso es lo que hace. Y **adelanta la
cola**: lo que arrastras se hace en esa pasada, sea cual sea el modo del agente.

Solo admite la etapa siguiente. Publicar pregunta antes, porque sale a las redes
y no se deshace.

**El indicador de cada columna** dice cómo corre su agente. En manual aparece el
botón de ejecutar, que trabaja sobre lo que dejó la etapa anterior: pulsar en
*Ángulo* anguliza lo que está en *Analizadas*.

---

## El chat: piezas sobre cualquier tema

Desde el chat una persona pide hasta seis piezas con un mensaje, sobre cualquier
tema y sin noticia, y hasta tres agentes trabajan a la vez por marca.

**Los agentes tienen herramientas** (`engine/chat/herramientas.ts`): `buscar_web`
y `leer_pagina` para investigar en la conversación, y `crear_piezas` para poner
al equipo a trabajar. La búsqueda es la misma del análisis, por Composio. Si la
persona dice de qué y cuántas, se crean de una; si pide ideas, el agente propone
y espera.

**Cada pieza entra por el mismo sitio que una noticia.** Es una fila de
`chat_trabajos` que avanza por fases:

| Fase | Qué hace | Termina en |
|---|---|---|
| `investigar` | Busca, lee las fuentes citadas y consolida (`chat/investigar.ts`) | Una fila en `raw_news` y su `jobs_angle` |
| `angulo` | El agente de ángulo de siempre | `content_angles` |
| `pieza` | Recurso, escritor, diseño, revisor | `content_pieces`. Se repite: un carrusel ocupa varias pasadas |

Sin material suficiente la pieza falla con su motivo en vez de inventar.

**Carril.** Tres pasadas normales a la vez no reparten nada: las tres leen la cola
del más viejo al más nuevo y se pelean por la misma fila. Por eso lo del chat va
con `carril = 'chat'` y cada pasada se apunta a su trabajo (`objetivo` en
`runContentTick`). La cola normal solo mira `general`. El carril también aparta
estas filas de lo que ignora el estado: la deduplicación de la ingesta, que borra
en cascada; los hechos cubiertos; el encolado automático de otras redes; y la
publicación automática. Una pieza del chat solo sale si alguien la aprueba.

**Turnos.** `chat_despachar` (SQL) es lo único que reparte: con un bloqueo por
marca cuenta los turnos vivos, aparta hasta completar tres y llama por `pg_net`
a `/api/chat/pasada` en la misma transacción. Cada pasada confirma su turno,
avanza una fase, lo suelta y vuelve a despachar. Así el trabajo termina aunque se
cierre el navegador. Un cron de un minuto recoge lo que quede sin turno.

| Qué pasa | Qué lo recoge |
|---|---|
| La llamada no llega | El turno caduca a los 60 s |
| La pasada muere | El turno caduca a los 330 s; quien lo tome limpia lo que quedó en `processing` |
| Límite del plan o corte de red | Vuelve a la cola y reintenta |
| Cuatro turnos seguidos sin avanzar | La tarjeta falla con el motivo |
| Noventa minutos sin terminar | La tarjeta falla |

Para probar contra otro despliegue, el secreto de Vault `chat_pasada_url`
sustituye a la URL de producción. En local, `scripts/probar-chat.ts` escribe en
el chat y `scripts/pasada-chat.ts` corre los trabajos sin `pg_net`, con
`CHAT_SIN_DESPACHO=1`.

### Quién responde y qué puede cambiar

Si el mensaje no nombra a nadie con @ ni trae partes marcadas, se lee antes de
repartirlo (`quienResponde` en `chat/conversar.ts`): el agente de lo que dice el
mensaje. Si el mensaje no lo dice ("dale"), el de la pieza abierta y, sin pieza, el
último que habló.

El agente tiene delante hasta seis de sus piezas, etiquetadas P1, P2..., y las
plantillas del kit. Un carrusel con maqueta se cambia de cuatro maneras
(`chat/editar.ts`): sus huecos, su foto, otra plantilla del kit, o `diseno`, que
rediseña la lámina. La plantilla no es un límite: solo no se inventan cifras ni se
toca lo publicado.

**Rediseñar una lámina** (`render/kit-lamina.ts`) produce una variante de su
plantilla: el mismo HTML con sus marcas `{{t:...}}`, adaptado al pedido. El
diseñador ve la plantilla y el carrusel dibujado. Como los huecos siguen ahí, el
texto no se puede perder, la lámina se sigue cambiando y marcando, y se redibuja
sin llamar a Claude. La variante va en la maqueta (`laminas[n].variante`).
`revisarPlantilla` y el dibujo comprueban lo que no se negocia, y un crítico mira
la lámina dentro del carrusel.

Un cambio en una pieza se aplica en la respuesta. El que rediseña láminas o toca
varias piezas va como trabajo (`tipo = 'editar'`, sin fase), con los mismos turnos
y su tarjeta. Las láminas diseñadas se guardan en `pedido.disenos`: si no cabe en
una pasada o se detiene, sigue sin volver a pagarlas.

La foto de un cambio del chat tiene que aguantar la medida a la que sale
(`aguanta` en `marca/imagenes.ts`: hasta 1,5 veces de ampliación) y, como la pidió
la persona, no se queda vacía si hay candidatas (`obligatoria`).

## Qué impide que las cosas se dupliquen

Tres candados, en tres sitios distintos:

1. **`raw_news.link` único.** El mismo enlace no entra dos veces.
2. **Un trabajo de ángulo por noticia, una pieza por red y noticia.** Índices
   únicos en la base. Dos pasadas del tick que se solapen leen la cola antes de
   que ninguna escriba: la comprobación en código no puede cerrar esa carrera,
   solo la base. Quien pierde no hace nada.
3. **El agrupador de hechos**, en la etapa de ángulo, para lo que es el mismo
   suceso contado por medios distintos.

---

## Cuando algo falla

Un paso que falla **no tumba la pasada**. El motivo se anota y el resto sigue.

- Un trabajo que falla se marca y se ve en la ficha.
- Un trabajo que se queda reclamado —una pasada cortada— vuelve a la cola a los
  **30 minutos**.
- Una noticia pendiente de analizar caduca a las **36 horas**.
- Regenerar un carrusel lo redibuja desde el guion guardado, **sin gastar una
  generación**: cuesta 0 tokens y cambia las fotos, que es la forma de decir
  "esta imagen no me gusta".

---

## Las conexiones

| Para qué | Dónde se configura |
|---|---|
| Claude | Configuración → Conexiones |
| Serper | Configuración → Conexiones |
| LinkedIn | Configuración → Conexiones (OAuth) |
| Instagram y Facebook | Configuración → Conexiones (canal de Buffer) |
| Pexels | variable de entorno `PEXELS_API_KEY` |
| Composio | variable de entorno o `engine_secrets` |

Serper vive en la aplicación y no en el entorno porque es la que más se rota, y
cambiarla no debería obligar a redesplegar.
