import { referenceUrl, text, type Reference } from "./model"
export function numberOrNull(value: unknown): number|null {
  if(value===null||value===undefined||value==="")return null
  const n=Number(value);return Number.isFinite(n)&&n>=0?n:null
}
export function normalizeReference(item: Record<string,unknown>,platform: Reference["platform"]): Reference|null {
  if(item.isAd||item.isSponsored||item.isSlideshow)return null
  if(platform==="INSTAGRAM"&&item.type&&item.type!=="Video")return null
  const author=(item.authorMeta||{}) as Record<string,unknown>
  const raw=platform==="TIKTOK"?item.webVideoUrl||item.url:item.url
  let url:string
  try{url=referenceUrl(raw)}catch{return null}
  const first=(...v:unknown[])=>v.map(numberOrNull).find(x=>x!==null)??null
  return {url,author:text(platform==="TIKTOK"?author.name:item.ownerUsername,100),platform,caption:text(platform==="TIKTOK"?item.text:item.caption,6000),views:platform==="TIKTOK"?numberOrNull(item.playCount):first(item.videoPlayCount,item.igPlayCount,item.videoViewCount),likes:numberOrNull(platform==="TIKTOK"?item.diggCount:item.likesCount),comments:numberOrNull(platform==="TIKTOK"?item.commentCount:item.commentsCount),shares:platform==="TIKTOK"?numberOrNull(item.shareCount):null,publishedAt:text(item.createTimeISO||item.timestamp,80)||null,capturedAt:new Date().toISOString(),selectedByUser:false}
}
export function rankReferences(items: Reference[],now=Date.now()): Reference[] {
  const unique=[...new Map(items.map(x=>[x.url,x])).values()]
  const eligible=unique.filter(r=>r.views!==null&&r.likes!==null&&r.views>=60000&&r.likes>=1000&&(!r.publishedAt||now-Date.parse(r.publishedAt)<=90*86400000))
  const score=(r:Reference)=>Math.log10((r.views||0)+1)*.45+Math.log10((r.likes||0)+1)*.25+Math.min((r.likes||0)/(r.views||1),.2)*5*.15
  return eligible.sort((a,b)=>score(b)-score(a))
}
