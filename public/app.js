// xLooper v0.6 – voice golf caddy PWA
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const LL=window.L; // Leaflet. Local L below is the storage helper and would shadow it.
const L=(k,d)=>{try{return JSON.parse(localStorage['xl.'+k])??d}catch{return d}},P=(k,v)=>localStorage['xl.'+k]=JSON.stringify(v);
const DEF_CLUBS=[['Driver',200],['3W',180],['5H',165],['6i',150],['7i',140],['8i',130],['9i',120],['PW',105],['GW',90],['SW',75]];
let courses=L('courses',{'My Course':{pars:[4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5],greens:{}}});
let cur=L('cur',Object.keys(courses)[0]); if(!courses[cur])cur=Object.keys(courses)[0];
let round=L('round',null), hist=L('hist',[]), clubs=L('clubs',DEF_CLUBS), hole=L('hole',1), tour=L('tour',null), opts=L('opts',{autoread:true,metric:false});
let pos=null, acc=null, shot=L('shot',null), lastHeard=L('heard',0), msgs=[], tstate=null;
let searchHits=[], loadingCourse=false, autoTried=false, missSig='';
let xstate=L('xircle',{opens:0,asks:0,at:0,signup:null});
if(!xstate||typeof xstate!=='object'||Array.isArray(xstate))xstate={opens:0,asks:0,at:0,signup:null};
xstate.opens=(+xstate.opens||0)+1;P('xircle',xstate);
const C=()=>courses[cur], par=h=>C().pars[h-1]||4;
const save=()=>{P('courses',courses);P('cur',cur);P('round',round);P('hist',hist);P('clubs',clubs);P('hole',hole);P('tour',tour);P('opts',opts);P('shot',shot)};
const newRound=()=>({course:cur,date:new Date().toISOString(),holes:{}});
if(!round||round.course!==cur)round=newRound();
// ---------- speech ----------
let voice=null;const pickVoice=()=>{const v=speechSynthesis.getVoices();voice=v.find(x=>/en-US/.test(x.lang)&&/Samantha|Google US|Aaron|Daniel/.test(x.name))||v.find(x=>/^en/.test(x.lang))};
if('speechSynthesis'in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
function say(t){$('#log').textContent=t;if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);if(voice)u.voice=voice;u.rate=1;speechSynthesis.speak(u)}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function listen(cb,prompt){if(!SR){say("Voice input isn't supported in this browser. Use the buttons, or your keyboard's dictation mic.");return}
 const r=new SR();r.lang='en-US';r.interimResults=false;r.maxAlternatives=3;$('#log').textContent=prompt||'Listening…';
 r.onresult=e=>cb(e.results[0][0].transcript);r.onerror=e=>$('#log').textContent='Mic: '+e.error;try{speechSynthesis.cancel();r.start()}catch(e){}}
