import "server-only"
import { CampaignActionError } from "./action-result"
import { createHash } from "node:crypto"
import { secretosDe } from "../secretos"
import { supabaseAdmin } from "../supabase-admin"
import { apifyToken } from "./repository"
import { transcriptText } from "./transcript"
import { modelOutputPolicy, apifyStartFailure } from "./runtime-policy"
import { normalizeReference } from "./references"
import type { Reference } from "./model"

// Lee y termina de recoger corridas ya iniciadas. Nunca lanza una nueva.
export async function cachedSearchPool(accountId:string):Promise<{references:Reference[];waiting:boolean}>{
  const db=supabaseAdmin(),actors=["clockworks/tiktok-scraper","apify/instagram-hashtag-scraper"]
  const r=await db.from("vc2_sources").select("key,actor,status,run_id,data,created_at").eq("account_id",accountId).in("actor",actors).gte("created_at",new Date(Date.now()-86400000).toISOString()).order("created_at",{ascending:false}).limit(24)
  if(r.error)throw new Error(r.error.message)
  const headers={Authorization:`Bearer ${await apifyToken(accountId)}`}
  const collected=await Promise.all((r.data||[]).map(async row=>{
    let data=Array.isArray(row.data)?row.data as Record<string,unknown>[]:[],waiting=false
    if(row.run_id&&row.status!=="done"){
      try{
        const response=await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(row.run_id)}`,{headers,signal:AbortSignal.timeout(15000)})
        if(response.ok){
          const run=(await response.json()).data
          waiting=["READY","RUNNING","TIMING-OUT"].includes(run.status)
          if(run.status==="SUCCEEDED"){
            const response=await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&limit=100`,{headers,signal:AbortSignal.timeout(20000)})
            if(response.ok){
              const items=await response.json()
              if(Array.isArray(items)){data=items;await db.from("vc2_sources").update({status:"done",data:items,error:null}).eq("account_id",accountId).eq("key",row.key)}
            }
          }
        }
      }catch{/* Una lectura fallida no descarta los demás proveedores. */}
    }
    return {waiting,references:data.map(item=>normalizeReference(item,row.actor===actors[0]?"TIKTOK":"INSTAGRAM")).filter((x):x is Reference=>x!==null).map(x=>({...x,capturedAt:row.created_at}))}
  }))
  return {references:collected.flatMap(x=>x.references),waiting:collected.some(x=>x.waiting)}
}

