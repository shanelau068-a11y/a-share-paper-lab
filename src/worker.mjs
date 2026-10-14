import {marketSnapshot} from './market.mjs';
let snapshot=null,pending=null;
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/market'){
    if(request.method!=='GET')return new Response('Method not allowed',{status:405});
    try{
      if(!snapshot||Date.now()-new Date(snapshot.fetchedAt)>20000){
        pending??=marketSnapshot().finally(()=>{pending=null;});
        snapshot=await pending;
      }
      return Response.json(snapshot,{headers:{'Cache-Control':'no-store'}});
    }catch(e){return Response.json({error:'行情获取失败：'+e.message,unavailable:true},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
  return env.ASSETS.fetch(request);
}};
