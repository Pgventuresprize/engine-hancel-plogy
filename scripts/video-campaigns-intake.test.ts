import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeIntake, explicitMix } from "../src/engine/video-campaigns/intake"
import { actionResult, actionValue, CampaignActionError } from "../src/engine/video-campaigns/action-result"

const request=`Quiero una campaña de 5 videos.
- 60 % réplicas: 3 videos para generar awareness.
- 20 % adaptaciones o noticias: 1 video para construir confianza.
- 20 % originales: 1 video para generar consultas comerciales.`
const mix={replica:60,adaptacion:20,original:20}
test("el pedido del ejemplo manda sobre una mezcla mal formada del modelo",()=>{
 for(const modelMix of [{replicas:"60%",noticias:"20%",originales:"20%"},{replica:3,adaptacion:1,original:1},{replica:70,adaptacion:20,original:10},null]){
  assert.deepEqual(normalizeIntake({count:"5",mix:modelMix},request).mix,mix)
 }
 assert.equal(normalizeIntake({count:"5"},request).count,5)
})
test("se reconocen porcentajes antes y después de la modalidad con tildes",()=>{
 assert.deepEqual(explicitMix("Réplicas: 50%; adaptaciones: 25%; originales: 25%"),{replica:50,adaptacion:25,original:25})
 assert.deepEqual(explicitMix("40% de réplicas, 40% noticias y 20% originales"),{replica:40,adaptacion:40,original:20})
})
test("normaliza textos, plurales y proporciones del modelo sin modificar la intención",()=>{
 assert.deepEqual(normalizeIntake({mix:{réplicas:"60 %",noticias:"20",originales:"20%"}},"campaña").mix,mix)
 assert.deepEqual(normalizeIntake({mix:{replica:0.6,adaptacion:0.2,original:0.2}},"campaña").mix,mix)
})
test("dos porcentajes explícitos completan el tercero y muestran la suposición",()=>{
 const result=normalizeIntake({},"50% réplicas, 30% adaptaciones")
 assert.deepEqual(result.mix,{replica:50,adaptacion:30,original:20})
 assert.ok((result.assumptions as string[]).length)
})
test("solo 60% réplicas conserva la condición y explica el reparto restante",()=>{
 const result=normalizeIntake({mix:{replica:40,adaptacion:30,original:30}},"Quiero 60% réplicas")
 assert.deepEqual(result.mix,mix)
 assert.ok((result.assumptions as string[]).length)
})
test("una mezcla contradictoria no se corrige silenciosamente",()=>{
 assert.throws(()=>normalizeIntake({mix},"60% réplicas, 30% adaptaciones, 20% originales"),/suma 110/)
 assert.throws(()=>normalizeIntake({},"60% réplicas y luego 50% réplicas"),/porcentajes distintos/)
 assert.throws(()=>normalizeIntake({mix:{replica:50,adaptacion:20}},"campaña"),/tres porcentajes/)
})
test("conserva referencias del usuario y descarta temas nulos o enlaces inventados",()=>{
 const url="https://www.instagram.com/reel/abc/"
 const result=normalizeIntake({topics:[null,{name:"Agentes",references:[url,"https://www.instagram.com/reel/inventado/"]}]},"Usa "+url)
 assert.deepEqual((result.topics as {references:string[]}[])[0].references,[url])
})
test("los errores esperados atraviesan la acción como datos serializables",async()=>{
 const result=await actionResult(async()=>{normalizeIntake({},"60% réplicas, 30% adaptaciones, 20% originales")})
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{ok:false,error:"La mezcla suma 110 %. Ajusta réplicas, adaptaciones/noticias y originales para que sumen 100 %."})
 assert.throws(()=>actionValue(result),/mezcla suma 110/)
})
test("un error interno no filtra su mensaje al navegador",async t=>{
 t.mock.method(console,"error",()=>{})
 const result=await actionResult(async()=>{throw new Error("detalle interno privado")})
 assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes("detalle interno privado"))
})
test("éxito y redirecciones conservan su semántica",async()=>{
 assert.equal(actionValue(await actionResult(async()=>42)),42)
 const redirect=Object.assign(new Error("redirect"),{digest:"NEXT_REDIRECT;replace;/login;307;"})
 await assert.rejects(actionResult(async()=>{throw redirect}),error=>error===redirect)
 assert.ok(new CampaignActionError("Mensaje para la persona") instanceof Error)
})
