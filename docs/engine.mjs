export const money = x => Math.round((x + Number.EPSILON) * 100) / 100;
export function cnTime(now = new Date()) {
  const s = new Date(now.getTime()+8*3600000).toISOString();
  return {date:s.slice(0,10), time:s.slice(11,19), weekday:new Date(s).getUTCDay()};
}
export function parseQuote(symbol, fields) {
  const n=i=>Number(fields[i])||0, stamp=fields[30]||'';
  if(!/^\d{14}$/.test(stamp)||!fields[1]||!(n(3)>0)) throw Error('行情字段不完整');
  return {symbol,name:fields[1],price:n(3),prevClose:n(4),open:n(5),volume:n(6),bid:n(9),bidLots:n(10),ask:n(19),askLots:n(20),
    timestamp:stamp.slice(0,4)+'-'+stamp.slice(4,6)+'-'+stamp.slice(6,8)+'T'+stamp.slice(8,10)+':'+stamp.slice(10,12)+':'+stamp.slice(12,14)+'+08:00',
    date:stamp.slice(0,4)+'-'+stamp.slice(4,6)+'-'+stamp.slice(6,8),upper:n(47),lower:n(48),high:n(33),low:n(34)};
}
export function liveReason(q,now=new Date()) {
  const t=cnTime(now), ms=now-new Date(q?.timestamp), minutes=t.time.slice(0,5);
  if(!q||!Number.isFinite(ms)||ms<0||ms>90000) return '行情超过90秒或时间异常，暂停撮合';
  if(q.date!==t.date||[0,6].includes(t.weekday)||!((minutes>='09:30'&&minutes<'11:30')||(minutes>='13:00'&&minutes<'14:57'))) return '当前不在支持的连续竞价时段；可挂单，开市后刷新撮合';
  if(q.volume<=0) return '停牌或无有效成交量';
  return '';
}
export function analyze(item,rows,q,now=new Date()) {
  const t=cnTime(now);
  const bars=rows.filter(r=>r[0]<t.date||(r[0]===t.date&&t.time>='15:15:00'));
  if(bars.length<60) return {...item,quote:q,eligible:false,reason:'不足60个已完成交易日',bars:bars.slice(-60)};
  const close=bars.map(r=>Number(r[2])), last=close.at(-1), avg=n=>close.slice(-n).reduce((a,b)=>a+b,0)/n;
  const ma20=avg(20),ma60=avg(60),ret20=last/close.at(-21)-1;
  const diffs=close.slice(-20).map((v,i)=>v/close.at(i-21)-1);
  const vol=Math.sqrt(diffs.reduce((a,b)=>a+b*b,0)/diffs.length)*Math.sqrt(252);
  const event=bars.slice(-21).some(r=>r[6]&&typeof r[6]==='object');
  const risk=/ST|退/.test(q.name)||event||vol>0.60;
  const trend=last>ma20&&ma20>ma60, extended=last/ma20>1.06;
  const eligible=trend&&!risk&&!extended&&ret20>0&&ret20<0.20;
  const score=Math.round(1000*(ret20-vol*.18+(ma20/ma60-1)*.5))/10;
  // Ranges are rule thresholds using completed unadjusted bars; not forecasts.
  return {...item,quote:q,bars:bars.slice(-60),asOf:bars.at(-1)[0],ma20:money(ma20),ma60:money(ma60),ret20,vol,eligible,score,
    entryLow:money(ma20*.99),entryHigh:money(ma20*1.02),stop:money(ma20*.94),target:money(last*1.10),
    reason:risk?(event?'近21日有公司行为，暂停信号':'风险标签或波动偏高'):!trend?'均线趋势条件未满足':extended?'离20日均线较远，暂不追入':ret20>=.20?'20日涨幅超过规则阈值':'趋势、涨幅及波动条件通过'};
}
export function fees(notional,side,type='stock') {
  const commission=money(Math.max(5,notional*.0003)), transfer=type==='stock'?money(notional*.00001):0;
  const stamp=type==='stock'&&side==='sell'?money(notional*.0005):0;
  return {commission,transfer,stamp,total:money(commission+transfer+stamp)};
}
export const newAccount=()=>({version:1,initial:100000,cash:100000,lots:[],orders:[],trades:[],createdAt:new Date().toISOString()});
export function validateAccount(a){
  if(a?.version!==1||!Number.isFinite(a.cash)||a.cash<0||a.initial!==100000||!Array.isArray(a.lots)||!Array.isArray(a.orders)||!Array.isArray(a.trades)) throw Error('备份格式不正确');
  if(a.lots.some(l=>!Number.isInteger(l.qty)||l.qty<=0||!Number.isFinite(l.cost)||l.cost<=0||!/^\d{4}-\d{2}-\d{2}$/.test(l.date)||! /^(sh|sz)\d{6}$/.test(l.symbol))) throw Error('持仓数据不正确');
  if(a.orders.some(o=>!['buy','sell'].includes(o.side)||!Number.isInteger(o.qty)||o.qty<=0||o.qty%100||!Number.isFinite(o.limit)||o.limit<=0||!['pending','filled','cancelled','rejected'].includes(o.status)||!Number.isFinite(Date.parse(o.createdAt)))) throw Error('委托数据不正确');
  return a;
}
export function addOrder(a,{symbol,side,qty,limit},now=new Date()) {
  if(!/^(sh60|sz00)\d{4}$/.test(symbol)&&!/^sh510(050|300|500)$/.test(symbol)) throw Error('只支持当前主板股票及三只A股宽基ETF');
  if(!['buy','sell'].includes(side)||!Number.isInteger(qty)||qty<=0||qty%100!==0||!Number.isFinite(limit)||limit<=0||Math.abs(money(limit)-limit)>1e-8) throw Error('请输入100股整数倍数量、两位小数以内的正价格');
  if(a.orders.filter(o=>o.status==='pending').length>=20) throw Error('最多保留20笔待成交委托');
  const order={id:crypto.randomUUID(),symbol,side,qty,limit,createdAt:now.toISOString(),status:'pending',message:'待行情刷新；委托7天后自动失效'};
  a.orders.unshift(order);return order;
}
export function matchOrders(a,items,now=new Date()) {
  const day=cnTime(now).date, byId=new Map(items.map(i=>[i.symbol,i]));
  for(const o of [...a.orders].reverse()) {
    if(o.status!=='pending')continue;
    if(now-new Date(o.createdAt)>7*86400000){o.status='cancelled';o.message='7天未成交，自动失效';continue;}
    const item=byId.get(o.symbol),q=item?.quote;
    if(!item){o.message='该标的行情获取失败';continue;}
    let reason=liveReason(q,now);if(reason){o.message=reason;continue;}
    if(new Date(q.timestamp)<new Date(o.createdAt)){o.message='等待下单之后的新行情';continue;}
    if(/ST|退/.test(q.name)){o.message='风险警示/退市标的不支持撮合';continue;}
    const lots=a.lots.filter(l=>l.symbol===o.symbol);
    const action=item.bars?.some(r=>r[6]&&lots.some(l=>l.date<r[0]));
    if(action){o.message='持仓跨公司行为日，当前版本不支持分红送转结算，请先导出记录';continue;}
    const raw=o.side==='buy'?q.ask:q.bid, depth=o.side==='buy'?q.askLots:q.bidLots;
    if(!(raw>0)||depth*100<o.qty){o.message='一档报价或一档数量不足，不模拟排队成交';continue;}
    if(q.upper<=0||q.lower<=0||raw<=q.lower||raw>=q.upper){o.message='涨跌停或涨跌停价格缺失，保守暂停撮合';continue;}
    const price=(o.side==='buy'?Math.ceil(raw*1.0005*100-1e-8):Math.floor(raw*.9995*100+1e-8))/100;
    if(price>=q.upper||price<=q.lower){o.message='滑点后触及涨跌停，不撮合';continue;}
    if(o.side==='buy'?price>o.limit:price<o.limit){o.message='当前报价加滑点未达到你的限价';continue;}
    const amount=money(price*o.qty),fee=fees(amount,o.side,item.type);
    if(o.side==='buy') {
      const equity=a.cash+a.lots.reduce((s,l)=>s+l.qty*(byId.get(l.symbol)?.quote?.price||l.cost),0);
      const exposure=lots.reduce((s,l)=>s+l.qty*q.price,0);
      if(amount+fee.total>a.cash){o.message='虚拟现金不足';continue;}
      if(exposure+amount>equity*.20){o.message='超过单一标的20%虚拟资产上限';continue;}
      a.cash=money(a.cash-amount-fee.total);a.lots.push({symbol:o.symbol,qty:o.qty,cost:(amount+fee.total)/o.qty,date:day});
    } else {
      const available=lots.filter(l=>l.date<day).reduce((s,l)=>s+l.qty,0);
      if(available<o.qty){o.message='可卖数量不足（当日买入按T+1锁定）';continue;}
      let remain=o.qty;for(const l of a.lots){if(l.symbol!==o.symbol||l.date>=day)continue;const take=Math.min(l.qty,remain);l.qty-=take;remain-=take;if(!remain)break;}
      a.lots=a.lots.filter(l=>l.qty>0);a.cash=money(a.cash+amount-fee.total);
    }
    o.status='filled';o.message='按刷新时一档报价和0.05%不利滑点模拟成交';
    a.trades.unshift({id:o.id,symbol:o.symbol,name:q.name,side:o.side,qty:o.qty,price,fee:fee.total,time:now.toISOString()});
  }
  return a;
}
