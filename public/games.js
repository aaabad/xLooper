// Local side games for a group of 2–4 players. Pure functions, no DOM.
// Tournaments are a separate board and are not settled here. A later event can pass the same scores into settle().
(function(root){
const SI=[1,11,3,15,5,13,7,17,9,2,12,4,16,6,14,8,18,10];
const TYPES=['none','skins','nassau','match','stroke','wolf','bbb'];
function round2(n){return Math.round((+n||0)*100)/100}
function strokesOnHole(hcp,hole){
  const h=Math.round(+hcp||0), si=SI[hole-1]||hole;
  if(h>=0)return Math.floor(h/18)+((h%18)>=si?1:0);
  const give=-h;return -(Math.floor(give/18)+((give%18)>=si?1:0));
}
function playingStrokes(players,hole,useHcp){
  const out={};
  if(!useHcp){players.forEach(p=>{out[p.id]=0});return out}
  const base=Math.min(...players.map(p=>Math.round(+p.hcp||0)));
  players.forEach(p=>{out[p.id]=strokesOnHole(Math.round(+p.hcp||0)-base,hole)});
  return out;
}
function holeGross(scores,id,hole){
  const sc=scores&&scores[id]&&scores[id][hole];
  if(!sc||!(+sc.s>0))return null;
  return +sc.s;
}
function completeHoles(players,scores){
  const holes=[];
  for(let h=1;h<=18;h++){
    if(players.every(p=>holeGross(scores,p.id,h)!=null))holes.push(h);
  }
  return holes;
}
function zero(players){const o={};players.forEach(p=>{o[p.id]=0});return o}
function payEach(balances,players,winnerId,amount){
  players.forEach(p=>{if(p.id===winnerId)return;balances[winnerId]+=amount;balances[p.id]-=amount});
}
function teeOrder(players,prevScores,prevOrder){
  const order=(prevOrder&&prevOrder.length?prevOrder:players.map(p=>p.id)).slice();
  if(!prevScores)return players.slice().sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  return players.slice().sort((a,b)=>{
    const as=prevScores[a.id], bs=prevScores[b.id];
    const av=as==null?999:as, bv=bs==null?999:bs;
    if(av!==bv)return av-bv;
    return order.indexOf(a.id)-order.indexOf(b.id);
  });
}
function awayOrder(ids,distById){
  return ids.slice().sort((a,b)=>(distById[b]||0)-(distById[a]||0));
}
function money(currency,n){
  const v=round2(n), sign=v<0?'-':'', abs=Math.abs(v);
  const s=Math.abs(abs-Math.round(abs))<0.001?String(Math.round(abs)):abs.toFixed(2);
  return sign+(currency||'$')+s;
}
function transfersOf(players,balances){
  const debt=players.filter(p=>balances[p.id]<-0.001).map(p=>({id:p.id,name:p.name,left:-balances[p.id]})).sort((a,b)=>b.left-a.left);
  const cred=players.filter(p=>balances[p.id]>0.001).map(p=>({id:p.id,name:p.name,left:balances[p.id]})).sort((a,b)=>b.left-a.left);
  const out=[];let i=0,j=0;
  while(i<debt.length&&j<cred.length){
    const pay=round2(Math.min(debt[i].left,cred[j].left));
    if(pay>0)out.push({from:debt[i].id,to:cred[j].id,fromName:debt[i].name,toName:cred[j].name,amount:pay});
    debt[i].left=round2(debt[i].left-pay);cred[j].left=round2(cred[j].left-pay);
    if(debt[i].left<=0.001)i++;
    if(cred[j].left<=0.001)j++;
  }
  return out;
}
function totalsOf(players,scores,useHcp){
  return players.map(p=>{
    let gross=0,net=0,putts=0,n=0;
    for(let h=1;h<=18;h++){
      const g=holeGross(scores,p.id,h);if(g==null)continue;
      const sc=scores[p.id][h];
      gross+=g;putts+=+sc.p||0;n++;
      net+=g-(useHcp?playingStrokes(players,h,true)[p.id]:0);
    }
    return {id:p.id,name:p.name,gross,net,putts,n};
  }).sort((a,b)=>(useHcp?a.net-b.net:a.gross-b.gross)||a.gross-b.gross);
}
function pack(players,balances,extra){
  const rows=players.map(p=>({id:p.id,name:p.name,amount:round2(balances[p.id]||0),detail:extra.detail&&extra.detail[p.id]||''}));
  return Object.assign({
    ok:true,rows,transfers:transfersOf(players,balances),
    note:'Friendly scorekeeping only. No money is handled.',
    totals:extra.totals||[],lines:extra.lines||[],through:extra.through||0,title:extra.title||'',type:extra.type||'none',currency:extra.currency||'$',empty:!extra.type||extra.type==='none'
  });
}
function settleSkins(players,scores,opts){
  const balances=zero(players), won=zero(players), lines=[];
  let carry=0, through=0;
  for(const h of completeHoles(players,scores)){
    through=h;carry+=1;
    const strokes=playingStrokes(players,h,opts.useHcp);
    const nets=players.map(p=>({id:p.id,name:p.name,n:holeGross(scores,p.id,h)-strokes[p.id]}));
    const best=Math.min(...nets.map(x=>x.n));
    const winners=nets.filter(x=>x.n===best);
    if(winners.length===1){
      payEach(balances,players,winners[0].id,round2(opts.stake*carry));
      won[winners[0].id]+=carry;
      lines.push('Hole '+h+': '+winners[0].name+' wins '+carry+' skin'+(carry>1?'s':''));
      carry=0;
    }else lines.push('Hole '+h+': tie, '+carry+' skin'+(carry>1?'s':'')+' carry');
  }
  if(carry)lines.push(carry+' skin'+(carry>1?'s':'')+' not won');
  const detail={};players.forEach(p=>{detail[p.id]=won[p.id]+' skin'+(won[p.id]===1?'':'s')});
  return pack(players,balances,{type:'skins',title:'Skins',currency:opts.currency,lines,detail,through,totals:totalsOf(players,scores,opts.useHcp)});
}
function segmentWinner(players,scores,holes,opts){
  if(!holes.length)return null;
  const totals=players.map(p=>{
    let n=0;holes.forEach(h=>{n+=holeGross(scores,p.id,h)-playingStrokes(players,h,opts.useHcp)[p.id]});
    return {id:p.id,name:p.name,n};
  });
  const best=Math.min(...totals.map(t=>t.n));
  const winners=totals.filter(t=>t.n===best);
  return {totals,winner:winners.length===1?winners[0]:null};
}
function addBet(balances,players,winner,stake,lines,label){
  if(!winner){lines.push(label+': push');return}
  payEach(balances,players,winner.id,stake);
  lines.push(label+': '+winner.name);
}
function settleNassau(players,scores,opts){
  const balances=zero(players), lines=[], done=completeHoles(players,scores);
  const front=done.filter(h=>h<=9), back=done.filter(h=>h>=10);
  if(front.length)addBet(balances,players,segmentWinner(players,scores,front,opts).winner,opts.stake,lines,'Front');
  if(back.length)addBet(balances,players,segmentWinner(players,scores,back,opts).winner,opts.stake,lines,'Back');
  if(done.length)addBet(balances,players,segmentWinner(players,scores,done,opts).winner,opts.stake,lines,'Overall');
  if(opts.presses){
    for(const nine of [[1,9,'Front press'],[10,18,'Back press']]){
      const holes=done.filter(h=>h>=nine[0]&&h<=nine[1]);
      let pressFrom=0;
      for(let i=1;i<holes.length;i++){
        const soFar=holes.slice(0,i+1);
        if(soFar[soFar.length-1]===nine[1])break;
        const seg=segmentWinner(players,scores,soFar,opts);
        if(!seg)continue;
        const nums=seg.totals.map(t=>t.n), margin=Math.max(...nums)-Math.min(...nums);
        if(margin>=2){pressFrom=holes[i+1]||0;break}
      }
      if(!pressFrom)continue;
      const ph=holes.filter(h=>h>=pressFrom);
      if(!ph.length)continue;
      addBet(balances,players,segmentWinner(players,scores,ph,opts).winner,opts.stake,lines,nine[2]+' '+ph[0]+'–'+ph[ph.length-1]);
    }
  }
  const detail={};players.forEach(p=>{detail[p.id]=''});
  return pack(players,balances,{type:'nassau',title:'Nassau',currency:opts.currency,lines,detail,through:done.length?done[done.length-1]:0,totals:totalsOf(players,scores,opts.useHcp)});
}
function pairs(players){const out=[];for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)out.push([players[i],players[j]]);return out}
function settleMatch(players,scores,opts){
  const balances=zero(players), lines=[], done=completeHoles(players,scores);
  pairs(players).forEach(([a,b])=>{
    let aw=0,bw=0;
    done.forEach(h=>{
      const strokes=playingStrokes(players,h,opts.useHcp);
      const an=holeGross(scores,a.id,h)-strokes[a.id], bn=holeGross(scores,b.id,h)-strokes[b.id];
      if(an<bn)aw++;else if(bn<an)bw++;
    });
    const up=aw-bw;
    if(up>0){balances[a.id]+=opts.stake;balances[b.id]-=opts.stake;lines.push(a.name+' is '+up+' up on '+b.name)}
    else if(up<0){balances[b.id]+=opts.stake;balances[a.id]-=opts.stake;lines.push(b.name+' is '+(-up)+' up on '+a.name)}
    else lines.push(a.name+' all square with '+b.name);
  });
  return pack(players,balances,{type:'match',title:'Match play',currency:opts.currency,lines,detail:{},through:done.length?done[done.length-1]:0,totals:totalsOf(players,scores,opts.useHcp)});
}
function settleStroke(players,scores,opts){
  const balances=zero(players), lines=[], done=completeHoles(players,scores);
  const tot={};
  players.forEach(p=>{
    let n=0;done.forEach(h=>{n+=holeGross(scores,p.id,h)-playingStrokes(players,h,opts.useHcp)[p.id]});
    tot[p.id]=n;
  });
  pairs(players).forEach(([a,b])=>{
    const diff=tot[b.id]-tot[a.id];
    const amt=round2(Math.abs(diff)*opts.stake);
    if(!amt){lines.push(a.name+' and '+b.name+' tied');return}
    const win=diff>0?a:b, lose=diff>0?b:a;
    balances[win.id]+=amt;balances[lose.id]-=amt;
    lines.push(lose.name+' owes '+win.name+' '+Math.abs(diff)+' stroke'+(Math.abs(diff)===1?'':'s'));
  });
  const detail={};players.forEach(p=>{detail[p.id]=(opts.useHcp?tot[p.id]+' net':tot[p.id]+' gross')});
  return pack(players,balances,{type:'stroke',title:'Stroke play',currency:opts.currency,lines,detail,through:done.length?done[done.length-1]:0,totals:totalsOf(players,scores,opts.useHcp)});
}
function settleWolf(players,scores,wolf,opts){
  const balances=zero(players), lines=[], done=completeHoles(players,scores);
  if(players.length!==4){
    return pack(players,balances,{type:'wolf',title:'Wolf',currency:opts.currency,lines:['Wolf needs 4 players'],detail:{},through:0,totals:totalsOf(players,scores,opts.useHcp)});
  }
  done.forEach(h=>{
    const pick=wolf&&wolf[h];
    if(!pick||!players.some(p=>p.id===pick.wolf)){lines.push('Hole '+h+': no wolf');return}
    const strokes=playingStrokes(players,h,opts.useHcp);
    const netOf=id=>holeGross(scores,id,h)-strokes[id];
    const name=id=>players.find(p=>p.id===id).name;
    if(!pick.partner){
      const others=players.filter(p=>p.id!==pick.wolf);
      const best=Math.min(...others.map(p=>netOf(p.id)));
      const wn=netOf(pick.wolf), amt=round2(opts.stake*2);
      if(wn<best){others.forEach(p=>{balances[pick.wolf]+=amt;balances[p.id]-=amt});lines.push('Hole '+h+': '+name(pick.wolf)+' wolf wins')}
      else if(wn>best){others.forEach(p=>{balances[p.id]+=amt;balances[pick.wolf]-=amt});lines.push('Hole '+h+': '+name(pick.wolf)+' wolf loses')}
      else lines.push('Hole '+h+': wolf push');
      return;
    }
    const team=[pick.wolf,pick.partner];
    const opp=players.filter(p=>!team.includes(p.id)).map(p=>p.id);
    const teamBest=Math.min(netOf(team[0]),netOf(team[1]));
    const oppBest=Math.min(netOf(opp[0]),netOf(opp[1]));
    if(teamBest===oppBest){lines.push('Hole '+h+': push');return}
    const winners=teamBest<oppBest?team:opp, losers=teamBest<oppBest?opp:team;
    const share=round2(opts.stake/winners.length);
    losers.forEach(l=>winners.forEach(w=>{balances[w]+=share;balances[l]-=share}));
    lines.push('Hole '+h+': '+winners.map(name).join(' & '));
  });
  return pack(players,balances,{type:'wolf',title:'Wolf',currency:opts.currency,lines,detail:{},through:done.length?done[done.length-1]:0,totals:totalsOf(players,scores,opts.useHcp)});
}
function settleBingo(players,scores,bbb,opts){
  const balances=zero(players), points=zero(players), lines=[], done=completeHoles(players,scores);
  done.forEach(h=>{
    const pts=bbb&&bbb[h];
    if(!pts)return;
    ['bingo','bango','bongo'].forEach(key=>{
      const id=pts[key];
      if(!players.some(p=>p.id===id))return;
      points[id]+=1;
      payEach(balances,players,id,opts.stake);
    });
  });
  const detail={};players.forEach(p=>{detail[p.id]=points[p.id]+' pt'+(points[p.id]===1?'':'s')});
  lines.push(players.map(p=>p.name+' '+points[p.id]).join(', '));
  return pack(players,balances,{type:'bbb',title:'Bingo Bango Bongo',currency:opts.currency,lines,detail,through:done.length?done[done.length-1]:0,totals:totalsOf(players,scores,opts.useHcp)});
}
function settle(model){
  const opts={
    type:TYPES.includes(model&&model.type)?model.type:'none',
    stake:Math.max(0,+((model&&model.stake)||0)),
    currency:model&&model.currency==='₱'?'₱':'$',
    useHcp:!!(model&&model.useHcp),
    presses:!!(model&&model.presses)
  };
  const players=(model&&model.players||[]).slice(0,4).filter(p=>p&&p.id);
  const scores=model&&model.scores||{};
  const base={type:opts.type,title:'No bet',currency:opts.currency,lines:[],detail:{},through:0,totals:totalsOf(players,scores,opts.useHcp)};
  if(players.length<2||opts.type==='none')return pack(players,zero(players),base);
  if(opts.type==='skins')return settleSkins(players,scores,opts);
  if(opts.type==='nassau')return settleNassau(players,scores,opts);
  if(opts.type==='match')return settleMatch(players,scores,opts);
  if(opts.type==='stroke')return settleStroke(players,scores,opts);
  if(opts.type==='wolf')return settleWolf(players,scores,model.wolf||{},opts);
  if(opts.type==='bbb')return settleBingo(players,scores,model.bbb||{},opts);
  return pack(players,zero(players),base);
}
root.XLGames={SI,strokesOnHole,playingStrokes,teeOrder,awayOrder,money,settle};
})(typeof globalThis!=='undefined'?globalThis:this);