export async function jsonModel(accountId: string, system: string, prompt: string, options: { web?: boolean; model?: string } = {}): Promise<{ text: string; model: string; usage: { input: number; output: number } }> {
  const s=await secretosDe(accountId)
  const token=process.env.ANTHROPIC_API_KEY||s.claude_oauth_token?.replace(/\s+/g,"")
  if(!token)throw new CampaignActionError("Configura la conexión de Claude de esta cuenta en Plogy.")
  const model=options.model||s.model_contenido||"claude-sonnet-5"
  const headers: Record<string,string>={"content-type":"application/json","anthropic-version":"2023-06-01"}
  const oauth=!token.startsWith("sk-ant-api")&&!process.env.ANTHROPIC_API_KEY
  if(oauth){headers.authorization=`Bearer ${token}`;headers["anthropic-beta"]="oauth-2025-04-20"}else headers["x-api-key"]=token
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers,signal:AbortSignal.timeout(165000),body:JSON.stringify({model,...modelOutputPolicy(model),system:[...(oauth?[{type:"text",text:"You are Claude Code, Anthropic's official CLI for Claude."}]:[]),{type:"text",text:system}],messages:[{role:"user",content:prompt}],...(options.web?{tools:[{type:"web_search_20250305",name:"web_search",max_uses:4}]}:{})})})
  const body=await res.json().catch(()=>({}))
  if(!res.ok)throw new CampaignActionError(`Claude no pudo completar el paso (HTTP ${res.status}). Revisa la conexión y el modelo de la cuenta.`)
  if(body.stop_reason==="max_tokens"){
    console.warn("[vc2] Límite de salida del modelo",{model,usage:body.usage,blocks:(body.content||[]).map((x:{type:string})=>x.type)})
    throw new CampaignActionError("El modelo agotó el límite de salida antes de terminar. Reintenta este paso; no falta información del usuario.")
  }
  await anotarConsumo(accountId,model,body.usage)
  const output=(body.content||[]).filter((x:{type:string})=>x.type==="text").map((x:{text:string})=>x.text).join("\n")
  if(!output)throw new CampaignActionError("Claude no devolvió texto utilizable.")
  return {text:output,model,usage:{input:Number(body.usage?.input_tokens||0)+Number(body.usage?.cache_read_input_tokens||0),output:Number(body.usage?.output_tokens||0)}}
}
/** Lo mismo que anota engine/claude/messages.ts, para que el consumo lo cuente. Nunca lanza: la llamada ya se pago. */
async function anotarConsumo(accountId: string,modelo: string,usage: Record<string,number>|undefined){
  const deCache=Number(usage?.cache_read_input_tokens||0),cacheEscrita=Number(usage?.cache_creation_input_tokens||0)
  try{await supabaseAdmin().from("pipeline_events").insert({account_id:accountId,run_id:null,kind:"claude.uso",label:"video-campana",detail:{paso:"video-campana",modelo,entrada:Number(usage?.input_tokens||0)+deCache+cacheEscrita,salida:Number(usage?.output_tokens||0),deCache,cacheEscrita}})}catch{/* Silencio deliberado. */}
}
// Solo escribe caché y presupuesto propios. Un inicio de corrida de resultado incierto nunca se relanza automáticamente.
export async function actorData(accountId: string,campaignId: string,actor: string,input: Record<string,unknown>,kind: "search"|"transcript"): Promise<{ waiting: true }|{ waiting:false; items: Record<string,unknown>[] }> {
  const db=supabaseAdmin(), ttl=kind==="search"?86400000:30*86400000
  const key=createHash("sha256").update(JSON.stringify([actor,input,Math.floor(Date.now()/ttl)])).digest("hex")
  const cached=await db.from("vc2_sources").select("*").eq("account_id",accountId).eq("key",key).maybeSingle()
  if(cached.error)throw new Error(cached.error.message)
  const token=await apifyToken(accountId)
  const headers={"content-type":"application/json",Authorization:`Bearer ${token}`}
  if(!cached.data){
    const inserted=await db.from("vc2_sources").insert({account_id:accountId,key,actor}).select("*").maybeSingle()
    if(inserted.error?.code==="23505")return {waiting:true}
    if(inserted.error)throw new Error(inserted.error.message)
    const budget=await db.rpc("vc2_reserve_run",{p_campaign:campaignId,p_account:accountId})
    if(budget.error||!budget.data){await db.from("vc2_sources").update({status:"error",error:"Se alcanzó el límite de corridas de esta campaña."}).eq("account_id",accountId).eq("key",key);throw new Error("Se alcanzó el límite de corridas Apify de la campaña. Puedes aportar un enlace y transcripción.")}
    try {
      const response=await fetch(`https://api.apify.com/v2/acts/${actor.replace("/","~")}/runs`,{method:"POST",headers,body:JSON.stringify(input),signal:AbortSignal.timeout(25000)})
      const body=await response.json().catch(()=>({}))
      if(!response.ok)throw new CampaignActionError(apifyStartFailure(response.status,String(body.error?.type||"").replace(/[^a-z0-9_-]/gi,"").slice(0,80)))
      if(!body.data?.id)throw new Error("Apify no devolvió el identificador de la corrida.")
      const update=await db.from("vc2_sources").update({status:"running",run_id:body.data.id}).eq("account_id",accountId).eq("key",key)
      if(update.error)throw new Error("No se pudo confirmar en el almacenamiento la corrida iniciada.")
      return {waiting:true}
    }catch(error) {
      const message=error instanceof CampaignActionError?error.message:"No se confirmó el resultado del inicio. Revisa la corrida en Apify antes de repetir para evitar gasto duplicado."
      await db.from("vc2_sources").update({status:"error",error:message}).eq("account_id",accountId).eq("key",key)
      throw new Error(message)
    }
  }
  if(cached.data.status==="done")return {waiting:false,items:cached.data.data as Record<string,unknown>[]}
  if(cached.data.status==="error")throw new Error(String(cached.data.error||"La extracción necesita revisión."))
  if(!cached.data.run_id){
    if(Date.now()-Date.parse(cached.data.created_at)>180000)throw new Error("El inicio de la corrida quedó sin confirmar. Revisa Apify o aporta la transcripción.")
    return {waiting:true}
  }
  const runRes=await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(cached.data.run_id)}`,{headers,signal:AbortSignal.timeout(20000)})
  if(!runRes.ok)throw new Error("No se pudo consultar la corrida de Apify.")
  const run=(await runRes.json()).data
  if(["READY","RUNNING","TIMING-OUT","ABORTING"].includes(run.status))return {waiting:true}
  if(run.status!=="SUCCEEDED"){await db.from("vc2_sources").update({status:"error",error:`La corrida terminó ${run.status}.`}).eq("account_id",accountId).eq("key",key);throw new Error(`Apify terminó ${run.status}. Puedes aportar una transcripción.`)}
  const dataRes=await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&limit=100`,{headers,signal:AbortSignal.timeout(30000)})
  if(!dataRes.ok)throw new Error("No se pudieron leer los resultados de Apify.")
  const items=await dataRes.json()
  if(!Array.isArray(items))throw new Error("La extracción no devolvió registros.")
  const updated=await db.from("vc2_sources").update({status:"done",data:items}).eq("account_id",accountId).eq("key",key)
  if(updated.error)throw new Error(updated.error.message)
  return {waiting:false,items}
}