// ---------- geo ----------
const R=6371e3,rad=x=>x*Math.PI/180;
function dist(a,b){const dl=rad(b[0]-a[0]),dn=rad(b[1]-a[1]),h=Math.sin(dl/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const yds=m=>Math.round(opts.metric?m:m*1.09361),unit=()=>opts.metric?'meters':'yards';
if('geolocation'in navigator)navigator.geolocation.watchPosition(p=>{pos=[p.coords.latitude,p.coords.longitude];acc=p.coords.accuracy;$('#gps').textContent='GPS ±'+Math.round(acc*1.09)+'y';render();considerNearby();maybeAutoCourse();if(me)me.setLatLng(pos)},e=>$('#gps').textContent='GPS: '+e.message,{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
else $('#gps').textContent='No GPS';
let wake;async function keepAwake(){try{wake=await navigator.wakeLock?.request('screen')}catch{}}document.addEventListener('visibilitychange',()=>document.visibilityState==='visible'&&keepAwake());keepAwake();
const toGreen=()=>{const g=C().greens[hole];return g&&pos?dist(pos,g):null};
function clubFor(y){const s=[...clubs].sort((a,b)=>a[1]-b[1]);if(y<=40)return['putter or wedge chip',y];for(const c of s)if(c[1]>=y-4)return c;return s[s.length-1]}
// ---------- caddy actions ----------
function holeTargets(h){try{return window.XLMap?XLMap.targets(C(),h,pos):null}catch{return null}}
function sayYardage(){const g=C().greens[hole];if(!g)return say(`No green set for hole ${hole}. Open the map and tap the green.`);if(!pos)return say('Waiting for GPS.');
 const c=yds(dist(pos,g)),t=holeTargets(hole),f=t?yds(dist(pos,t.front)):c,b=t?yds(dist(pos,t.back)):c;
 if(f===c&&b===c)return say(`${c} ${unit()} to the center of the green on hole ${hole}.`);
 say(`${f} ${unit()} to the front, ${c} to the center, ${b} to the back of the green on hole ${hole}.`)}
function sayClub(){const d=toGreen();if(d==null)return sayYardage();const y=Math.round(d*1.09361),c=clubFor(y);
 say(y>clubs.reduce((m,c)=>Math.max(m,c[1]),0)?`${y} yards. Hit ${c[0]}, you won't reach, so play for position.`:y<=40?`${y} yards. Chip or putt.`:`${y} yards. I like the ${clubName(c[0])}.`)}
const clubName=n=>n.replace(/^(\d)i$/,'$1 iron').replace(/^(\d)W$/,'$1 wood').replace(/^(\d)H$/,'$1 hybrid').replace(/^PW$/,'pitching wedge').replace(/^GW$/,'gap wedge').replace(/^SW$/,'sand wedge').replace(/^LW$/,'lob wedge');
function markShot(){if(!pos)return say('Waiting for GPS.');if(shot&&shot.hole===hole){const m=dist(shot.at,pos);const y=yds(m);say(`That shot went ${y} ${unit()}. Marked a new start here.`);$('#lastshot').textContent=`Last shot: ${y} ${unit()}`}else say('Shot marked. Walk to your ball and say mark shot again.');shot={hole,at:pos};save()}
function totals(){let s=0,pp=0,pr=0,p=0,n=0;for(let h=1;h<=18;h++){const x=round.holes[h];if(x&&x.s){s+=x.s;pp+=x.p||0;pr+=par(h);n++}}return{s,putts:pp,par:pr,n,rel:s-pr}}
const relTxt=r=>r===0?'even par':r>0?`${r} over par`:`${-r} under par`,relS=r=>r===0?'E':r>0?'+'+r:''+r;
function sayScore(){const t=totals();if(!t.n)return say('No scores yet this round.');say(`Through ${t.n} hole${t.n>1?'s':''} you're at ${t.s}, ${relTxt(t.rel)}, with ${t.putts} putts.`)}
function setScore(s,p,h=hole){round.holes[h]={s,p:p??round.holes[h]?.p??0};save();render();postScore(h);const t=totals(),d=s-par(h);
 const name={'-3':'albatross','-2':'eagle','-1':'birdie','0':'par','1':'bogey','2':'double bogey'}[d]||(d>0?`${d} over`:'');
 say(`Hole ${h}: ${s}${p!=null?`, ${p} putt${p==1?'':'s'}`:''}. ${name}. You're ${relTxt(t.rel)} through ${t.n}.`)}
function go(h){hole=Math.max(1,Math.min(18,h));shot=null;save();render();const g=C().greens[hole];
 let extra='';if(g&&pos){const c=yds(dist(pos,g)),t=holeTargets(hole),f=t?yds(dist(pos,t.front)):c,b=t?yds(dist(pos,t.back)):c;extra=(f===c&&b===c)?` ${c} ${unit()} to the green.`:` ${f} front, ${c} center, ${b} back.`}
 say(`Hole ${hole}, par ${par(hole)}.`+extra)}
// ---------- voice commands ----------
const NUM={zero:0,one:1,won:1,two:2,to:2,too:2,three:3,four:4,for:4,five:5,six:6,seven:7,eight:8,ate:8,nine:9,ten:10,eleven:11,twelve:12};
const nums=t=>t.toLowerCase().replace(/[a-z]+/g,w=>w in NUM?NUM[w]:w).match(/\d+/g)?.map(Number)||[];
function command(t){const s=t.toLowerCase();$('#log').textContent='“'+t+'”';
 if(/read (the )?message|any message|messages/.test(s))return readMsgs(true);
 if(/^(send|message|tell|announce)/.test(s)){const txt=t.replace(/^(send( a)? message|send|message|tell everyone|tell|announce)\s*(that)?\s*/i,'');return txt?sendMsg(txt,/announce/.test(s)):voiceMsg()}
 if(/what('?s| is) my score|my score|how am i doing|total/.test(s))return sayScore();
 if(/score|i (got|made|shot|had)|put me down/.test(s)){const n=nums(s);if(!n.length)return say('Say score and a number, like score 5 with 2 putts.');const holeM=s.match(/hole (\d+)/);let h=hole;let arr=n;if(holeM){h=+holeM[1];arr=n.filter((x,i)=>!(x===h&&i===n.indexOf(h)))}return setScore(arr[0],/putt/.test(s)?arr[1]:undefined,h)}
 if(/putt/.test(s)){const n=nums(s);if(n.length){const x=round.holes[hole]||{s:0};x.p=n[0];round.holes[hole]=x;save();render();return say(`${n[0]} putts on hole ${hole}.`)}}
 if(/next hole|next/.test(s))return go(hole+1);if(/previous|last hole|back/.test(s))return go(hole-1);
 if(/go to hole|hole (\d+)/.test(s)){const n=nums(s);if(n.length)return go(n[0])}
 if(/mark (the )?shot|mark ball|shot/.test(s))return markShot();
 if(/mark (the )?green/.test(s))return markGreenHere();
 if(/club|what should i hit|which/.test(s))return sayClub();
 if(/yard|how far|distance|far/.test(s))return sayYardage();
 say("Sorry, try: yardage, what club, next hole, score 5, mark shot, or what's my score.")}
// ---------- render ----------
function render(){$('#hn').textContent=hole;$('#hp').textContent=par(hole);$('#cname').textContent=cur;$('#mh').textContent=hole;
 const d=toGreen();$('#yd').textContent=d==null?'—':yds(d);$('#fb').textContent=opts.metric?'(m)':'';
 const tg=d!=null&&holeTargets(hole);$('#ydF').textContent=tg?yds(dist(pos,tg.front)):'—';$('#ydB').textContent=tg?yds(dist(pos,tg.back)):'—';
 $('#club').innerHTML=d==null?(C().greens[hole]?'Waiting for GPS…':'Set green on Map'):(()=>{const y=Math.round(d*1.09361);return y<=40?'Chip / putt':clubFor(y)[0]})();
 const x=round.holes[hole]||{};$('#st').textContent=x.s||0;$('#pt').textContent=x.p||0;
 let h='<tr><th>H</th><th>Par</th><th>Score</th><th>Putts</th><th>+/-</th></tr>',run=0;
 for(let i=1;i<=18;i++){const y=round.holes[i]||{};if(y.s)run+=y.s-par(i);h+=`<tr class="${i===hole?'cur':''}"><td onclick="go(${i})">${i}</td><td><input type=number data-par=${i} value=${par(i)}></td><td><input type=number data-s=${i} value="${y.s||''}"></td><td><input type=number data-p=${i} value="${y.p??''}"></td><td>${y.s?relS(run):''}</td></tr>`;
  if(i===9){const f=[1,2,3,4,5,6,7,8,9].reduce((a,k)=>a+(round.holes[k]?.s||0),0);h+=`<tr><th>Out</th><th>${C().pars.slice(0,9).reduce((a,b)=>a+b,0)}</th><th>${f||''}</th><th></th><th></th></tr>`}}
 const t=totals();h+=`<tr><th>Tot</th><th>${C().pars.reduce((a,b)=>a+b,0)}</th><th>${t.s||''}</th><th>${t.putts||''}</th><th>${t.n?relS(t.rel):''}</th></tr>`;$('#sc').innerHTML=h;
 $('#tot').textContent=t.n?`${t.s} (${relS(t.rel)}) thru ${t.n} · ${t.putts} putts`:'No scores yet';
 $('#course').innerHTML=Object.keys(courses).map(c=>`<option ${c===cur?'selected':''}>${esc(c)}</option>`).join('');
 $('#hist').innerHTML=hist.slice().reverse().map(r=>`<div class="card">${r.date.slice(0,10)} · ${r.course}: <b>${r.s}</b> (${relS(r.rel)}) · ${r.putts} putts · ${r.n} holes</div>`).join('')||'<small>No rounds yet</small>';
 $('#ct').innerHTML=clubs.map((c,i)=>`<tr><td><input data-cn=${i} value="${c[0]}" style="width:90px"></td><td><input type=number data-cy=${i} value=${c[1]} style="width:90px"></td><td><button class="b b2" style="min-height:40px;padding:4px 12px" onclick="clubs.splice(${i},1);save();render()">✕</button></td></tr>`).join('');
 $('#autoread').checked=opts.autoread;$('#metric').checked=opts.metric;drawGreens();showMissing();xircleStatus()}
window.go=go;
// ---------- events ----------
$$('nav button').forEach(b=>b.onclick=()=>{$$('nav button,section').forEach(x=>x.classList.remove('on'));b.classList.add('on');$('#s-'+b.dataset.s).classList.add('on');if(b.dataset.s==='map')initMap()});
$('#prev').onclick=()=>go(hole-1);$('#next').onclick=()=>go(hole+1);$('#bYd').onclick=sayYardage;$('#bClub').onclick=sayClub;$('#bShot').onclick=markShot;$('#bScoreQ').onclick=sayScore;
$('#mic').onclick=()=>listen(command);$('#bMsgs').onclick=()=>readMsgs(true);$('#bSay').onclick=()=>voiceMsg();
$$('[data-k]').forEach(b=>b.onclick=()=>{const x=round.holes[hole]||{s:0,p:0};if(b.dataset.k==='s'){x.s=Math.max(0,(x.s||0)+ +b.dataset.d)}else x.p=Math.max(0,(x.p||0)+ +b.dataset.d);round.holes[hole]=x;if(!x.s)delete round.holes[hole];save();render();postScore(hole)});
$('#sc').onchange=e=>{const t=e.target,d=t.dataset;if(d.par){C().pars[d.par-1]=+t.value||4}else if(d.s){const h=+d.s;if(+t.value)round.holes[h]={...round.holes[h],s:+t.value};else delete round.holes[h];postScore(h)}else if(d.p){const h=+d.p;round.holes[h]={s:0,...round.holes[h],p:+t.value}}save();render()};
$('#ct').onchange=e=>{const d=e.target.dataset;if(d.cn)clubs[d.cn][0]=e.target.value;if(d.cy)clubs[d.cy][1]=+e.target.value;save();render()};
$('#addclub').onclick=()=>{clubs.push(['LW',60]);save();render()};$('#resetc').onclick=()=>{clubs=DEF_CLUBS.map(x=>[...x]);save();render()};
$('#autoread').onchange=e=>{opts.autoread=e.target.checked;save()};$('#metric').onchange=e=>{opts.metric=e.target.checked;save();render()};
$('#course').onchange=e=>{if(totals().n&&!confirm('Switch course? Current round card stays saved only if you Finish it first.'))return render();cur=e.target.value;round=newRound();hole=1;save();render();if(map)fitGreens()};
$('#addc').onclick=()=>{const n=$('#newc').value.trim();if(!n)return;courses[n]=courses[n]||{pars:Array(18).fill(4),greens:{},shapes:[]};cur=n;round=newRound();hole=1;$('#newc').value='';save();render()};
$('#fin').onclick=()=>{const t=totals();if(!t.n)return say('Nothing to save yet.');hist.push({...t,course:cur,date:round.date,holes:round.holes});round=newRound();hole=1;save();render();say(`Round saved: ${t.s}, ${relTxt(t.rel)}, ${t.putts} putts.`);maybeXircle()};
$('#newr').onclick=()=>{if(confirm('Clear the current card?')){round=newRound();hole=1;save();render()}};
// ---------- map ----------
let map,me,gLayer,osmLayer;
function initMap(){if(map){setTimeout(()=>map.invalidateSize(),50);return}
 map=LL.map('map',{zoomControl:true}).setView(pos||[40.0,-74.5],pos?17:5);
 LL.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19,attribution:'Esri World Imagery'}).addTo(map);
 me=LL.circleMarker(pos||[0,0],{radius:8,color:'#fff',fillColor:'#2a8cff',fillOpacity:1}).addTo(map);gLayer=LL.layerGroup().addTo(map);osmLayer=LL.layerGroup().addTo(map);
 map.on('click',e=>{C().greens[hole]=[r6(e.latlng.lat),r6(e.latlng.lng)];C().shapes=(C().shapes||[]).filter(s=>+s.hole!==hole);save();render();say(`Green set for hole ${hole}.`)});drawGreens();fitGreens()}
function coursePts(){const pts=[];for(const g of Object.values(C().greens||{}))if(Array.isArray(g)&&g.length>=2)pts.push(g);for(const r of (C().outline&&C().outline.outers)||[])for(const p of r||[])if(Array.isArray(p))pts.push(p);return pts}
function playingHere(){if(!pos)return false;for(const g of Object.values(C().greens||{}))if(Array.isArray(g)&&g.length>=2&&dist(pos,g)<4000)return true;const o=C().outline;return !!(o&&o.outers&&o.outers.length&&window.XLMap&&XLMap.pointInCourse(pos,o.outers,o.inners||[]))}
function fitCourse(forceWhole){if(!map)return;const pts=coursePts();if(!forceWhole&&playingHere()){map.setView(pos,17);return}if(pts.length>=2)map.fitBounds(pts,{maxZoom:17,padding:[20,20]});else if(pts.length===1)map.setView(pts[0],17);else if(pos)map.setView(pos,17)}
function fitGreens(){fitCourse(false)}
function drawGreens(){if(!gLayer)return;gLayer.clearLayers();
 const quiet={interactive:false};
 for(const r of (C().outline&&C().outline.outers)||[])if(r.length>=3)LL.polygon(r,{color:'#fff',weight:2,fill:false,...quiet}).addTo(gLayer);
 const hz={bunker:'#c2a15a',water_hazard:'#3aa0d8',lateral_water_hazard:'#e55'};
 for(const h of C().hazards||[])if(h.pts?.length>=3)LL.polygon(h.pts,{color:hz[h.kind]||'#888',weight:1,fillColor:hz[h.kind]||'#888',fillOpacity:.45,...quiet}).addTo(gLayer);
 for(const[h,info]of Object.entries(C().holes||{}))if(info.line?.length>=2)LL.polyline(info.line,{color:+h===hole?'#ffd23f':'#fff',weight:+h===hole?3:1,opacity:.75,...quiet}).addTo(gLayer);
 for(const s of C().shapes||[])if(s.kind!=='hazard'&&s.pts?.length>=3)LL.polygon(s.pts,{color:+s.hole===hole?'#ffd23f':'#9be564',weight:2,fillOpacity:.25,...quiet}).addTo(gLayer);
 for(const t of Object.values(C().tees||{}))if(Array.isArray(t)&&t.length>=2)LL.circleMarker(t,{radius:5,color:'#fff',fillColor:'#9be564',fillOpacity:1,weight:1,...quiet}).addTo(gLayer);
 for(const[h,g]of Object.entries(C().greens))LL.marker(g,{icon:LL.divIcon({className:'',html:`<div style="background:${+h===hole?'#ffd23f':'#9be564'};color:#06210f;border-radius:50%;width:30px;height:30px;line-height:30px;text-align:center;font-weight:800;border:2px solid #fff">${h}</div>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(gLayer)}
function markGreenHere(){if(!pos)return say('Waiting for GPS.');C().greens[hole]=[r6(pos[0]),r6(pos[1])];C().shapes=(C().shapes||[]).filter(s=>+s.hole!==hole);save();render();say(`Green marked for hole ${hole} at your position.`)}
$('#mkGreen').onclick=markGreenHere;$('#center').onclick=()=>pos&&map.setView(pos,18);
$('#osm').onclick=async()=>{const c=map.getCenter();say('Looking for greens nearby.');
 const q=`[out:json][timeout:25];(way["golf"="green"](around:2500,${c.lat},${c.lng});node["golf"="hole"](around:2500,${c.lat},${c.lng});way["golf"="hole"](around:2500,${c.lat},${c.lng}););out geom tags;`;
 try{const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(q)}).then(r=>r.json());osmLayer.clearLayers();
  const greens=r.elements.filter(e=>e.tags?.golf==='green'&&e.geometry),holes=r.elements.filter(e=>e.tags?.golf==='hole'&&e.geometry);let auto=0;
  for(const g of greens){const pts=g.geometry.map(p=>[p.lat,p.lon]),cen=[pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length];
   // auto-assign if an OSM hole line ends on this green
   const ho=holes.find(h=>{const e=h.geometry[h.geometry.length-1];return dist([e.lat,e.lon],cen)<40&&h.tags.ref});if(ho&&!C().greens[ho.tags.ref]){C().greens[+ho.tags.ref]=cen.map(r6);rememberShape(+ho.tags.ref,pts);auto++}
   LL.polygon(pts,{color:'#ffd23f',weight:2}).addTo(osmLayer).on('click',ev=>{LL.DomEvent.stop(ev);C().greens[hole]=cen.map(r6);rememberShape(hole,pts);save();render();say(`Green set for hole ${hole}.`)})}
  save();render();say(`Found ${greens.length} greens${auto?`, auto-assigned ${auto} by hole number`:''}. Tap a yellow green to assign it to hole ${hole}.`)}catch(e){say('Could not reach OpenStreetMap.')}};
// ---------- course search (home setup; GPS find is the backup) ----------
function maybeAutoCourse(){if(autoTried||navigator.webdriver||!pos)return;autoTried=true;findNearby(true).catch(()=>{})}
function openMap(){$$('nav button,section').forEach(x=>x.classList.remove('on'));const b=$$('nav button').find(x=>x.dataset.s==='map');if(b)b.classList.add('on');$('#s-map').classList.add('on');initMap();
 const refit=()=>{if(!map)return;map.invalidateSize();fitCourse(true)};
 requestAnimationFrame(refit);setTimeout(refit,250)}
function missingHoles(){const holes=C().holes||{},miss=[];for(let h=1;h<=18;h++)if(holes[h]?.line?.length>=2&&!hasGreen(C(),h))miss.push(h);return miss}
function showMissing(){const el=$('#fixholes');if(!el)return;const miss=C().source==='osm'?missingHoles():[];const sig=cur+'|'+miss.join(',');if(sig===missSig)return;missSig=sig;
 if(!miss.length){el.style.display='none';el.innerHTML='';return}
 el.style.display='block';el.innerHTML=`<b>${miss.length} hole${miss.length>1?'s':''} missing a green</b><br><small>Holes ${miss.join(', ')}. The map is the preview. Pick a hole and tap the photo where the green is. No GPS needed.</small><div class="row"><button class="b" id="markmiss" style="font-size:18px">Mark hole ${miss[0]}</button></div>`;
 $('#markmiss').onclick=()=>{hole=miss[0];shot=null;save();render();const line=C().holes?.[hole]?.line;if(map&&line?.length)map.setView(line[line.length-1],18);say(`Hole ${hole}. Tap the photo on the green.`)}}
async function overpass(q){const servers=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];let last=new Error('Overpass failed');
 for(const url of servers){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q),signal:AbortSignal.timeout(26000)});
  if(!r.ok){last=new Error('HTTP '+r.status);if(r.status===429||r.status>=500)continue;throw last}
  const data=await r.json();if(data.remark&&/timeout|runtime error/i.test(String(data.remark))&&!(data.elements&&data.elements.length)){last=new Error(String(data.remark));continue}return data}catch(e){last=e}}
 throw last}
function nameTokens(q){return String(q||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w.length>2&&!/^(the|golf|club|course|links|country|and|near)$/.test(w))}
function scoreName(name,tokens){const n=String(name||'').toLowerCase();if(!tokens.length)return 0;let s=0;for(const t of tokens)if(n.includes(t))s+=2;if(tokens.every(t=>n.includes(t)))s+=5;return s}
function boxFromPlace(hit){const lat=+hit.lat,lon=+hit.lon;let south=lat-0.12,north=lat+0.12,west=lon-0.16,east=lon+0.16;
 if(Array.isArray(hit.boundingbox)&&hit.boundingbox.length===4){const s=+hit.boundingbox[0],n=+hit.boundingbox[1],w=+hit.boundingbox[2],e=+hit.boundingbox[3];
  if([s,n,w,e].every(Number.isFinite)){south=s;north=n;west=w;east=e;if((north-south)<0.08||(east-west)<0.08){south=lat-0.12;north=lat+0.12;west=lon-0.16;east=lon+0.16}}}
 if(north-south>0.35){const c=(north+south)/2;south=c-0.175;north=c+0.175}if(east-west>0.35){const c=(east+west)/2;west=c-0.175;east=c+0.175}
 return {south,north,west,east,lat,lon}}
function golfAreaQuery(box,q){const bb=`${box.south},${box.west},${box.north},${box.east}`;const nameRe=nameTokens(q).map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
 const extra=nameRe?`way["leisure"="golf_course"]["name"~"${nameRe}",i](around:20000,${box.lat},${box.lon});relation["leisure"="golf_course"]["name"~"${nameRe}",i](around:20000,${box.lat},${box.lon});`:'';
 return `[out:json][timeout:25];(way["leisure"="golf_course"](${bb});relation["leisure"="golf_course"](${bb});${extra});out tags center;`}
function samePt(a,b){return Math.abs(a[0]-b[0])<1e-5&&Math.abs(a[1]-b[1])<1e-5}
function stitch(lines){const unused=(lines||[]).filter(l=>l&&l.length>=2).map(l=>l.slice());const rings=[];
 while(unused.length){let ring=unused.pop();if(!samePt(ring[0],ring[ring.length-1])){let grew=true;while(grew){grew=false;for(let i=0;i<unused.length;i++){const w=unused[i],a=ring[0],b=ring[ring.length-1],c=w[0],d=w[w.length-1];
  if(samePt(b,c)){ring=ring.concat(w.slice(1));unused.splice(i,1);grew=true;break}
  if(samePt(b,d)){ring=ring.concat(w.slice().reverse().slice(1));unused.splice(i,1);grew=true;break}
  if(samePt(a,d)){ring=w.concat(ring.slice(1));unused.splice(i,1);grew=true;break}
  if(samePt(a,c)){ring=w.slice().reverse().concat(ring.slice(1));unused.splice(i,1);grew=true;break}}}}rings.push(ring)}return rings}
function ringsOf(el){if(!el)return {outers:[],inners:[]};
 if(el.type==='way'&&el.geometry&&el.geometry.length>=3)return {outers:[el.geometry.map(p=>[p.lat,p.lon])],inners:[]};
 if(el.type==='relation'&&el.members){const out=[],inn=[];for(const m of el.members){if(m.type!=='way'||!m.geometry||m.geometry.length<2)continue;const line=m.geometry.map(p=>[p.lat,p.lon]);(m.role==='inner'?inn:out).push(line)}return {outers:stitch(out),inners:stitch(inn)}}
 return {outers:[],inners:[]}}
function rankCourses(els,at,query){const tokens=nameTokens(query),seen=new Set(),hits=[];
 for(const el of els||[]){if(el.type!=='way'&&el.type!=='relation')continue;const key=el.type+'/'+el.id;if(seen.has(key))continue;seen.add(key);
  const tags=el.tags||{};const name=tags.name||tags['name:en']||'Golf course';let lat=el.center&&el.center.lat,lon=el.center&&el.center.lon;
  if(!Number.isFinite(lat)&&el.geometry&&el.geometry.length){lat=el.geometry.reduce((s,p)=>s+p.lat,0)/el.geometry.length;lon=el.geometry.reduce((s,p)=>s+p.lon,0)/el.geometry.length}
  if(!Number.isFinite(lat)&&Number.isFinite(el.lat)){lat=+el.lat;lon=+el.lon}if(!Number.isFinite(lat))continue;
  const rings=ringsOf(el);const km=at?dist(at,[lat,lon])/1000:null;
  hits.push({name,type:el.type,id:+el.id,osmId:key,lat,lon,city:tags['addr:city']||tags['addr:town']||tags['addr:suburb']||'',km,score:scoreName(name,tokens),outers:rings.outers,inners:rings.inners})}
 const rels=hits.filter(h=>h.type==='relation');
 const kept=hits.filter(h=>h.type!=='way'||!rels.some(r=>r.name.toLowerCase()===h.name.toLowerCase()&&dist([h.lat,h.lon],[r.lat,r.lon])<800));
 kept.sort((a,b)=>b.score-a.score||((a.km??99)-(b.km??99)));return kept.slice(0,12)}
function showCourseHits(hits){searchHits=hits;openCard();
 if(!hits.length){$('#cresults').innerHTML='<small>No mapped golf course for that search. Add a course and mark the greens, or get one from a friend.</small>';return}
 $('#cresults').innerHTML=hits.map((h,i)=>`<button class="b b2" data-ci="${i}" style="display:block;width:100%;margin:6px 0;min-height:52px;font-size:16px;text-align:left">${esc(h.name)}${h.city?' · '+esc(h.city):''}${h.km!=null?' · '+h.km.toFixed(1)+' km':''}</button>`).join('')+'<small>Pick one to load holes, greens, tees, and hazards and save them on this phone.</small>';
 $$('#cresults [data-ci]').forEach(b=>b.onclick=()=>loadCourse(searchHits[+b.dataset.ci]))}
function nominatimHit(n){const tags=n.extratags||{},cat=n.class||n.category;const isGolf=tags.leisure==='golf_course'||n.type==='golf_course'||(cat==='leisure'&&n.type==='golf_course');if(!isGolf||(n.osm_type!=='way'&&n.osm_type!=='relation'))return null;
 const city=n.address&&(n.address.city||n.address.town||n.address.village)||'';return {name:n.name||'Golf course',type:n.osm_type,id:+n.osm_id,osmId:n.osm_type+'/'+n.osm_id,lat:+n.lat,lon:+n.lon,city,km:null,score:null,outers:[],inners:[]}}
async function searchCourses(raw){const q=String(raw||'').trim();if(q.length<2)return say('Type a course name, town, or ZIP.');
 $('#cresults').innerHTML='<small>Searching…</small>';say('Searching for '+q+'.');
 try{const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=5&q='+encodeURIComponent(q),{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('HTTP '+r.status);const places=await r.json();if(!places.length){$('#cresults').innerHTML='<small>No place matched. Try the town or ZIP, or add the course yourself.</small>';return say('No place matched.')}
  const box=boxFromPlace(places[0]);let els=[];try{els=(await overpass(golfAreaQuery(box,q))).elements||[]}catch{}
  let hits=rankCourses(els,[box.lat,box.lon],q);
  for(const n of places){const h=nominatimHit(n);if(!h||hits.some(x=>x.osmId===h.osmId))continue;h.km=dist([box.lat,box.lon],[h.lat,h.lon])/1000;h.score=scoreName(h.name,nameTokens(q));hits.push(h)}
  hits=hits.filter(h=>h.type==='way'||h.type==='relation').sort((a,b)=>(b.score||0)-(a.score||0)||((a.km??99)-(b.km??99))).slice(0,12);
  if(!hits.length){showCourseHits([]);return say('No mapped golf course. You can mark it yourself or get one from a friend.')}
  showCourseHits(hits);say(hits.length+' course'+(hits.length===1?'':'s')+'. Pick one to load it.')}
 catch(e){$('#cresults').innerHTML='<small>Search failed. '+esc(e.message||'offline')+'</small>';say('Search failed.')}}
function childTags(el){const tags={};for(const c of el.children)if(c.localName==='tag')tags[c.getAttribute('k')]=c.getAttribute('v');return tags}
function parseOsm(xml){const doc=new DOMParser().parseFromString(xml,'text/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('Bad map data');
 const nodes={};for(const n of doc.getElementsByTagName('node')){if(!n.parentNode||n.parentNode.nodeName!=='osm')continue;nodes[n.getAttribute('id')]={lat:+n.getAttribute('lat'),lon:+n.getAttribute('lon'),tags:childTags(n)}}
 const ways={};for(const w of doc.getElementsByTagName('way')){if(!w.parentNode||w.parentNode.nodeName!=='osm')continue;const geometry=[];for(const c of w.children)if(c.localName==='nd'){const p=nodes[c.getAttribute('ref')];if(p)geometry.push({lat:p.lat,lon:p.lon})}ways[w.getAttribute('id')]={type:'way',id:+w.getAttribute('id'),tags:childTags(w),geometry}}
 const rels=[];for(const rel of doc.getElementsByTagName('relation')){if(!rel.parentNode||rel.parentNode.nodeName!=='osm')continue;const members=[];for(const c of rel.children)if(c.localName==='member')members.push({type:c.getAttribute('type'),ref:+c.getAttribute('ref'),role:c.getAttribute('role')||''});rels.push({type:'relation',id:+rel.getAttribute('id'),tags:childTags(rel),members})}
 return {nodes,ways,rels}}
function ringsFromParsed(parsed,type,id){if(type==='way'){const w=parsed.ways[String(id)];if(!w||w.geometry.length<3)return {outers:[],inners:[]};return {outers:[w.geometry.map(p=>[p.lat,p.lon])],inners:[]}}
 const rel=parsed.rels.find(r=>r.id===+id)||parsed.rels[0];if(!rel)return {outers:[],inners:[]};const out=[],inn=[];
 for(const m of rel.members){if(m.type!=='way')continue;const w=parsed.ways[String(m.ref)];if(!w||w.geometry.length<2)continue;(m.role==='inner'?inn:out).push(w.geometry.map(p=>[p.lat,p.lon]))}
 return {outers:stitch(out),inners:stitch(inn)}}
function bboxOf(rings){let south=90,north=-90,west=180,east=-180;for(const r of rings.outers.concat(rings.inners))for(const p of r){if(p[0]<south)south=p[0];if(p[0]>north)north=p[0];if(p[1]<west)west=p[1];if(p[1]>east)east=p[1]}
 if(!(south<north&&west<east))throw new Error('No course outline');return {south,north,west,east}}
function elementsFromMap(xml){const parsed=parseOsm(xml),out=[];const keep=g=>g==='hole'||g==='green'||g==='tee'||g==='bunker'||g==='water_hazard'||g==='lateral_water_hazard';
 for(const w of Object.values(parsed.ways))if(keep(w.tags.golf))out.push(w);
 for(const n of Object.values(parsed.nodes))if(keep(n.tags.golf))out.push({type:'node',id:0,lat:n.lat,lon:n.lon,tags:n.tags});return out}
async function fetchOutline(hit){try{const q=hit.type==='relation'?`[out:json][timeout:25];relation(${hit.id});out geom;`:`[out:json][timeout:25];way(${hit.id});out geom;`;
  const el=((await overpass(q)).elements||[])[0];const rings=ringsOf(el);if(rings.outers.length)return {...rings,bbox:bboxOf(rings)}}catch{}
 const url=hit.type==='relation'?`https://api.openstreetmap.org/api/0.6/relation/${hit.id}/full`:`https://api.openstreetmap.org/api/0.6/way/${hit.id}/full`;
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);const rings=ringsFromParsed(parseOsm(await r.text()),hit.type,hit.id);
 if(!rings.outers.length)throw new Error('No course outline');return {...rings,bbox:bboxOf(rings)}}
function padBox(b,pad){return {south:b.south-pad,north:b.north+pad,west:b.west-pad,east:b.east+pad}}
async function fetchGolf(box){const bb=`${box.south},${box.west},${box.north},${box.east}`;
 const q=`[out:json][timeout:25];(way["golf"~"^(hole|green|tee|bunker|water_hazard|lateral_water_hazard)$"](${bb});node["golf"~"^(hole|tee)$"](${bb}););out geom tags;`;
 try{return ((await overpass(q)).elements)||[]}catch(e){const area=(box.north-box.south)*(box.east-box.west);if(area>0.25)throw e;
  const r=await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${box.west},${box.south},${box.east},${box.north}`,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('HTTP '+r.status);return elementsFromMap(await r.text())}}
function courseKeyFor(hit){for(const[k,c]of Object.entries(courses))if(c&&c.osmId===hit.osmId)return k;
 let name=String(hit.name||'Golf course').replace(/[<>]/g,'').trim().slice(0,60)||'Golf course';
 if(courses[name]&&courses[name].osmId!==hit.osmId){const city=String(hit.city||'').replace(/[<>]/g,'').trim();let n2=(city?name+' ('+city+')':name+' '+hit.osmId).slice(0,60);if(courses[n2]&&courses[n2].osmId!==hit.osmId)n2=(name+' '+hit.osmId).slice(0,60);name=n2}
 return name}
async function maybeGolfApi(course){const raw=window.XLOOPER_CONFIG&&window.XLOOPER_CONFIG.golfCourseApiKey;if(!raw||typeof raw!=='string'||!raw.trim())return;
 let auth=raw.trim();if(!/^key |^bearer /i.test(auth))auth='Key '+auth;const headers={Authorization:auth};
 const s=await fetch('https://api.golfcourseapi.com/v1/search?search_query='+encodeURIComponent(course.name),{headers,signal:AbortSignal.timeout(8000)});if(!s.ok)return;const sj=await s.json();
 const list=sj.courses||sj.data||[];const tokens=nameTokens(course.name);const pick=list.find(c=>scoreName(c.course_name||c.club_name||c.name||'',tokens)>0);if(!pick||!pick.id)return;
 const cr=await fetch('https://api.golfcourseapi.com/v1/courses/'+encodeURIComponent(pick.id),{headers,signal:AbortSignal.timeout(8000)});if(!cr.ok)return;const cj=await cr.json();const body=cj.course||cj;
 const sets=[].concat((body.tees&&body.tees.male)||[],(body.tees&&body.tees.female)||[]);sets.sort((a,b)=>((b.holes&&b.holes.length)||0)-((a.holes&&a.holes.length)||0));
 const holes=sets[0]&&sets[0].holes;if(!holes||holes.length<9)return;const yards=[];
 for(let i=0;i<Math.min(18,holes.length);i++){const par=+holes[i].par;if(par>=3&&par<=6)course.pars[i]=par;const y=+holes[i].yardage;yards[i]=y>0?Math.round(y):0}course.yardages=yards}
async function loadCourse(hit){if(!hit||loadingCourse)return;if(hit.type!=='way'&&hit.type!=='relation')return say('That course has no outline to load.');
 const name=courseKeyFor(hit),switching=name!==cur;
 if(switching&&totals().n&&!confirm('Switch course? Current round card stays saved only if you Finish it first.'))return;
 loadingCourse=true;try{say('Loading '+name+'.');const outline=await fetchOutline(hit);const elements=await fetchGolf(padBox(outline.bbox,0.002));
  const built=XLMap.buildCourse({name,osmId:hit.osmId,outers:outline.outers,inners:outline.inners,elements});try{await maybeGolfApi(built)}catch{}
  courses[name]=built;if(switching){cur=name;round=newRound();hole=1}save();render();openMap();const miss=missingHoles();
  const nh=Object.keys(built.holes||{}).length,ng=Object.keys(built.greens).length;
  say(name+'. '+nh+' hole'+(nh===1?'':'s')+', '+ng+' green'+(ng===1?'':'s')+'.'+(miss.length?' '+miss.length+' still need a green. Tap the map to mark hole '+miss[0]+'.':''))}
 catch(e){say('Could not load that course. '+(e&&e.message?e.message:''))}finally{loadingCourse=false}}
async function findNearby(auto){if(auto&&navigator.webdriver)return;if(!pos){if(!auto)say('Waiting for GPS. Search by name works from home.');return}if(!auto)say('Looking for a course near you.');
 try{const around=`around:3000,${pos[0]},${pos[1]}`;let els=[];
  try{els=((await overpass(`[out:json][timeout:25];(way["leisure"="golf_course"](${around});relation["leisure"="golf_course"](${around}););out tags center geom;`)).elements)||[]}
  catch(e){if(auto)return;els=((await overpass(`[out:json][timeout:25];(way["leisure"="golf_course"](${around});relation["leisure"="golf_course"](${around}););out tags center;`)).elements)||[]}
  const hits=rankCourses(els,pos,'');if(!hits.length){if(!auto){openCard();$('#cresults').innerHTML='<small>No mapped course within 3 km. Search by name, or mark the greens yourself.</small>';say('No mapped course within 3 km.')}return}
  const inside=hits.find(h=>h.outers&&h.outers.length&&XLMap.pointInCourse(pos,h.outers,h.inners||[]));
  if(auto){if(inside&&inside.osmId!==C().osmId)await loadCourse(inside);return}
  showCourseHits(hits);if(inside)await loadCourse(inside);else say(hits.length+' course'+(hits.length>1?'s':'')+' nearby. Pick one to load it.')}
 catch(e){if(!auto)say('Could not reach OpenStreetMap.')}}
$('#gosearch').onclick=()=>{openCard();$('#csearchq').focus()};
$('#csearchgo').onclick=()=>searchCourses($('#csearchq').value);
$('#csearchq').addEventListener('keydown',e=>{if(e.key==='Enter')searchCourses($('#csearchq').value)});
$('#findgps').onclick=()=>findNearby(false);
// ---------- course sharing ----------
// Share link: ?course=CODE#cache=<deflate+base64 of the course>. ntfy topic xlooper-course-<code> keeps the JSON ~12h; the hash is the fallback.
const r6=n=>Math.round(+n*1e6)/1e6;
const CSALPH='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function rememberShape(h,pts){
 if(!pts||pts.length<3)return;
 let thin=pts.map(p=>[r6(p[0]),r6(p[1])]).filter(p=>p[0]>=-90&&p[0]<=90&&p[1]>=-180&&p[1]<=180);
 if(thin.length>24){const step=thin.length/24;thin=Array.from({length:24},(_,i)=>thin[Math.min(thin.length-1,Math.floor(i*step))])}
 if(thin.length<3)return;
 C().shapes=[...(C().shapes||[]).filter(s=>+s.hole!==+h),{hole:+h,kind:'green',pts:thin}];
}
function b64urlFromBytes(bytes){const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode(...u.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function bytesFromB64url(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function packCourse(c,name){
 const pars=Array.from({length:18},(_,i)=>{const n=Math.round(+c?.pars?.[i]);return n>=1&&n<=9?n:4});
 const greens={};
 for(let h=1;h<=18;h++){const g=c?.greens?.[h]??c?.greens?.[String(h)];if(!Array.isArray(g)||g.length<2)continue;const lat=r6(g[0]),lng=r6(g[1]);if(lat>=-90&&lat<=90&&lng>=-180&&lng<=180)greens[h]=[lat,lng]}
 const shapes=[];
 for(const s of c?.shapes||[]){const hole=+s.hole;if(!(hole>=1&&hole<=18)||!Array.isArray(s.pts))continue;let pts=s.pts.filter(p=>Array.isArray(p)&&p.length>=2).map(p=>[r6(p[0]),r6(p[1])]).filter(p=>p[0]>=-90&&p[0]<=90&&p[1]>=-180&&p[1]<=180);if(pts.length>24){const step=pts.length/24;pts=Array.from({length:24},(_,i)=>pts[Math.min(pts.length-1,Math.floor(i*step))])}if(pts.length>=3)shapes.push({hole,kind:'green',pts});if(shapes.length>=18)break}
 return {v:1,name:String(name||'Course').replace(/[<>]/g,'').trim().slice(0,40)||'Course',pars,greens,shapes};
}
function unpackCourse(msg){if(!msg||msg.v!==1||typeof msg.name!=='string'||!Array.isArray(msg.pars))return null;return packCourse(msg,msg.name)}
async function encodeCache(obj){
 const json=new TextEncoder().encode(JSON.stringify(obj));
 try{if(typeof CompressionStream!=='function')throw 0;const buf=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();return 'z.'+b64urlFromBytes(buf)}
 catch{return 'u.'+b64urlFromBytes(json)}
}
async function courseFromCache(cache){
 if(!cache||cache.length<4)return null;
 const tag=cache.slice(0,2),bytes=bytesFromB64url(cache.slice(2));
 let text;
 if(tag==='z.')text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
 else if(tag==='u.')text=new TextDecoder().decode(bytes);
 else return null;
 return unpackCourse(JSON.parse(text));
}
function courseCode(){const a=crypto.getRandomValues(new Uint8Array(6));return [...a].map(x=>CSALPH[x%CSALPH.length]).join('')}
function parseShareInput(s){
 s=String(s||'').trim();let code='',cache='';
 const cm=s.match(/[?&]course=([A-Za-z0-9]+)/i);if(cm)code=cm[1];
 const hm=s.match(/#cache=([A-Za-z0-9._~-]+)/);if(hm)cache=hm[1];
 if(!code){const only=s.match(/^([A-Za-z0-9]{4,12})(?:#cache=([A-Za-z0-9._~-]+))?$/);if(only){code=only[1];cache=cache||only[2]||''}}
 code=code.toUpperCase().replace(new RegExp('[^'+CSALPH+']','g'),'');
 return {code,cache};
}
function courseLink(code,cache){return location.origin+location.pathname+'?course='+code+'#cache='+cache}
async function fetchCourseNtfy(code){
 const r=await fetch(NTFY+'xlooper-course-'+code.toLowerCase()+'/json?poll=1&since=all',{signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw new Error('HTTP '+r.status);
 let last=null;
 for(const line of (await r.text()).split('\n')){if(!line.trim())continue;try{const d=JSON.parse(line);if(d.event&&d.event!=='message')continue;const msg=typeof d.message==='string'?JSON.parse(d.message):d.message;const c=unpackCourse(msg);if(c)last=c}catch{}}
 return last;
}
let pendingCourse=null;
function openCard(){$$('nav button,section').forEach(x=>x.classList.remove('on'));const b=$$('nav button').find(x=>x.dataset.s==='card');b.classList.add('on');$('#s-card').classList.add('on')}
function showCoursePreview(data,via){
 pendingCourse=data;const holes=Object.keys(data.greens).map(Number).sort((a,b)=>a-b);
 const viaTxt=via==='link'?'This link keeps a copy of the course, so it still works after ntfy.sh drops it.':'Loaded from ntfy.sh. That copy lasts about 12 hours.';
 $('#getbox').style.display='block';
 $('#cprev').innerHTML=`<div class="card" style="margin-bottom:0"><b>${esc(data.name)}</b><br><small>Par ${data.pars.reduce((a,b)=>a+b,0)} · ${holes.length?`greens set on ${holes.length} hole${holes.length>1?'s':''}: ${holes.join(', ')}`:'no greens set'}${data.shapes.length?` · ${data.shapes.length} outline${data.shapes.length>1?'s':''}`:''}</small><br><small>${viaTxt} Merge adds holes you haven't marked into the current course. Replace saves this course and switches to it.</small><div class="row"><button class="b" id="cmerge">Merge</button><button class="b b2" id="creplace">Replace</button></div></div>`;
 $('#cmerge').onclick=()=>importCourse('merge');$('#creplace').onclick=()=>importCourse('replace');
}
function hasGreen(c,h){const g=c.greens?.[h]??c.greens?.[String(h)];return Array.isArray(g)&&g.length>=2&&isFinite(+g[0])&&isFinite(+g[1])}
function importCourse(mode){
 const data=pendingCourse;if(!data)return;
 if(mode==='replace'){
  const name=data.name,switching=name!==cur;
  if(switching&&totals().n&&!confirm('Switch course? Current round card stays saved only if you Finish it first.'))return;
  const dest=courses[name]=courses[name]||{pars:Array(18).fill(4),greens:{},shapes:[]};
  dest.pars=data.pars.slice();dest.greens={};for(const[h,g]of Object.entries(data.greens))dest.greens[h]=[g[0],g[1]];
  dest.shapes=data.shapes.map(s=>({hole:s.hole,kind:s.kind,pts:s.pts.map(p=>[p[0],p[1]])}));
  delete dest.tees;delete dest.holes;delete dest.hazards;delete dest.outline;delete dest.source;delete dest.osmId;delete dest.yardages;delete dest.loadedAt;
  if(switching){cur=name;round=newRound();hole=1}
  save();render();if(map)fitGreens();say(`${name}. ${Object.keys(data.greens).length} greens set.`);
 }else{
  const c=C();let added=0;
  for(const[h,g]of Object.entries(data.greens))if(!hasGreen(c,h)){c.greens[h]=[g[0],g[1]];added++}
  const have=new Set((c.shapes||[]).map(s=>+s.hole));c.shapes=[...(c.shapes||[])];
  for(const s of data.shapes)if(!have.has(+s.hole))c.shapes.push({hole:s.hole,kind:s.kind,pts:s.pts.map(p=>[p[0],p[1]])});
  save();render();if(map)fitGreens();say(`Merged into ${cur}. Added ${added} green${added===1?'':'s'}.`);
 }
 pendingCourse=null;
}
async function shareCourse(){
 const data=packCourse(C(),cur);const code=courseCode();let cache;try{cache=await encodeCache(data)}catch{return say('Could not package this course.')}
 const link=courseLink(code,cache);
 $('#sharebox').style.display='block';
 $('#sharebox').innerHTML=`<div style="margin-top:8px"><b>Code ${esc(code)}</b><input id="sharelink" readonly value="${esc(link)}"><small id="sharestat">Publishing…</small></div>`;
 $('#sharelink').focus();$('#sharelink').select();
 let ntfyOk=false,ntfyErr='';
 try{let body=JSON.stringify(data);if(body.length>3800)body=JSON.stringify({...data,shapes:[]});const r=await fetch(NTFY+'xlooper-course-'+code.toLowerCase(),{method:'POST',headers:{'Content-Type':'text/plain'},body});if(!r.ok)throw new Error('HTTP '+r.status);ntfyOk=true}catch(e){ntfyErr=e.message||'offline'}
 let copied=false;
 const timed=p=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),2000))]);
 try{if(navigator.share){await timed(navigator.share({title:data.name+' on xLooper',text:'Course code '+code,url:link}));copied=true}else if(navigator.clipboard?.writeText){await timed(navigator.clipboard.writeText(link));copied=true}}catch{}
 const stat=$('#sharestat');if(stat)stat.textContent=(ntfyOk?'Published for about 12 hours. ':'Live publish failed'+(ntfyErr?': '+ntfyErr:'')+'. ')+(copied?'Link copied. ':'')+'The link itself stores the course, so it keeps working after ntfy.sh drops it.';
 say((copied?'Link copied. ':'Share link is ready. ')+'Code '+(code.split('').join(' '))+'.'+(ntfyOk?'':' The live copy could not be published, but the link still has the course.'));
}
async function previewCourse(raw){
 const ref=parseShareInput(raw);if(!ref.code||ref.code.length<4)return say('Paste a course code or a share link.');
 openCard();$('#getbox').style.display='block';$('#coursein').value=String(raw||'').trim();$('#cprev').innerHTML='<small>Looking up '+esc(ref.code)+'…</small>';
 if(ref.cache){try{const data=await courseFromCache(ref.cache);if(data){showCoursePreview(data,'link');say(`${data.name}. Greens set on ${Object.keys(data.greens).length} hole${Object.keys(data.greens).length===1?'':'s'}. Merge or replace.`);return}}catch{}}
 try{const remote=await fetchCourseNtfy(ref.code);if(!remote){$('#cprev').innerHTML='<small>No course found for '+esc(ref.code)+'. ntfy.sh keeps it about 12 hours. Use the full link if you have it.</small>';return say('No course found for that code.')}showCoursePreview(remote,'ntfy');say(`${remote.name}. Greens set on ${Object.keys(remote.greens).length} hole${Object.keys(remote.greens).length===1?'':'s'}. Merge or replace.`)}
 catch(e){$('#cprev').innerHTML='<small>Could not load '+esc(ref.code)+'. '+(e.message||'offline')+'</small>';say('Could not load that course.')}
}
$('#sharec').onclick=()=>shareCourse();
$('#getc').onclick=()=>{openCard();$('#getbox').style.display='block';$('#coursein').focus()};
$('#coursego').onclick=()=>previewCourse($('#coursein').value);
let nearName=null,nearSaid=null;const nearSkip=new Set();
function nearestGreen(at,c){let m=null;for(const g of Object.values(c?.greens||{})){if(!Array.isArray(g)||g.length<2||!isFinite(+g[0])||!isFinite(+g[1]))continue;const d=dist(at,[+g[0],+g[1]]);if(m==null||d<m)m=d}return m}
function considerNearby(){
 const el=$('#near');if(!el||!pos)return;
 const mine=nearestGreen(pos,C());let best=null,bd=2001;
 for(const[name,c]of Object.entries(courses)){if(name===cur||nearSkip.has(name))continue;const d=nearestGreen(pos,c);if(d==null||d>2000||d>=bd)continue;if(mine!=null&&d>=mine)continue;best=name;bd=d}
 if(!best){el.style.display='none';nearName=null;return}
 nearName=best;el.style.display='block';
 $('#neartxt').textContent=`You're near ${best}. Closest green is ${yds(bd)} ${unit()} away. Switch to it?`;
 if(nearSaid!==best){nearSaid=best;say(`You're near ${best}. Switch to it?`)}
}
$('#nearyes').onclick=()=>{
 if(!nearName||!courses[nearName])return;
 if(totals().n&&!confirm('Switch course? Current round card stays saved only if you Finish it first.')){nearSkip.add(nearName);considerNearby();return}
 cur=nearName;round=newRound();hole=1;save();render();if(map)fitGreens();say(`Switched to ${cur}.`);considerNearby()};
$('#nearno').onclick=()=>{if(nearName)nearSkip.add(nearName);considerNearby()};
// ---------- tournament ----------
const myId=L('id',null)||(()=>{const i=Math.random().toString(36).slice(2,12);P('id',i);return i})();
// Tournaments run over ntfy.sh (free, no login). Topic = xlooper-<code>. Events are JSON in the message body.
// ntfy.sh keeps messages ~12h, so the leaderboard/chat is rebuilt from that window on every (re)connect.
const NTFY='https://ntfy.sh/',topic=c=>'xlooper-'+c.toLowerCase();
const pub=(code,ev)=>fetch(NTFY+topic(code),{method:'POST',body:JSON.stringify({...ev,id:myId,ts:Date.now()})}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
let es,seen=new Set();
function apply(ev){if(!tstate)return;const n=String(ev.name||ev.from||'').slice(0,24);
 if(ev.t==='info'){tstate.name=String(ev.title||'xLooper Cup').slice(0,40);if(Array.isArray(ev.pars)&&!tstate.parsSet){tstate.pars=ev.pars.slice(0,18).map(Number);tstate.parsSet=1;if(tour&&!tour.pars){tour.pars=tstate.pars;C().pars=tstate.pars.slice();save();render()}}}
 else if(ev.t==='join'&&ev.id){const p=tstate.players[ev.id]=tstate.players[ev.id]||{name:n,scores:{}};if(n)p.name=n}
 else if(ev.t==='score'&&ev.id){const p=tstate.players[ev.id]=tstate.players[ev.id]||{name:n,scores:{}};if(n)p.name=n;const h=+ev.hole;if(h>=1&&h<=18){if(+ev.strokes)p.scores[h]=Math.min(15,+ev.strokes);else delete p.scores[h]}}
 else if(ev.t==='msg'&&ev.text){msgs.push({from:n||'?',text:String(ev.text).slice(0,280),ts:ev.ts||Date.now(),ann:!!ev.ann});msgs=msgs.slice(-200);return 'msg'}}
function connect(){if(!tour)return;$('#tjoin').style.display='none';$('#tin').style.display='block';$('#tcd').textContent=tour.code;es?.close();
 tstate={name:tour.title||'Tournament',pars:tour.pars||C().pars,players:{},parsSet:!!tour.pars};msgs=[];seen=new Set();let live=false;
 $('#ttitle').textContent=tstate.name;$('#tstat').textContent='Connecting…';
 es=new EventSource(NTFY+topic(tour.code)+'/sse?since=all');
 es.addEventListener('open',()=>{live=true;$('#tstat').textContent='Live ✓ (ntfy.sh · ~12h history)'});
 es.onmessage=e=>{let d,ev;try{d=JSON.parse(e.data);if(d.event!=='message'||seen.has(d.id))return;seen.add(d.id);ev=JSON.parse(d.message)}catch{return}
  const k=apply(ev);$('#ttitle').textContent=tstate.name;drawLB();drawMsgs();if(k==='msg'&&live&&opts.autoread&&ev.id!==myId&&Date.now()-(ev.ts||0)<6e4)readMsgs(false)};
 es.onerror=()=>$('#tstat').textContent='Reconnecting… (scores still save locally)'}
function drawLB(){if(!tstate)return;const pars=tstate.pars,rows=Object.values(tstate.players).map(p=>{const hs=Object.entries(p.scores);const s=hs.reduce((a,[,v])=>a+v,0),pr=hs.reduce((a,[h])=>a+(pars[h-1]||4),0);return{n:p.name,s,rel:s-pr,thru:hs.length}}).sort((a,b)=>(b.thru>0)-(a.thru>0)||a.rel-b.rel||b.thru-a.thru);
 $('#lb').innerHTML='<tr><th>#</th><th>Player</th><th>+/-</th><th>Thru</th><th>Tot</th></tr>'+rows.map((r,i)=>`<tr><td>${i+1}</td><td style="text-align:left">${esc(r.n)}</td><td><b>${r.thru?relS(r.rel):'-'}</b></td><td>${r.thru}</td><td>${r.s||''}</td></tr>`).join('')}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function drawMsgs(){$('#msgs').innerHTML=msgs.map(m=>`<div class="msg ${m.ann?'ann':''}"><b>${m.ann?'📢 ':''}${esc(m.from)}</b> <small>${new Date(m.ts).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small><br>${esc(m.text)}</div>`).join('');$('#msgs').scrollTop=1e9}
function readMsgs(all){if(!tour)return say('Join a tournament on the Tourney tab first.');const nw=msgs.filter(m=>m.ts>lastHeard&&m.from!==tour.name);const list=nw.length?nw:(all?msgs.slice(-3):[]);
 if(!list.length)return say('No new messages.');lastHeard=Math.max(...msgs.map(m=>m.ts));P('heard',lastHeard);say((nw.length?`${nw.length} new message${nw.length>1?'s':''}. `:'Last messages. ')+list.map(m=>`${m.ann?'Announcement from':''} ${m.from} says: ${m.text}.`).join(' '))}
async function sendMsg(text,ann){if(!tour)return say('Join a tournament first.');const r=await pub(tour.code,{t:'msg',from:tour.name,text:String(text).slice(0,280),ann:!!(ann||$('#mann').checked)}).catch(e=>({error:e.message||'offline'}));say(r.error?'Message failed: '+r.error:'Sent.')}
function voiceMsg(){listen(t=>sendMsg(t),'Say your message…')}
function postScore(h){if(!tour||round.course!==cur)return;pub(tour.code,{t:'score',name:tour.name,hole:h,strokes:round.holes[h]?.s||0}).catch(()=>{})}
async function join(code,name,info){code=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');name=name.trim().slice(0,24);if(!code||!name)return say('Enter your name and the code.');
 try{if(info)await pub(code,{t:'info',...info});await pub(code,{t:'join',name})}catch(e){return say('Could not join: '+(e.message||'offline'))}
 tour={code,name,title:info?.title,pars:info?.pars};save();render();connect();for(let h=1;h<=18;h++)if(round.holes[h]?.s)postScore(h);say(`Joined ${info?.title||'tournament '+code}. Good luck, ${name}.`)}
$('#tj').onclick=()=>join($('#tcode').value,$('#tname').value);
$('#tc').onclick=()=>{const nm=$('#tname').value.trim();if(!nm)return say('Enter your name first.');const a=crypto.getRandomValues(new Uint8Array(8)),cs='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=[...a].map(x=>cs[x%cs.length]).join('');join(code,nm,{title:($('#tnew').value||cur+' Cup').slice(0,40),pars:C().pars.slice()})};
$('#msend').onclick=()=>{const t=$('#mtxt').value.trim();if(t){sendMsg(t);$('#mtxt').value=''}};$('#mread').onclick=()=>readMsgs(true);$('#mvoice').onclick=voiceMsg;
$('#leave').onclick=()=>{tour=null;es?.close();save();$('#tjoin').style.display='block';$('#tin').style.display='none'};
$('#share').onclick=()=>{const u=location.origin+location.pathname+'?t='+tour.code;navigator.share?navigator.share({title:'Join my xLooper tournament',text:'Tournament code '+tour.code,url:u}).catch(()=>{}):(navigator.clipboard.writeText(u),say('Link copied.'))};
const qt=new URLSearchParams(location.search).get('t');if(qt){$('#tcode').value=qt;if(!tour||tour.code!==qt.toUpperCase()){$$('nav button')[3].click();$('#tname').focus()}}
const qCourse=new URLSearchParams(location.search).get('course');if(qCourse)previewCourse(location.search+location.hash);
$('#tname').value=tour?.name||L('pname','');$('#tname').onchange=e=>P('pname',e.target.value);
// ---------- xircle signup ----------
// Auto prompt: after the first saved round or the 3rd open. One dismiss, then at most one more ask after 2 further saved rounds.
function xircleEndpoint(){const t=window.XLOOPER_CONFIG&&window.XLOOPER_CONFIG.signupTopic;if(!t||typeof t!=='string')return '';return /^https?:\/\//i.test(t)?t:'https://ntfy.sh/'+t.replace(/^\/+/,'')}
function xircleDue(){if(xstate.signup||xstate.withdrawn)return false;const asks=xstate.asks|0;if(asks>=2)return false;if(asks===0)return hist.length>=1||(xstate.opens|0)>=3;return hist.length>=(xstate.at|0)+2}
let xircleManual=false;
function openXircle(manual){xircleManual=!!manual;$('#xi-ok').checked=false;$('#xi-err').textContent='';if(!$('#xi-name').value.trim())$('#xi-name').value=L('pname','')||'';$('#xircle').style.display='block'}
function dismissXircle(){$('#xircle').style.display='none';if(!xircleManual){xstate.asks=(xstate.asks|0)+1;xstate.at=hist.length;P('xircle',xstate)}xircleManual=false}
function maybeXircle(){const el=$('#xircle');if(!el||el.style.display==='block')return;if(xircleDue())openXircle(false)}
function xircleStatus(){const s=$('#xi-status'),b=$('#xi-set');if(!s||!b)return;
 if(xstate.signup){s.textContent=xstate.signup.sent?`Joined as ${xstate.signup.name}.`:`Saved on this device as ${xstate.signup.name}. The signup notice has not been sent yet.`;b.textContent=xstate.signup.sent?'Withdraw':'Retry signup';b.classList.toggle('red',!!xstate.signup.sent)}
 else{s.textContent=xstate.withdrawn?'You withdrew. You can join again any time.':'Not joined.';b.textContent='Join xircle';b.classList.remove('red')}}
function xirclePayload(){
 const name=$('#xi-name').value.trim().slice(0,80),email=$('#xi-email').value.trim().slice(0,120),phone=$('#xi-phone').value.trim().slice(0,24),zip=$('#xi-zip').value.trim().slice(0,12),home=$('#xi-home').value.trim().slice(0,80);
 if(name.length<1)return {error:'Enter your name.'};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {error:'Enter a real email address.'};
 if(phone&&(phone.replace(/\D/g,'').length<7||!/^[0-9+().\-\s]+$/.test(phone)))return {error:'Check the phone number, or leave it blank.'};
 if(zip&&!/^[A-Za-z0-9 \-]{3,12}$/.test(zip))return {error:'Check the ZIP, or leave it blank.'};
 if(!$('#xi-ok').checked)return {error:'Check the box to join. You can also choose Not now.'};
 const body={t:'signup',name,email,consent:true,ts:Date.now()};
 if(phone)body.phone=phone;if(zip)body.zip=zip;if(home)body.home=home;
 return {body};
}
async function sendXircle(body){const url=xircleEndpoint();if(!url)throw new Error('Signup is not configured');const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('HTTP '+r.status)}
async function submitXircle(){
 const got=xirclePayload();$('#xi-err').textContent=got.error||'';if(got.error)return;
 xstate.signup={name:got.body.name,email:got.body.email,phone:got.body.phone||'',zip:got.body.zip||'',home:got.body.home||'',ts:got.body.ts,sent:false};xstate.withdrawn=false;P('xircle',xstate);
 try{await sendXircle(got.body);xstate.signup.sent=true;P('xircle',xstate);$('#xircle').style.display='none';say('You are in xircle.')}
 catch(e){$('#xi-err').textContent='Saved on this device, but the notice did not send ('+(e.message||'offline')+'). You can retry from Clubs.'}
 xircleStatus()}
async function withdrawXircle(){
 if(!xstate.signup)return;
 if(!confirm('Withdraw from xircle? This removes your signup from this device.'))return;
 const email=xstate.signup.email,name=xstate.signup.name;
 xstate.signup=null;xstate.withdrawn=true;xstate.asks=2;P('xircle',xstate);xircleStatus();
 try{await sendXircle({t:'withdraw',email,name,ts:Date.now()});say('Withdrawn from xircle.')}
 catch{say('Removed on this device. The withdrawal notice did not send.')}}
async function retryXircle(){
 const s=xstate.signup;if(!s)return;
 const body={t:'signup',name:s.name,email:s.email,consent:true,ts:s.ts||Date.now()};
 if(s.phone)body.phone=s.phone;if(s.zip)body.zip=s.zip;if(s.home)body.home=s.home;
 try{await sendXircle(body);s.sent=true;P('xircle',xstate);say('Signup sent.')}
 catch{say('Still could not send the signup.')}
 xircleStatus()}
$('#xi-set').onclick=()=>{if(xstate.signup&&!xstate.signup.sent)return retryXircle();if(xstate.signup)return withdrawXircle();openXircle(true)};
$('#xi-join').onclick=()=>submitXircle();
$('#xi-later').onclick=()=>dismissXircle();
$('#xircle').onclick=e=>{if(e.target.id==='xircle')dismissXircle()};
render();connect();
maybeXircle();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
