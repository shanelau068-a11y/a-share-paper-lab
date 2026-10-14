import http from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';
import {marketSnapshot} from '../src/market.mjs';
let cache=null,pending=null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/market'){
      if(!cache||Date.now()-new Date(cache.fetchedAt)>20000){pending??=marketSnapshot().finally(()=>{pending=null;});cache=await pending;}
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(cache));return;
    }
    const f=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(f.includes('..')||f.includes('\\'))throw Error('Invalid path');
    const base=['engine.mjs','universe.mjs','market.mjs'].includes(f)?'src':'public';
    const content=await readFile(path.join(base,f));res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(content);
  }catch(e){res.writeHead(req.url.startsWith('/api')?503:404,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message,unavailable:true}));}
});server.listen(4186,'127.0.0.1',()=>console.log('http://127.0.0.1:4186'));