// Segundo extractor para videos sin subtítulos públicos. Usa el mismo presupuesto/cache,
// y devuelve contexto visual analizado cuando el proveedor consigue recuperarlo.
export async function recoverTikTokAudio(accountId:string,campaignId:string,url:string){
  const r=await actorData(accountId,campaignId,"clockworks/tiktok-scraper",{
    postURLs:[url],resultsPerPage:1,shouldDownloadVideos:false,
    downloadSubtitlesOptions:"DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES",aiVideoDescription:true
  },"transcript")
  if(r.waiting)return {waiting:true as const}
  const item=r.items[0]||{}, meta=(item.videoMeta||{}) as Record<string,unknown>
  const subtitles=Array.isArray(meta.subtitleLinks)?meta.subtitleLinks as Record<string,unknown>[]:[]
  const link=typeof meta.transcriptionLink==="string"?meta.transcriptionLink:subtitles.find(x=>typeof x.downloadLink==="string")?.downloadLink
  let transcript=""
  if(typeof link==="string"){
    const u=new URL(link)
    // Credencial solo hacia el host oficial; no se siguen redirecciones arbitrarias.
    if(u.protocol==="https:"&&u.hostname==="api.apify.com"&&!u.username&&!u.password&&!u.port){
      const response=await fetch(u,{headers:{Authorization:`Bearer ${await apifyToken(accountId)}`},redirect:"error",signal:AbortSignal.timeout(20000)})
      if(response.ok)transcript=transcriptText((await response.text()).slice(0,150000)).slice(0,30000)
    }
  }
  return {waiting:false as const,transcript,duration:Number(meta.duration)||null,
    visual:Array.isArray(meta.aiVideoDescription)?JSON.stringify(meta.aiVideoDescription).slice(0,18000):""}
}
