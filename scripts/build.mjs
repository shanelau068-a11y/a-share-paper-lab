import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/client',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await cp('public','dist/client',{recursive:true});
for(const f of ['engine.mjs','universe.mjs','market.mjs'])await cp('src/'+f,'dist/client/'+f);
await writeFile('dist/client/.nojekyll','');
for(const f of ['worker.mjs','market.mjs','engine.mjs','universe.mjs'])await cp('src/'+f,'dist/server/'+(f==='worker.mjs'?'index.js':f));
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'a-share-paper-lab',main:'index.js',compatibility_date:'2026-05-15',no_bundle:true,
  rules:[{type:'ESModule',globs:['**/*.js','**/*.mjs']}],assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']}}));
console.log('Built Worker + static assets. No credentials or personal planning files included.');
