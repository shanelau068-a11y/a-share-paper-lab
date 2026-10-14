import test from 'node:test';import assert from 'node:assert/strict';
import {addOrder,newAccount,matchOrders,fees,analyze,liveReason,parseQuote} from '../src/engine.mjs';
const now=new Date('2026-10-14T10:00:00+08:00');
const makeItem=(patch={})=>({symbol:'sz000001',type:'stock',bars:[],quote:{name:'平安银行',price:10,prevClose:10,ask:10,askLots:1000,bid:10,bidLots:1000,upper:11,lower:9,volume:10000,date:'2026-10-14',timestamp:now.toISOString(),...patch}});
const order=(a,side='buy',qty=100,limit=10.5)=>addOrder(a,{symbol:'sz000001',side,qty,limit},new Date(now-10000));
test('T+1 blocks same-day selling; next dated live session unlocks shares',()=>{
 const a=newAccount();order(a);matchOrders(a,[makeItem()],now);assert.equal(a.lots[0].qty,100);assert.equal(a.trades[0].price,10.01);
 const originalCash=a.cash;order(a,'sell',100,9.5);matchOrders(a,[makeItem()],now);assert.equal(a.cash,originalCash);assert.match(a.orders[0].message,/T\+1/);
 const next=new Date('2026-10-15T10:00:00+08:00');matchOrders(a,[makeItem({date:'2026-10-15',timestamp:next.toISOString()})],next);assert.equal(a.lots.length,0);assert.equal(a.trades.length,2);
});
test('stale, future, holiday, lunch, suspension, missing-depth and locked-limit quotes do not fill',()=>{
 for(const [patch,clock]of [[{timestamp:new Date(now-100000).toISOString()},now],[{timestamp:new Date(+now+1000).toISOString()},now],[{date:'2026-10-13'},now],[{},new Date('2026-10-14T12:00:00+08:00')],[{volume:0},now],[{askLots:0},now],[{ask:11},now],[{upper:0},now]]){
 const a=newAccount();order(a);matchOrders(a,[makeItem(patch)],clock);assert.equal(a.trades.length,0);assert.equal(a.cash,100000);}
});
test('no fills using quotes that predate the order, and limit includes adverse slippage',()=>{
 const a=newAccount();addOrder(a,{symbol:'sz000001',side:'buy',qty:100,limit:10},new Date(now-1000));matchOrders(a,[makeItem()],now);assert.equal(a.trades.length,0);
 a.orders[0].limit=11;a.orders[0].createdAt=new Date(+now+1000).toISOString();matchOrders(a,[makeItem()],now);assert.equal(a.trades.length,0);
});
test('cash, position limit, queue order and no double fills',()=>{
 const a=newAccount();order(a,'buy',2100);matchOrders(a,[makeItem()],now);assert.equal(a.trades.length,0);assert.match(a.orders[0].message,/20%/);
 a.orders=[];a.cash=1500;a.lots=[{symbol:'sh600036',qty:9000,cost:10,date:'2026-10-13'}];order(a);order(a);matchOrders(a,[makeItem()],now);assert.equal(a.trades.length,1);assert.ok(a.cash>=0);assert.equal(a.orders.at(-1).status,'filled');
 matchOrders(a,[makeItem()],now);assert.equal(a.trades.length,1);
});
test('round-trip fee accounting reconciles exactly to cents',()=>{
 const a=newAccount();order(a);matchOrders(a,[makeItem()],now);assert.equal(Math.round(a.lots[0].cost*100*100),Math.round((100000-a.cash)*100));
 assert.deepEqual(fees(10000,'sell'),{commission:5,transfer:.1,stamp:5,total:10.1});assert.deepEqual(fees(10000,'sell','etf'),{commission:5,transfer:0,stamp:0,total:5});
});
test('corporate action crossing freezes existing holding and orders expire',()=>{
 const a=newAccount();a.lots=[{symbol:'sz000001',qty:100,cost:10,date:'2026-10-12'}];order(a,'sell',100,9);const i=makeItem();i.bars=[['2026-10-13','10','10','10','10','100',{fh_sh:'1'}]];matchOrders(a,[i],now);assert.equal(a.trades.length,0);assert.match(a.orders[0].message,/公司行为/);
 matchOrders(a,[i],new Date(+now+8*86400000));assert.equal(a.orders[0].status,'cancelled');
});
test('lot increments, supported boards, invalid prices are rejected',()=>{
 const a=newAccount();for(const patch of [{qty:1},{limit:0},{limit:1.234},{symbol:'sz300001'},{symbol:'sh688001'}])assert.throws(()=>addOrder(a,{symbol:'sz000001',side:'buy',qty:100,limit:10,...patch},now));
});
test('signals use completed daily bars only and never a future row',()=>{
 const rows=Array.from({length:90},(_,i)=>{const d=new Date(Date.UTC(2026,6,16+i)).toISOString().slice(0,10);const p=10+i*.01;return[d,''+p,''+p,''+(p+.1),''+(p-.1),'1000'];});
 const huge=['2026-10-14','100','100','100','100','10'];const future=['2026-10-15','999','999','999','999','10'];
 const a=analyze({symbol:'sz000001'},[...rows,huge,future],makeItem().quote,now);assert.equal(a.asOf,'2026-10-13');assert.ok(a.ma20<20);
 const b=analyze({symbol:'sz000001'},[...rows,huge,future],makeItem().quote,new Date('2026-10-14T15:16:00+08:00'));assert.equal(b.asOf,'2026-10-14');assert.ok(b.ma20<100);
});
test('quote parser rejects malformed data and parses market timestamp',()=>{
 assert.throws(()=>parseQuote('sz000001',[]));const f=Array(50).fill('0');f[1]='平安银行';f[3]='10';f[30]='20261014100000';f[47]='11';f[48]='9';const q=parseQuote('sz000001',f);assert.equal(q.date,'2026-10-14');assert.equal(q.upper,11);assert.match(liveReason(q,now),/成交量/);
});
