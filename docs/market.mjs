import {universe} from './universe.mjs';
import {analyze,parseQuote} from './engine.mjs';
const historyCache=new Map();
async function getText(url,encoding='utf-8'){
  const r=await fetch(url,{signal:AbortSignal.timeout(6000)});
  if(!r.ok)throw Error('行情服务HTTP '+r.status);
  return new TextDecoder(encoding).decode(await r.arrayBuffer());
}
export async function marketSnapshot(now=new Date()){
  const quotesText=await getText('https://qt.gtimg.cn/q='+universe.map(i=>i.symbol).join(','),'gb18030');
  const quotes=new Map();
  for(const m of quotesText.matchAll(/v_((?:sh|sz)\d{6})="([^"]*)"/g)){
    try{quotes.set(m[1],parseQuote(m[1],m[2].split('~')));}catch{}
  }
  if(!quotes.size)throw Error('未取得有效行情，不生成候选');
  const results=[],errors=[];
  for(let i=0;i<universe.length;i+=11){
    await Promise.all(universe.slice(i,i+11).map(async item=>{
      try{
        const q=quotes.get(item.symbol);if(!q)throw Error('报价缺失');
        let entry=historyCache.get(item.symbol);
        if(!entry||now-entry.at>120000){
          const json=JSON.parse(await getText('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+item.symbol+',day,,,100,'));
          const rows=json.data?.[item.symbol]?.day;
          if(!Array.isArray(rows)||rows.length<60)throw Error('日线不足或接口格式变化');
          entry={rows,at:now};historyCache.set(item.symbol,entry);
        }
        results.push(analyze(item,entry.rows,q,now));
      }catch(e){errors.push({symbol:item.symbol,name:item.name,message:e.message});}
    }));
  }
  if(results.length<1)throw Error('报价存在，但日线全部获取失败');
  const candidates=results.filter(i=>i.type==='stock'&&i.eligible).sort((a,b)=>b.score-a.score).slice(0,10).map(i=>i.symbol);
  return {fetchedAt:now.toISOString(),source:'腾讯财经公开行情接口（非交易所直连，无服务保证）',universeSize:universe.length,
    items:results.sort((a,b)=>universe.findIndex(i=>i.symbol===a.symbol)-universe.findIndex(i=>i.symbol===b.symbol)),candidates,errors};
}
