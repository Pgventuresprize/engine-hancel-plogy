import type { Phase, Piece, Reference, Topic } from "./model"

// Mantiene la política del gateway existente, sin escribir sus registros/tablas.
export function modelOutputPolicy(model:string,maxTokens=8000){
  const alwaysThinks=model.includes("opus-5-5")
  return {
    max_tokens:alwaysThinks?Math.max(maxTokens*2,8000):maxTokens,
    ...(alwaysThinks?{}:{thinking:{type:model.includes("-5-5")?"between_tools":"disabled"}})
  }
}
export function shortSearchQuery(topic:Topic):string{
  const stop=new Set(["para","el","la","los","las","de","del","con","y","en","un","una","por"])
  return topic.name.replace(/[^\p{L}\p{N}]+/gu," ").split(/\s+/).filter(w=>w&&!stop.has(w.toLowerCase())).slice(0,8).join(" ").slice(0,90)
}
const words=(value:string)=>value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[a-z0-9]+/g)||[]
export function topicAffinity(reference:Reference,topic:Topic):number{
  const stop=new Set(["para","como","con","las","los","una","del","que","por","mostrar","hacer","negocio","negocios","inteligencia","artificial"])
  const terms=[...new Set(words(topic.name+" "+topic.focus).filter(w=>w.length>2&&!stop.has(w)))]
  const source=words(reference.caption+" "+reference.author).join(" ")
  const matches=terms.filter(w=>new RegExp("\\b"+w.replace(/es$|s$/,"")+"(?:es|s)?\\b").test(source))
  return matches.length
}
export function pieceErrorLabel(piece:Pick<Piece,"phase"|"error">):string{
  if(/Define la oferta|Falta seleccionar la referencia|Falta material respaldado|no recuper.*voz|Pega.*transcrip/i.test(piece.error))return "Necesita material"
  if(/límite de corridas|presupuesto/i.test(piece.error))return "Límite de búsqueda"
  if(/HTTP 40[23]|cuota|saldo|créditos/i.test(piece.error))return "Apify necesita atención"
  if(piece.phase==="discover")return "Búsqueda sin resolver"
  if(piece.phase==="extract")return "No se recuperó el original"
  if(["write","concept","review"].includes(piece.phase))return "Error de generación"
  if(piece.phase==="research")return "Investigación pendiente"
  return "Necesita revisión"
}
export function retryPhase(piece:Pick<Piece,"phase"|"mode"|"script"|"transcript"|"reference"|"dossier">):Phase{
  if(piece.phase!=="done")return piece.phase
  if(piece.script)return "review"
  if(piece.mode==="replica")return piece.transcript?"write":piece.reference?"extract":"discover"
  return piece.mode==="adaptacion"?(piece.dossier?"write":"research"):"concept"
}
export function apifyStartFailure(status:number,type:string):string{
  if(status===401)return "Apify rechazó la clave (HTTP 401). Revisa la conexión de esta cuenta."
  if(status===402)return "Apify no permitió iniciar la corrida por cuota o saldo (HTTP 402). Revisa los límites de la cuenta."
  if(status===403)return "Apify no autorizó este actor (HTTP 403). Revisa el acceso y el plan de la cuenta."
  if(status===429)return "Apify alcanzó un límite temporal o de concurrencia (HTTP 429). Reintenta cuando terminen las corridas activas."
  return `Apify rechazó el inicio (HTTP ${status}${type?"; "+type:""}). No se confirmó ninguna corrida para esta solicitud.`
}
