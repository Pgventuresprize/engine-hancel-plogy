import "server-only"
import { createHash } from "node:crypto"
import { secretosDe } from "../secretos"
import { supabaseAdmin } from "../supabase-admin"
import { apifyToken } from "./repository"
import { transcriptText } from "./transcript"

export async function jsonModel(accountId: string, system: string, prompt: string, options: { web?: boolean; model?: string } = {}): Promise<{ text: string; model: string; usage: { input: number; output: number } }> {
  const s=await secretosDe(accountId)
  const token=process.env.ANTHROPIC_API_KEY||s.claude_oauth_token?.replace(/\s+/g,"")
  if(!token)throw new Error("Configura la conexión de Claude de esta cuenta en Plogy.")
  const model=options.model||s.model_contenido||"claude-sonnet-5"
  const headers: Record<string,string>={"content-type":"application/json","anthropic-version":"2023-06-01"}
  const oauth=!token.startsWith("sk-ant-api")&&!process.env.ANTHROPIC_API_KEY
  if(oauth){headers.authorization=`Bearer ${token}`;headers["anthropic-beta"]="oauth-2025-04-20"}else headers["x-api-key"]=token
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers,signal:AbortSignal.timeout(165000),body:JSON.stringify({model,max_tokens:8000,system:[...(oauth?[{type:"text",text:"You are Claude Code, Anthropic's official CLI for Claude."}]:[]),{type:"text",text:system}],messages:[{role:"user",content:prompt}],...(options.web?{tools:[{type:"web_search_20250305",name:"web_search",max_uses:4}]}:{})})})
  const body=await res.json()
  if(!res.ok)throw new Error(`Claude no pudo completar el paso (HTTP ${res.status}). Revisa la conexión y el modelo de la cuenta.`)
  if(body.stop_reason==="max_tokens")throw new Error("La respuesta se cortó por longitud. Reintenta con una pieza más acotada.")
  const output=(body.content||[]).filter((x:{type:string})=>x.type==="text").map((x:{text:string})=>x.text).join("\n")
  if(!output)throw new Error("Claude no devolvió texto utilizable.")
  return {text:output,model,usage:{input:Number(body.usage?.input_tokens||0)+Number(body.usage?.cache_read_input_tokens||0),output:Number(body.usage?.output_tokens||0)}}
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
      const body=await response.json()
      if(!response.ok||!body.data?.id)throw new Error("Apify rechazó el inicio de la corrida.")
      const update=await db.from("vc2_sources").update({status:"running",run_id:body.data.id}).eq("account_id",accountId).eq("key",key)
      if(update.error)throw new Error("No se pudo confirmar en el almacenamiento la corrida iniciada.")
      return {waiting:true}
    }catch {
      await db.from("vc2_sources").update({status:"error",error:"No se confirmó el resultado del inicio. Revisa la corrida en Apify antes de repetir para evitar gasto duplicado."}).eq("account_id",accountId).eq("key",key)
      throw new Error("No se confirmó la corrida. Revisa Apify; puedes pegar la transcripción para continuar sin repetir el gasto.")
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
