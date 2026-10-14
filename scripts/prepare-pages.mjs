import {cp,mkdir} from 'node:fs/promises';
await mkdir('docs',{recursive:true});await cp('dist/client','docs',{recursive:true});
console.log('GitHub Pages output prepared in docs/. Only application assets included.');
