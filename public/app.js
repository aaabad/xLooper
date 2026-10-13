// xLooper v0.11 – voice golf caddy PWA
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const LL=window.L; // Leaflet. Local L below is the storage helper and would shadow it.
const L=(k,d)=>{try{return JSON.parse(localStorage['xl.'+k])??d}catch{return d}},P=(k,v)=>localStorage['xl.'+k]=JSON.stringify(v);
const DEF_CLUBS=[['Driver',200],['3W',180],['5H',165],['6i',150],['7i',140],['8i',130],['9i',120],['PW',105],['GW',90],['SW',75]];
let courses=L('courses',{'My Course':{pars:[4,4,3,5,4,4,3,4,5,4,4,3,5,4,4,3,4,5],greens:{}}});
let cur=L('cur',Object.keys(courses)[0]); if(!courses[cur])cur=Object.keys(courses)[0];
let round=L('round',null), hist=L('hist',[]), clubs=L('clubs',DEF_CLUBS), hole=L('hole',1), tour=L('tour',null);
const hadOpts=localStorage.getItem('xl.opts')!=null;
let opts=L('opts',{autoread:true,metric:false,lang:'en'});
if(!opts||typeof opts!=='object')opts={autoread:true,metric:false,lang:'en'};
if(opts.lang!=='tl')opts.lang='en';
opts.metric=opts.metric===true; opts.sim=opts.sim===true; opts.countSim=opts.countSim===true;
if(!hadOpts)opts.unitsSet=false; else if(opts.unitsSet!==true)opts.unitsSet=true;
let bots=L('bots',[]); if(!Array.isArray(bots))bots=[];
let pos=null, acc=null, shot=L('shot',null), lastHeard=L('heard',0), msgs=[], tstate=null;
let searchHits=[], loadingCourse=false, autoTried=false, missSig='';
let opGen=0, inflight=null, autoCtl=null, resultsLocked=false, loadToken=0;
const memCache=new Map();
let xstate=L('xircle',{opens:0,asks:0,at:0,signup:null});
if(!xstate||typeof xstate!=='object'||Array.isArray(xstate))xstate={opens:0,asks:0,at:0,signup:null};
xstate.opens=(+xstate.opens||0)+1;P('xircle',xstate);
const C=()=>courses[cur], par=h=>C().pars[h-1]||4;
const save=()=>{P('courses',courses);P('cur',cur);P('round',round);P('hist',hist);P('clubs',clubs);P('hole',hole);P('tour',tour);P('opts',opts);P('shot',shot);P('bots',bots)};
const newRound=()=>({course:cur,date:new Date().toISOString(),holes:{},practice:!!opts.sim});
if(!round||round.course!==cur)round=newRound();
if(opts.sim)round.practice=true;
// ---------- speech ----------
function taglish(){return opts.lang==='tl'}
function tr(en,tl){return taglish()?tl:en}
let voice=null;
function pickVoice(){const v=('speechSynthesis'in window)?speechSynthesis.getVoices():[];
 if(taglish())voice=v.find(x=>/^fil|^tl/i.test(x.lang))||v.find(x=>/en-US/.test(x.lang)&&/Samantha|Google US|Aaron|Daniel/.test(x.name))||v.find(x=>/^en/i.test(x.lang))||null;
 else voice=v.find(x=>/en-US/.test(x.lang)&&/Samantha|Google US|Aaron|Daniel/.test(x.name))||v.find(x=>/^en/i.test(x.lang))||null}
if('speechSynthesis'in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
function paint(t){const s=t==null?'':String(t);const log=$('#log');if(log)log.textContent=s;const st=$('#cstatus');if(st){st.hidden=false;st.textContent=s}const toast=$('#toast');const onCaddy=$('#s-caddy')&&$('#s-caddy').classList.contains('on');const onCard=$('#s-card')&&$('#s-card').classList.contains('on');if(toast){toast.classList.remove('busy');if(onCaddy||onCard)toast.hidden=true;else{toast.hidden=false;toast.textContent=s}}}
function loadErr(e){const m=String(e&&(e.message||e.name)||'');if(/timeout|aborted|504|429|busy/i.test(m)||(e&&/Timeout|Abort/i.test(e.name||'')))return tr('The map service timed out.','Na-timeout ang map service.');if(/failed to fetch|network|offline/i.test(m))return tr('No network.','Walang network.');return m||tr('Something went wrong.','May problema.')}
let retryFn=null;
function hx(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function status(t,opt){opt=opt||{};paint(t);const st=$('#cstatus');if(st){st.hidden=false;st.innerHTML=(opt.busy?'<span class="spin"></span>':'')+hx(t)+(opt.retry?'<div><button type="button" class="b" id="cretry" style="min-height:52px;font-size:18px;margin-top:8px">'+hx(tr('Retry','Ulit'))+'</button></div>':'');const b=$('#cretry');if(b)b.onclick=()=>{if(retryFn)retryFn()}}const toast=$('#toast');if(toast&&!toast.hidden){toast.classList.toggle('busy',!!opt.busy);if(opt.busy)toast.innerHTML='<span class="spin"></span>'+hx(t)}}
function say(t){status(t);if(!('speechSynthesis'in window)||typeof speechSynthesis.speak!=='function')return;
 try{speechSynthesis.cancel()}catch{}
 const u=new SpeechSynthesisUtterance(t);try{if(voice)u.voice=voice}catch{}
 const fil=voice&&/^fil|^tl/i.test(voice.lang);
 u.lang=taglish()?(fil?(voice.lang||'fil-PH'):'en-US'):'en-US';u.rate=1;try{speechSynthesis.speak(u)}catch{}}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function listen(cb,prompt){if(!SR){say(tr("Voice input isn't supported in this browser. Use the buttons, or your keyboard's dictation mic.","Walang voice input sa browser na ito. Gamitin ang buttons."));return}
 const langs=taglish()?['fil-PH','en-US']:['en-US'];
 const start=i=>{const r=new SR();r.lang=langs[Math.min(i,langs.length-1)];r.interimResults=false;r.maxAlternatives=3;paint(prompt||tr('Listening…','Nakikinig…'));
  r.onresult=e=>{const said=(e.results&&e.results[0]&&e.results[0][0]&&e.results[0][0].transcript)||'';if(String(said).trim())cb(said);else if(i+1<langs.length)start(i+1)};
  r.onerror=e=>{const err=e&&e.error||'';if(i+1<langs.length&&/language-not-supported|no-speech|audio-capture|network|service-not-allowed/.test(err))start(i+1);else paint('Mic: '+err)};
  try{speechSynthesis.cancel()}catch{}
  try{r.start()}catch(err){if(i+1<langs.length)start(i+1);else $('#log').textContent='Mic: '+(err&&err.message||'error')}};
 start(0)}
// ---------- geo ----------
const R=6371e3,rad=x=>x*Math.PI/180;
function dist(a,b){const dl=rad(b[0]-a[0]),dn=rad(b[1]-a[1]),h=Math.sin(dl/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const M_PER_YD=0.9144;
const yds=m=>Math.round(opts.metric?m:m*1.09361),unit=()=>opts.metric?'meters':'yards',unitTl=()=>opts.metric?'metro':'yarda',unitShort=()=>opts.metric?'m':'yds';
const clubShown=yards=>opts.metric?Math.round(+yards*M_PER_YD):Math.round(+yards);
const clubStored=n=>{const v=+n||0;return opts.metric?Math.round(v/M_PER_YD):Math.round(v)};
function gpsLabel(){if(opts.sim)return 'SIM ±'+(acc==null?'':yds(acc)+' '+unitShort());if(acc==null)return 'GPS…';return 'GPS ±'+yds(acc)+' '+unitShort()}
function onFix(p){if(opts.sim)return;pos=[p.coords.latitude,p.coords.longitude];acc=p.coords.accuracy;const g=$('#gps');if(g)g.textContent=gpsLabel();render();considerNearby();maybeAutoCourse();if(me)me.setLatLng(pos)}
if('geolocation'in navigator)navigator.geolocation.watchPosition(onFix,e=>{if(!opts.sim){$('#gps').textContent='GPS: '+e.message}},{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
else if(!opts.sim)$('#gps').textContent='No GPS';
let wake;async function keepAwake(){try{wake=await navigator.wakeLock?.request('screen')}catch{}}document.addEventListener('visibilitychange',()=>document.visibilityState==='visible'&&keepAwake());keepAwake();
const toGreen=()=>{const g=C().greens[hole];return g&&pos?dist(pos,g):null};
function clubFor(y){const s=[...clubs].sort((a,b)=>a[1]-b[1]);if(y<=40)return['putter or wedge chip',y];for(const c of s)if(c[1]>=y-4)return c;return s[s.length-1]}
// ---------- caddy actions ----------
function holeTargets(h){try{return window.XLMap?XLMap.targets(C(),h,pos):null}catch{return null}}
function sayNoGreen(){say(tr(`No green set for hole ${hole}. Open the map and tap the green.`,`Walang green sa hole ${hole}. Buksan ang map, tap mo ang green.`))}
function sayWait(){say(tr('Waiting for GPS.','Hintayin ang GPS.'))}
function hazardKind(kind){if(kind==='bunker')return 'bunker';if(kind==='lateral_water_hazard')return taglish()?'lateral water':'lateral water';return taglish()?'tubig':'water'}
function nearestHazard(){if(!pos)return null;const info=C().holes&&(C().holes[hole]||C().holes[String(hole)]);const line=info&&info.line;let best=null;
 for(const h of C().hazards||[]){if(!h||!h.pts||!h.pts.length)continue;let lat=0,lon=0;for(const p of h.pts){lat+=+p[0];lon+=+p[1]}lat/=h.pts.length;lon/=h.pts.length;if(!isFinite(lat))continue;
  if(line&&line.length>=2&&dist([lat,lon],line[0])>500&&dist([lat,lon],line[line.length-1])>500)continue;const d=dist(pos,[lat,lon]);if(d>250||(best&&d>=best.d))continue;best={d,kind:h.kind,label:hazardKind(h.kind)}}
 return best}
function hazardSentence(){const hz=nearestHazard();if(!hz)return '';const n=yds(hz.d),u=taglish()?unitTl():unit();return tr(` Nearest ${hz.label} is ${n} ${u}.`,` Pinakamalapit na ${hz.label} ay ${n} ${u}.`)}
function sayYardage(){const g=C().greens[hole];if(!g)return sayNoGreen();if(!pos)return sayWait();
 const c=yds(dist(pos,g)),t=holeTargets(hole),f=t?yds(dist(pos,t.front)):c,b=t?yds(dist(pos,t.back)):c,ue=unit(),ut=unitTl(),hz=hazardSentence();
 if(f===c&&b===c)return say(tr(`${c} ${ue} to the center of the green on hole ${hole}.`+hz,`${c} ${ut} sa gitna ng green, hole ${hole}.`+hz));
 say(tr(`${f} ${ue} to the front, ${c} to the center, ${b} to the back of the green on hole ${hole}.`+hz,`${f} sa harap, ${c} sa gitna, ${b} sa likod ng green. Hole ${hole}.`+hz))}
function sayClub(){const d=toGreen();if(d==null)return sayYardage();const y=Math.round(d*1.09361),c=clubFor(y),n=yds(d),ue=unit(),ut=unitTl();
 const max=clubs.reduce((m,x)=>Math.max(m,x[1]),0),spoken=c[0]==='putter or wedge chip'?tr('putter or wedge chip','putter o wedge'):(taglish()?clubTaglish(c[0]):clubName(c[0]));
 if(taglish())return say(y>max?`${n} ${ut}. ${spoken} muna, hindi aabot, so position lang.`:y<=40?`${n} ${ut}. Chip o putt na.`:`${n} ${ut} sa gitna ng green, ${spoken} ka.`);
 say(y>max?`${n} ${ue}. Hit ${c[0]}, you won't reach, so play for position.`:y<=40?`${n} ${ue}. Chip or putt.`:`${n} ${ue}. I like the ${clubName(c[0])}.`)}
const clubName=n=>n.replace(/^(\d)i$/,'$1 iron').replace(/^(\d)W$/,'$1 wood').replace(/^(\d)H$/,'$1 hybrid').replace(/^PW$/,'pitching wedge').replace(/^GW$/,'gap wedge').replace(/^SW$/,'sand wedge').replace(/^LW$/,'lob wedge');
const clubTaglish=n=>String(n).replace(/^Driver$/i,'driver').replace(/^(\d)i$/,'$1-iron').replace(/^(\d)W$/,'$1-wood').replace(/^(\d)H$/,'$1-hybrid').replace(/^PW$/,'pitching wedge').replace(/^GW$/,'gap wedge').replace(/^SW$/,'sand wedge').replace(/^LW$/,'lob wedge');
function markShot(){if(!pos)return sayWait();const u=taglish()?unitTl():unit();if(shot&&shot.hole===hole){const y=yds(dist(shot.at,pos));say(tr(`That shot went ${y} ${unit()}. Marked a new start here.`,`${y} ${u} ang tira. Marked ulit dito.`));$('#lastshot').textContent=tr(`Last shot: ${y} ${unit()}`,`Huling tira: ${y} ${u}`)}else say(tr('Shot marked. Walk to your ball and say mark shot again.','Marked na ang tira. Pumunta ka sa bola, tapos sabihin mo ulit mark shot.'));shot={hole,at:pos};save()}
function totals(){let s=0,pp=0,pr=0,p=0,n=0;for(let h=1;h<=18;h++){const x=round.holes[h];if(x&&x.s){s+=x.s;pp+=x.p||0;pr+=par(h);n++}}return{s,putts:pp,par:pr,n,rel:s-pr}}
const relTxt=r=>r===0?tr('even par','even'):r>0?`${r} ${tr('over par','over')}`:`${-r} ${tr('under par','under')}`,relS=r=>r===0?'E':r>0?'+'+r:''+r;
function sayScore(){const t=totals();if(!t.n)return say(tr('No scores yet this round.','Wala pang score sa round na ito.'));say(tr(`Through ${t.n} hole${t.n>1?'s':''} you're at ${t.s}, ${relTxt(t.rel)}, with ${t.putts} putts.`,`After ${t.n} hole${t.n>1?'s':''}, ${t.s} ka, ${relTxt(t.rel)}, ${t.putts} putts.`))}
function scoreCall(d){const en={'-3':'albatross','-2':'eagle','-1':'birdie','0':'par','1':'bogey','2':'double bogey'}[d];
 if(!taglish())return en||(d>0?`${d} over`:'');
 return {'-3':'Albatross! Grabe.','-2':'Eagle! Ang galing.','-1':'Birdie! Nice.','0':'Par ka! Nice.','1':'Bogey. Okay lang.','2':'Double bogey.'}[d]||(d>0?`${d} over.`:'')}
function setScore(s,p,h=hole){round.holes[h]={s,p:p??round.holes[h]?.p??0};save();render();postScore(h);const t=totals(),d=s-par(h),name=scoreCall(d);
 if(taglish())return say(`${name} Hole ${h}: ${s}${p!=null?`, ${p} putt${p==1?'':'s'}`:''}. ${relTxt(t.rel)} ka after ${t.n}.`);
 say(`Hole ${h}: ${s}${p!=null?`, ${p} putt${p==1?'':'s'}`:''}. ${name}. You're ${relTxt(t.rel)} through ${t.n}.`)}
function go(h){hole=Math.max(1,Math.min(18,h));shot=null;save();render();const g=C().greens[hole];
 let extra='';if(g&&pos){const c=yds(dist(pos,g)),t=holeTargets(hole),f=t?yds(dist(pos,t.front)):c,b=t?yds(dist(pos,t.back)):c;
  extra=taglish()?((f===c&&b===c)?` ${c} ${unitTl()} sa gitna.`:` ${f} sa harap, ${c} sa gitna, ${b} sa likod.`):((f===c&&b===c)?` ${c} ${unit()} to the green.`:` ${f} front, ${c} center, ${b} back.`)}
 say(taglish()?`Hole ${hole} na tayo. Par ${par(hole)}.`+extra:`Hole ${hole}, par ${par(hole)}.`+extra)}
// ---------- voice commands ----------
const NUM={zero:0,one:1,won:1,two:2,to:2,too:2,three:3,four:4,for:4,five:5,six:6,seven:7,eight:8,ate:8,nine:9,ten:10,eleven:11,twelve:12,isa:1,dalawa:2,tatlo:3,apat:4,lima:5,anim:6,pito:7,walo:8,siyam:9,sampu:10};
const nums=t=>t.toLowerCase().replace(/labing-?isa/g,'11').replace(/labing-?dalawa/g,'12').replace(/[a-z]+/g,w=>w in NUM?NUM[w]:w).match(/\d+/g)?.map(Number)||[];
function command(t){const s=t.toLowerCase();$('#log').textContent='“'+t+'”';
 const uq=s.replace(/\s+/g,' ').trim();
 if(/^(?:use |switch to |lumipat sa |sa )?(?:meters|meter|metros|metro)$/.test(uq))return setUnits(true);
 if(/^(?:use |switch to |lumipat sa |sa )?(?:yards|yardas|yarda)$/.test(uq))return setUnits(false);
 if(/read (the )?message|any message|messages|basahin/.test(s))return readMsgs(true);
 if(/^(send|message|tell|announce|ipadala|mag-?message)/.test(s)){const txt=t.replace(/^(send( a)? message|send|message|tell everyone|tell|announce|ipadala|mag-?message)\s*(that|na)?\s*/i,'');return txt?sendMsg(txt,/announce|anunsyo/.test(s)):voiceMsg()}
 if(/what('?s| is) my score|my score|how am i doing|^total$|score ko|ano(ng)? score|ilan (na )?ang score|ilan na/.test(s))return sayScore();
 if(/score|iskor|i (got|made|shot|had)|put me down|naka-?\s/.test(s)){const n=nums(s);if(!n.length)return say(tr('Say score and a number, like score 5 with 2 putts.','Sabihin ang score at numero, halimbawa score 5, 2 putts.'));const holeM=s.match(/hole (\d+)/);let h=hole;let arr=n;if(holeM){h=+holeM[1];arr=n.filter((x,i)=>!(x===h&&i===n.indexOf(h)))}return setScore(arr[0],/putt/.test(s)?arr[1]:undefined,h)}
 if(/putt/.test(s)){const n=nums(s);if(n.length){const x=round.holes[hole]||{s:0};x.p=n[0];round.holes[hole]=x;save();render();return say(tr(`${n[0]} putts on hole ${hole}.`,`${n[0]} putt${n[0]==1?'':'s'} sa hole ${hole}.`))}}
 if(/susunod na hole|sunod na hole|next hole|next/.test(s))return go(hole+1);if(/previous|last hole|nakaraang|huling hole|balik|back/.test(s))return go(hole-1);
 if(/go to hole|pumunta sa hole|hole \d+|hole (isa|dalawa|tatlo|apat|lima|anim|pito|walo|siyam|sampu)/.test(s)){const n=nums(s);if(n.length)return go(n[0])}
 if(/markahan ang tira|mark (the )?shot|mark ball|mark tira/.test(s))return markShot();
 if(/markahan ang green|mark (the )?green/.test(s))return markGreenHere();
 if(/anong club|aling club|anong stick|what should i hit|which|club/.test(s))return sayClub();
 if(/gaano ka ?layo|gaano kalayo|kalayo|distansya|yardage|how far|distance|yard|\bfar\b/.test(s))return sayYardage();
 say(tr("Sorry, try: yardage, what club, next hole, score 5, mark shot, use yards, use meters, or what's my score.","Subukan: gaano kalayo, anong club, susunod na hole, score 5, yarda, metro, o score ko."))}
function setUnits(metric){opts.metric=!!metric;opts.unitsSet=true;save();render();say(tr(opts.metric?'Distances in meters.':'Distances in yards.',opts.metric?'Distansya sa metro.':'Distansya sa yarda.'))}
function greenAt(h){const g=C().greens&&(C().greens[h]??C().greens[String(h)]);return Array.isArray(g)&&g.length>=2&&isFinite(+g[0])&&isFinite(+g[1])?[+g[0],+g[1]]:null}
function teePoint(h,allowGreen){const c=C();const t=c.tees&&(c.tees[h]||c.tees[String(h)]);if(Array.isArray(t)&&t.length>=2&&isFinite(+t[0])&&isFinite(+t[1]))return [+t[0],+t[1]];
 const info=c.holes&&(c.holes[h]||c.holes[String(h)]);const line=info&&info.line;if(line&&line.length&&Array.isArray(line[0]))return [+line[0][0],+line[0][1]];return allowGreen?greenAt(h):null}
function bearingTo(a,b){const y=Math.sin(rad(b[1]-a[1]))*Math.cos(rad(b[0]));const x=Math.cos(rad(a[0]))*Math.sin(rad(b[0]))-Math.sin(rad(a[0]))*Math.cos(rad(b[0]))*Math.cos(rad(b[1]-a[1]));return Math.atan2(y,x)}
function offsetLL(from,meters,bearing){const d=meters/6371000,lat1=rad(from[0]),lon1=rad(from[1]);const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(bearing));const lon2=lon1+Math.atan2(Math.sin(bearing)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));return [lat2*180/Math.PI,lon2*180/Math.PI]}
function maybeAutoHole(){if(!opts.sim||!pos||hole>=18)return;const tee=teePoint(hole+1,false),g=greenAt(hole);if(!tee)return;if(dist(pos,tee)<30&&(!g||dist(pos,g)>40)){hole+=1;shot=null;save()}}
function placeSim(ll){if(!ll||!isFinite(+ll[0])||!isFinite(+ll[1]))return;pos=[+ll[0],+ll[1]];acc=3;maybeAutoHole();render();if(me)me.setLatLng(pos);considerNearby()}
function setSim(on){opts.sim=!!on;if(opts.sim){round.practice=true;save();const t=teePoint(hole,true)||pos;if(t)placeSim(t);else render();say(tr('Simulation on. You are on the tee.','Simulation on. Nasa tee ka.'))}
 else{if(!totals().n)round.practice=false;save();render();say(tr('Simulation off. Using real GPS.','Simulation off. Totoong GPS na.'))}}
function moveSim(meters,lateral){if(!pos){const t=teePoint(hole,true);if(!t)return say(tr('No tee on this hole.','Walang tee sa hole na ito.'));placeSim(t)}
 const g=greenAt(hole);let br=g&&dist(pos,g)>=1?bearingTo(pos,g):0;let dest=offsetLL(pos,Math.max(0,meters),br);if(lateral)dest=offsetLL(dest,lateral,br+Math.PI/2);placeSim(dest)}
function walkSim(){moveSim(opts.metric?50:50*M_PER_YD,0)}
function hitSim(){const g=greenAt(hole);if(!g)return say(tr('No green on this hole yet.','Wala pang green sa hole na ito.'));if(!pos){const t=teePoint(hole,true);if(t)placeSim(t)}
 const y=Math.round(dist(pos,g)*1.09361),c=clubFor(y);let carry=c[1]*M_PER_YD;const jitter=carry*(Math.random()*0.08-0.04),lateral=carry*(Math.random()*0.06-0.03),remain=dist(pos,g);
 if(carry+jitter>remain)carry=Math.max(1,remain-4);moveSim(Math.max(1,carry+jitter),lateral);say(tr('Hit the '+clubName(c[0])+'.','Tira ng '+c[0]+'.'))}
function jumpGreen(){const g=greenAt(hole);if(!g)return say(tr('No green on this hole yet.','Wala pang green sa hole na ito.'));placeSim(g);say(tr('On the green.','Nasa green ka na.'))}
function nextTee(){hole=hole>=18?1:hole+1;shot=null;const t=teePoint(hole,true);if(t)placeSim(t);else{save();render()}sayYardage()}
// ---------- render ----------
function render(){$('#hn').textContent=hole;$('#hp').textContent=par(hole);$('#cname').textContent=cur;const mh=$('#mh');if(mh)mh.textContent=hole;
 const d=toGreen();$('#yd').textContent=d==null?'—':yds(d);$('#fb').textContent=d==null?'':unitShort();
 const tg=d!=null&&holeTargets(hole);$('#ydF').textContent=tg?yds(dist(pos,tg.front)):'—';$('#ydB').textContent=tg?yds(dist(pos,tg.back)):'—';
 $('#club').textContent=d==null?(C().greens[hole]?tr('Waiting for GPS…','Hintay GPS…'):tr('Set green on Map','I-set ang green sa Map')):(()=>{const y=Math.round(d*1.09361);return y<=40?'Chip / putt':clubFor(y)[0]})();
 const x=round.holes[hole]||{};$('#st').textContent=x.s||0;$('#pt').textContent=x.p||0;
 let h='<tr><th>H</th><th>Par</th><th>Score</th><th>Putts</th><th>+/-</th></tr>',run=0;
 for(let i=1;i<=18;i++){const y=round.holes[i]||{};if(y.s)run+=y.s-par(i);h+=`<tr class="${i===hole?'cur':''}"><td onclick="go(${i})">${i}</td><td><input type=number data-par=${i} value=${par(i)}></td><td><input type=number data-s=${i} value="${y.s||''}"></td><td><input type=number data-p=${i} value="${y.p??''}"></td><td>${y.s?relS(run):''}</td></tr>`;
  if(i===9){const f=[1,2,3,4,5,6,7,8,9].reduce((a,k)=>a+(round.holes[k]?.s||0),0);h+=`<tr><th>Out</th><th>${C().pars.slice(0,9).reduce((a,b)=>a+b,0)}</th><th>${f||''}</th><th></th><th></th></tr>`}}
 const t=totals();h+=`<tr><th>Tot</th><th>${C().pars.reduce((a,b)=>a+b,0)}</th><th>${t.s||''}</th><th>${t.putts||''}</th><th>${t.n?relS(t.rel):''}</th></tr>`;$('#sc').innerHTML=h;
 $('#tot').textContent=t.n?`${t.s} (${relS(t.rel)}) ${tr('thru','sa')} ${t.n} · ${t.putts} putts`:tr('No scores yet','Wala pang score');
 $('#course').innerHTML=Object.keys(courses).map(c=>`<option ${c===cur?'selected':''}>${esc(c)}</option>`).join('');
 $('#hist').innerHTML=hist.slice().reverse().map(r=>`<div class="card">${String(r.date||'').slice(0,10)} · ${hx(r.course)}${r.practice?' · practice':''}: <b>${r.s}</b> (${relS(r.rel)}) · ${r.putts} putts · ${r.n} holes</div>`).join('')||`<small>${tr('No rounds yet','Wala pang round')}</small>`;
 $('#ct').innerHTML=clubs.map((c,i)=>`<tr><td><input data-cn=${i} value="${hx(c[0])}" style="width:90px"></td><td><input type=number data-cy=${i} value=${clubShown(c[1])} style="width:90px"></td><td><button class="b b2" style="min-height:40px;padding:4px 12px" onclick="clubs.splice(${i},1);save();render()">✕</button></td></tr>`).join('');
 $('#autoread').checked=opts.autoread;drawGreens();showMissing();xircleStatus();paintChrome();applyLang();showSplit()}
function paintChrome(){const m=!!opts.metric;
 for(const id of ['uYd','sYd']){const b=$('#'+id);if(b){b.classList.toggle('on',!m);b.setAttribute('aria-pressed',!m?'true':'false')}}
 for(const id of ['uM','sM']){const b=$('#'+id);if(b){b.classList.toggle('on',m);b.setAttribute('aria-pressed',m?'true':'false')}}
 const head=$('#clubhead');if(head){head.setAttribute('data-en','My distances (carry, '+(m?'m':'yds')+')');head.setAttribute('data-tl','Mga distansya ko (carry, '+(m?'m':'yds')+')')}
 const ask=$('#unitask');if(ask)ask.hidden=!!opts.unitsSet;
 const ban=$('#simban');if(ban)ban.hidden=!opts.sim;
 const box=$('#simbox');if(box)box.hidden=!opts.sim;
 const walk=$('#simWalk');if(walk){walk.setAttribute('data-en',m?'Walk 50 m':'Walk 50 yds');walk.setAttribute('data-tl',m?'Lakad 50 m':'Lakad 50 yarda')}
 const sim=$('#sim');if(sim)sim.checked=!!opts.sim;
 const cs=$('#countSim');if(cs)cs.checked=!!opts.countSim;
 const csl=$('#countSimLbl');if(csl)csl.style.display=opts.sim?'flex':'none';
 const kw=$('#keepWrap');if(kw)kw.style.display=(opts.sim||round.practice)?'flex':'none';
 const hz=nearestHazard(),hel=$('#haz');if(hel)hel.textContent=hz?hz.label+' '+yds(hz.d)+' '+unitShort():'';
 const flag=$('#tpracflag');if(flag)flag.hidden=!(tour&&tour.practice);
 const pb=$('#pracbox');if(pb)pb.style.display=(tour&&tour.practice&&tour.host)?'block':'none';
 paintVirtual();
 if(opts.sim){const g=$('#gps');if(g)g.textContent=gpsLabel()}}
function applyLang(){document.documentElement.lang=taglish()?'fil':'en';const sel=$('#lang');if(sel&&sel.value!==(taglish()?'tl':'en'))sel.value=taglish()?'tl':'en';
 $$('[data-en]').forEach(el=>{const s=taglish()?(el.getAttribute('data-tl')??el.getAttribute('data-en')):el.getAttribute('data-en');if(s==null)return;if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')el.placeholder=s;else el.textContent=s});
 const hint=$('#maphint');if(hint)hint.innerHTML=opts.sim?tr('Simulation: tap the map to place yourself.','Simulation: i-tap ang mapa para pumwesto.'):tr(`Search sets the course up from home. Tap the photo to mark a hole that is still missing a green (Hole <span id="mh">${hole}</span>).`,`Pwede sa bahay ang setup. I-tap ang photo kung may hole na walang green (Hole <span id="mh">${hole}</span>).`);
 const sh=$('#searchhint');if(sh)sh.textContent=tr('Works from home. No GPS needed. Find my course, on the caddy, is for when you are standing on the course.','Pwede sa bahay. Hindi kailangan ng GPS. Course ko (GPS), sa caddy, kapag nandoon ka na sa course.')}
window.go=go;
// ---------- events ----------
$$('nav button').forEach(b=>b.onclick=()=>{$$('nav button,section').forEach(x=>x.classList.remove('on'));b.classList.add('on');$('#s-'+b.dataset.s).classList.add('on');if(b.dataset.s==='map')initMap()});
$('#prev').onclick=()=>go(hole-1);$('#next').onclick=()=>go(hole+1);$('#bYd').onclick=sayYardage;$('#bClub').onclick=sayClub;$('#bShot').onclick=markShot;$('#bScoreQ').onclick=sayScore;
$('#mic').onclick=()=>listen(command);$('#bMsgs').onclick=()=>readMsgs(true);$('#bSay').onclick=()=>voiceMsg();
$$('[data-k]').forEach(b=>b.onclick=()=>{const x=round.holes[hole]||{s:0,p:0};if(b.dataset.k==='s'){x.s=Math.max(0,(x.s||0)+ +b.dataset.d)}else x.p=Math.max(0,(x.p||0)+ +b.dataset.d);round.holes[hole]=x;if(!x.s)delete round.holes[hole];save();render();postScore(hole)});
$('#sc').onchange=e=>{const t=e.target,d=t.dataset;if(d.par){C().pars[d.par-1]=+t.value||4}else if(d.s){const h=+d.s;if(+t.value)round.holes[h]={...round.holes[h],s:+t.value};else delete round.holes[h];postScore(h)}else if(d.p){const h=+d.p;round.holes[h]={s:0,...round.holes[h],p:+t.value}}save();render()};
$('#ct').onchange=e=>{const d=e.target.dataset;if(d.cn)clubs[d.cn][0]=e.target.value;if(d.cy)clubs[d.cy][1]=clubStored(e.target.value);save();render()};
$('#addclub').onclick=()=>{clubs.push(['LW',60]);save();render()};$('#resetc').onclick=()=>{clubs=DEF_CLUBS.map(x=>[...x]);save();render()};
$('#autoread').onchange=e=>{opts.autoread=e.target.checked;save()};
for(const [id,metric] of [['uYd',false],['sYd',false],['askYd',false],['uM',true],['sM',true],['askM',true]]){const b=$('#'+id);if(b)b.onclick=()=>setUnits(metric)}
$('#sim').onchange=e=>setSim(e.target.checked);
$('#countSim').onchange=e=>{opts.countSim=e.target.checked;save()};
$('#simWalk').onclick=walkSim;$('#simHit').onclick=hitSim;$('#simGreen').onclick=jumpGreen;$('#simNext').onclick=nextTee;
$('#lang').onchange=()=>{opts.lang=$('#lang').value==='tl'?'tl':'en';save();pickVoice();missSig='';render();say(tr('English.','Taglish na.'))};
$('#course').onchange=e=>{if(totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.')))return render();cur=e.target.value;round=newRound();hole=1;save();render();if(map)fitGreens()};
$('#addc').onclick=()=>{const n=$('#newc').value.trim();if(!n)return;courses[n]=courses[n]||{pars:Array(18).fill(4),greens:{},shapes:[]};cur=n;round=newRound();hole=1;$('#newc').value='';save();render()};
$('#fin').onclick=()=>{const t=totals();if(!t.n)return say(tr('Nothing to save yet.','Wala pang i-save.'));const practice=!!(round.practice||opts.sim);
 if(!practice||($('#keepPractice')&&$('#keepPractice').checked)){hist.push({...t,course:cur,date:round.date,holes:round.holes,practice});say(tr(`Round saved: ${t.s}, ${relTxt(t.rel)}, ${t.putts} putts.`,`Saved na ang round: ${t.s}, ${relTxt(t.rel)}, ${t.putts} putts.`))}
 else say(tr('Practice round. Left out of history.','Practice round. Hindi kasama sa history.'));
 round=newRound();hole=1;save();render();maybeXircle()};
$('#newr').onclick=()=>{if(confirm(tr('Clear the current card?','Burahin ang card na ito?'))){round=newRound();hole=1;save();render()}};
// ---------- map ----------
let map,me,gLayer,osmLayer;
function initMap(){if(map){setTimeout(()=>map.invalidateSize(),50);return}
 map=LL.map('map',{zoomControl:true}).setView(pos||[40.0,-74.5],pos?17:5);
 LL.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19,attribution:'Esri World Imagery'}).addTo(map);
 me=LL.circleMarker(pos||[0,0],{radius:8,color:'#fff',fillColor:'#2a8cff',fillOpacity:1}).addTo(map);gLayer=LL.layerGroup().addTo(map);osmLayer=LL.layerGroup().addTo(map);
 map.on('click',e=>{if(opts.sim){placeSim([e.latlng.lat,e.latlng.lng]);say(tr('Placed you here.','Nandito ka na.'));return}C().greens[hole]=[r6(e.latlng.lat),r6(e.latlng.lng)];C().shapes=(C().shapes||[]).filter(s=>+s.hole!==hole);save();render();say(tr(`Green set for hole ${hole}.`,`Naka-set na ang green sa hole ${hole}.`))});drawGreens();fitGreens()}
function coursePts(){const pts=[];for(const g of Object.values(C().greens||{}))if(Array.isArray(g)&&g.length>=2)pts.push(g);for(const info of Object.values(C().holes||{}))if(info&&info.line)for(const p of info.line)if(Array.isArray(p))pts.push(p);for(const r of (C().outline&&C().outline.outers)||[])for(const p of r||[])if(Array.isArray(p))pts.push(p);return pts}
function playingHere(){if(!pos)return false;for(const g of Object.values(C().greens||{}))if(Array.isArray(g)&&g.length>=2&&dist(pos,g)<4000)return true;const o=C().outline;return !!(o&&o.outers&&o.outers.length&&window.XLMap&&XLMap.pointInCourse(pos,o.outers,o.inners||[]))}
function fitCourse(forceWhole){if(!map)return;const pts=coursePts();if(!forceWhole&&playingHere()){map.setView(pos,17);return}if(pts.length>=2)map.fitBounds(pts,{maxZoom:17,padding:[20,20]});else if(pts.length===1)map.setView(pts[0],17);else if(pos)map.setView(pos,17)}
function fitGreens(){fitCourse(false)}
function drawGreens(){if(!gLayer)return;gLayer.clearLayers();
 const quiet={interactive:false};
 for(const r of (C().outline&&C().outline.outers)||[])if(r.length>=3)LL.polygon(r,{color:'#fff',weight:2,fill:false,...quiet}).addTo(gLayer);
 const hz={bunker:'#c2a15a',water_hazard:'#3aa0d8',lateral_water_hazard:'#e55'};
 for(const h of C().hazards||[])if(h.pts?.length>=3){LL.polygon(h.pts,{color:hz[h.kind]||'#888',weight:1,fillColor:hz[h.kind]||'#888',fillOpacity:.45,...quiet}).addTo(gLayer);
  if(pos){let lat=0,lon=0;for(const p of h.pts){lat+=+p[0];lon+=+p[1]}lat/=h.pts.length;lon/=h.pts.length;const d=dist(pos,[lat,lon]);if(d<400)LL.marker([lat,lon],{interactive:false,icon:LL.divIcon({className:'',html:`<div style="color:#fff;font-size:12px;font-weight:800;text-shadow:0 1px 2px #000">${yds(d)} ${unitShort()}</div>`,iconSize:[64,16],iconAnchor:[32,8]})}).addTo(gLayer)}}
 for(const[h,info]of Object.entries(C().holes||{}))if(info.line?.length>=2)LL.polyline(info.line,{color:+h===hole?'#ffd23f':'#fff',weight:+h===hole?3:1,opacity:.75,...quiet}).addTo(gLayer);
 for(const s of C().shapes||[])if(s.kind!=='hazard'&&s.pts?.length>=3)LL.polygon(s.pts,{color:+s.hole===hole?'#ffd23f':'#9be564',weight:2,fillOpacity:.25,...quiet}).addTo(gLayer);
 for(const t of Object.values(C().tees||{}))if(Array.isArray(t)&&t.length>=2)LL.circleMarker(t,{radius:5,color:'#fff',fillColor:'#9be564',fillOpacity:1,weight:1,...quiet}).addTo(gLayer);
 for(const[h,g]of Object.entries(C().greens))LL.marker(g,{icon:LL.divIcon({className:'',html:`<div style="background:${+h===hole?'#ffd23f':'#9be564'};color:#06210f;border-radius:50%;width:30px;height:30px;line-height:30px;text-align:center;font-weight:800;border:2px solid #fff">${h}</div>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(gLayer)}
function markGreenHere(){if(!pos)return sayWait();C().greens[hole]=[r6(pos[0]),r6(pos[1])];C().shapes=(C().shapes||[]).filter(s=>+s.hole!==hole);save();render();say(tr(`Green marked for hole ${hole} at your position.`,`Naka-mark ang green sa hole ${hole}, dito ka.`))}
$('#mkGreen').onclick=markGreenHere;$('#center').onclick=()=>pos&&map.setView(pos,18);
$('#osm').onclick=async()=>{const c=map.getCenter();say(tr('Looking for greens nearby.','Hahanapin ang mga green dito.'));
 const q=`[out:json][timeout:25];(way["golf"="green"](around:2500,${c.lat},${c.lng});node["golf"="hole"](around:2500,${c.lat},${c.lng});way["golf"="hole"](around:2500,${c.lat},${c.lng}););out geom tags;`;
 try{const r=await overpass(q);osmLayer.clearLayers();
  const greens=r.elements.filter(e=>e.tags?.golf==='green'&&e.geometry),holes=r.elements.filter(e=>e.tags?.golf==='hole'&&e.geometry);let auto=0;
  for(const g of greens){const pts=g.geometry.map(p=>[p.lat,p.lon]),cen=[pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length];
   // auto-assign if an OSM hole line ends on this green
   const ho=holes.find(h=>{const e=h.geometry[h.geometry.length-1];return dist([e.lat,e.lon],cen)<40&&h.tags.ref});if(ho&&!C().greens[ho.tags.ref]){C().greens[+ho.tags.ref]=cen.map(r6);rememberShape(+ho.tags.ref,pts);auto++}
   LL.polygon(pts,{color:'#ffd23f',weight:2}).addTo(osmLayer).on('click',ev=>{LL.DomEvent.stop(ev);C().greens[hole]=cen.map(r6);rememberShape(hole,pts);save();render();say(tr(`Green set for hole ${hole}.`,`Naka-set na ang green sa hole ${hole}.`))})}
  save();render();say(tr(`Found ${greens.length} greens${auto?`, auto-assigned ${auto} by hole number`:''}. Tap a yellow green to assign it to hole ${hole}.`,`May ${greens.length} green${auto?`, ${auto} ang automatic sa hole number`:''}. I-tap ang yellow green para sa hole ${hole}.`))}catch(e){say(tr('Could not reach OpenStreetMap.','Hindi maabot ang OpenStreetMap.'))}};
// ---------- course search (home setup; GPS find is the backup) ----------
function maybeAutoCourse(){if(autoTried||navigator.webdriver||!pos||resultsLocked)return;autoTried=true;findNearby(true).catch(()=>{})}
function openMap(){$$('nav button,section').forEach(x=>x.classList.remove('on'));const b=$$('nav button').find(x=>x.dataset.s==='map');if(b)b.classList.add('on');$('#s-map').classList.add('on');initMap();
 const refit=()=>{if(!map)return;map.invalidateSize();fitCourse(true)};
 requestAnimationFrame(refit);setTimeout(refit,250)}
function missingHoles(){const holes=C().holes||{},miss=[];for(let h=1;h<=18;h++)if(holes[h]?.line?.length>=2&&!hasGreen(C(),h))miss.push(h);return miss}
function showMissing(){const el=$('#fixholes');if(!el)return;const miss=C().source==='osm'?missingHoles():[];const sig=cur+'|'+miss.join(',')+'|'+(opts.lang||'en');if(sig===missSig)return;missSig=sig;
 if(!miss.length){el.style.display='none';el.innerHTML='';return}
 el.style.display='block';el.innerHTML=tr(`<b>${miss.length} hole${miss.length>1?'s':''} missing a green</b><br><small>Holes ${miss.join(', ')}. The map is the preview. Pick a hole and tap the photo where the green is. No GPS needed.</small>`,`<b>${miss.length} hole ang walang green</b><br><small>Holes ${miss.join(', ')}. Preview ito. Pili ka ng hole, tap ang photo kung nasaan ang green. Hindi kailangan ng GPS.</small>`)+`<div class="row"><button class="b" id="markmiss" style="font-size:18px">${tr('Mark hole','Mark hole')} ${miss[0]}</button></div>`;
 $('#markmiss').onclick=()=>{hole=miss[0];shot=null;save();render();const line=C().holes?.[hole]?.line;if(map&&line?.length)map.setView(line[line.length-1],18);say(tr(`Hole ${hole}. Tap the photo on the green.`,`Hole ${hole}. I-tap ang photo sa green.`))}}
function cacheGet(k){if(memCache.has(k))return memCache.get(k);try{const s=sessionStorage.getItem('xlc.'+k);if(!s)return null;const v=JSON.parse(s);memCache.set(k,v);return v}catch{return null}}
function cacheSet(k,v){if(memCache.size>40)memCache.delete(memCache.keys().next().value);memCache.set(k,v);try{const s=JSON.stringify(v);if(s.length>180000)return;sessionStorage.setItem('xlc.'+k,s)}catch{}}
function isAbort(e){return !!(e&&e.name==='AbortError')}
function stale(gen){return gen!==opGen}
function linkSignal(userSignal,ms){const c=new AbortController();const timer=setTimeout(()=>c.abort(new DOMException('Timeout','TimeoutError')),ms);
 const onUser=()=>c.abort(new DOMException('Aborted','AbortError'));
 if(userSignal){if(userSignal.aborted)onUser();else userSignal.addEventListener('abort',onUser)}
 c.signal.addEventListener('abort',()=>{clearTimeout(timer);if(userSignal)userSignal.removeEventListener('abort',onUser)},{once:true});
 return c.signal}
function beginUserOp(){opGen++;if(inflight){try{inflight.abort()}catch{}}if(autoCtl){try{autoCtl.abort()}catch{}autoCtl=null}inflight=new AbortController();resultsLocked=true;return {gen:opGen,signal:inflight.signal}}
function endLoad(token){if(token===loadToken)loadingCourse=false}
function cancelPicker(){opGen++;if(inflight){try{inflight.abort()}catch{}inflight=null}if(autoCtl){try{autoCtl.abort()}catch{}autoCtl=null}resultsLocked=false;pendingLoad=null;loadingCourse=false;const box=$('#cresults');if(box)box.innerHTML='';status(tr('Cancelled.','Kinansela.'))}
function cancelBtn(){return '<button type="button" class="b b2" id="pcancel" style="display:block;width:100%;margin-top:8px;min-height:52px;font-size:18px">'+hx(tr('Cancel','Kanselahin'))+'</button>'}
async function overpass(q,signal){const key='op:'+q;const cached=cacheGet(key);if(cached)return cached;
 const servers=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];let last=new Error('Overpass failed');
 for(const url of servers){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q),signal:linkSignal(signal,26000)});
  if(!r.ok){last=new Error('HTTP '+r.status);if(r.status===429||r.status>=500)continue;throw last}
  const data=await r.json();if(data.remark&&/timeout|runtime error/i.test(String(data.remark))&&!(data.elements&&data.elements.length)){last=new Error(String(data.remark));continue}
  cacheSet(key,data);return data}catch(e){if(isAbort(e))throw e;last=e}}
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
const NEAR_M=300;
function normName(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\b(the|golf|club|course|links|country|cc|gc)\b/g,' ').replace(/\s+/g,' ').trim()}
function facilityId(osmId){return String(osmId||'').split('#')[0]}
function hitPoint(h){return h&&Number.isFinite(+h.lat)&&Number.isFinite(+h.lon)?[+h.lat,+h.lon]:null}
function hitsNear(a,b){const pa=hitPoint(a),pb=hitPoint(b);
 if(pa&&b&&b.outers&&b.outers.length&&window.XLMap&&XLMap.pointInCourse(pa,b.outers,b.inners||[]))return true;
 if(pb&&a&&a.outers&&a.outers.length&&window.XLMap&&XLMap.pointInCourse(pb,a.outers,a.inners||[]))return true;
 if(!pa||!pb)return false;const d=dist(pa,pb);if(d<=NEAR_M)return true;return d<=800&&a.type&&b.type&&a.type!==b.type}
function savedForHit(h){const fid=facilityId(h&&h.osmId),nn=normName(h&&h.name);
 for(const [name,c] of Object.entries(courses)){if(!c||typeof c!=='object')continue;const cid=facilityId(c.osmId||'');
  if(fid&&cid&&(cid===fid||cid.startsWith(fid+'#')||fid.startsWith(cid+'#')))return name;
  const cn=normName(c.name||name);if(!nn||cn!==nn)continue;const g=c.greens&&Object.values(c.greens).find(x=>Array.isArray(x)&&x.length>=2&&Number.isFinite(+x[0]));
  if(!g)return name;const p=hitPoint(h);if(!p||dist(p,[+g[0],+g[1]])<=NEAR_M)return name}return ''}
function hitRank(h){return (h.type==='relation'?4:h.type==='way'?2:1)+(h.outers&&h.outers.length?2:0)+((h.score||0)/1000)}
function dedupeHits(hits){const out=[];
 for(const raw of hits||[]){const h={...raw};const fid=facilityId(h.osmId),nn=normName(h.name);
  const prev=out.find(x=>((fid&&facilityId(x.osmId)===fid)||(nn&&normName(x.name)===nn&&hitsNear(x,h))));
  if(prev){if(hitRank(h)>hitRank(prev)){prev.type=h.type;prev.id=h.id;if(h.osmId)prev.osmId=h.osmId;if(h.outers)prev.outers=h.outers;if(h.inners)prev.inners=h.inners;if(Number.isFinite(+h.lat)){prev.lat=+h.lat;prev.lon=+h.lon}prev.localOnly=!!h.localOnly&&!!prev.localOnly}
   if(!prev.city&&h.city)prev.city=h.city;if((h.score||0)>(prev.score||0))prev.score=h.score;if(h.savedAs)prev.savedAs=h.savedAs;continue}
  out.push(h)}
 for(const h of out){const saved=savedForHit(h);if(saved){h.savedAs=saved;if(courses[saved]&&courses[saved].osmId)h.localOnly=false}}
 return out}
function dedupeLayouts(groups){const out=[];
 for(const g of groups||[]){const nn=normName(g.name);const prev=out.find(x=>(g.key&&x.key===g.key)||(nn&&normName(x.name)===nn));
  if(prev){const ids=new Set([...(prev.ids||[]).map(String),...(g.ids||[]).map(String)]);prev.ids=[...ids];if((g.count||0)>(prev.count||0)){prev.count=g.count;prev.nums=g.nums||prev.nums}continue}
  out.push({...g,ids:[...(g.ids||[])]})}
 return out}
function layoutSavedName(hit,g){const id=facilityId(hit&&hit.osmId)+'#'+(g&&g.key||'');const want=normName(((hit&&hit.name)||'')+' '+((g&&g.name)||''));
 for(const [name,c] of Object.entries(courses)){if(!c)continue;const cid=String(c.osmId||'');if(cid===id||cid===id+'#x2')return name;if(want&&normName(c.name||name)===want)return name}return ''}
function savedQueryHits(q){const tokens=nameTokens(q),out=[];
 for(const [name,c] of Object.entries(courses)){if(!c)continue;const label=c.name||name;if(scoreName(label+' '+(c.city||''),tokens)<=0&&scoreName(name,tokens)<=0)continue;
  const g=c.greens&&Object.values(c.greens).find(x=>Array.isArray(x)&&x.length>=2&&Number.isFinite(+x[0]));
  const osm=String(c.osmId||''),parts=osm.split('/');
  out.push({name:label,city:c.city||'',lat:g?+g[0]:NaN,lon:g?+g[1]:NaN,osmId:osm,type:parts[0]||'saved',id:parts[1]||name,savedAs:name,localOnly:!osm,score:scoreName(label,tokens),outers:[],inners:[]})}
 return out}
function rankCourses(els,at,query){const tokens=nameTokens(query),seen=new Set(),hits=[];
 for(const el of els||[]){if(el.type!=='way'&&el.type!=='relation')continue;const key=el.type+'/'+el.id;if(seen.has(key))continue;seen.add(key);
  const tags=el.tags||{};const name=tags.name||tags['name:en']||'Golf course';let lat=el.center&&el.center.lat,lon=el.center&&el.center.lon;
  if(!Number.isFinite(lat)&&el.geometry&&el.geometry.length){lat=el.geometry.reduce((s,p)=>s+p.lat,0)/el.geometry.length;lon=el.geometry.reduce((s,p)=>s+p.lon,0)/el.geometry.length}
  if(!Number.isFinite(lat)&&Number.isFinite(el.lat)){lat=+el.lat;lon=+el.lon}if(!Number.isFinite(lat))continue;
  const rings=ringsOf(el);const km=at?dist(at,[lat,lon])/1000:null;
  hits.push({name,type:el.type,id:+el.id,osmId:key,lat,lon,city:tags['addr:city']||tags['addr:town']||tags['addr:suburb']||'',km,score:scoreName(name,tokens),outers:rings.outers,inners:rings.inners})}
 const rels=hits.filter(h=>h.type==='relation');
 const kept=hits.filter(h=>h.type!=='way'||!rels.some(r=>r.name.toLowerCase()===h.name.toLowerCase()&&dist([h.lat,h.lon],[r.lat,r.lon])<800));
 kept.sort((a,b)=>b.score-a.score||((a.km??99)-(b.km??99)));return dedupeHits(kept).slice(0,12)}
function showCourseHits(hits){searchHits=hits;openCard();try{$('#csearchq').blur()}catch{}resultsLocked=true;
 if(!hits.length){$('#cresults').innerHTML='<div class="card" id="picker" style="margin-bottom:0"><small>'+tr('No mapped golf course for that search. Add a course and mark the greens, or get one from a friend.','Walang nahanap na course. I-add mo, o kunin sa kaibigan.')+'</small>'+cancelBtn()+'</div>';return}
 $('#cresults').innerHTML='<div class="card" id="picker" style="margin-bottom:0">'+hits.map((h,i)=>`<button type="button" class="b b2" data-ci="${i}" style="display:block;width:100%;margin:6px 0;min-height:56px;font-size:18px;text-align:left">${esc(h.name)}${h.city?' · '+esc(h.city):''}${h.km!=null?' · '+h.km.toFixed(1)+' km':''}${h.savedAs?' <span class="badge">'+esc(tr('Saved','Naka-save'))+'</span>':''}</button>`).join('')+'<small>'+tr('Pick one to load holes, greens, tees, and hazards and save them on this phone.','Pili ka isa. Ilo-load ang holes, greens, tees, at hazards, tapos ise-save sa phone.')+'</small>'+cancelBtn()+'</div>'}
function nominatimHit(n){const tags=n.extratags||{},cat=n.class||n.category;const isGolf=tags.leisure==='golf_course'||n.type==='golf_course'||(cat==='leisure'&&n.type==='golf_course');if(!isGolf||(n.osm_type!=='way'&&n.osm_type!=='relation'))return null;
 const city=n.address&&(n.address.city||n.address.town||n.address.village)||'';return {name:n.name||'Golf course',type:n.osm_type,id:+n.osm_id,osmId:n.osm_type+'/'+n.osm_id,lat:+n.lat,lon:+n.lon,city,km:null,score:null,outers:[],inners:[]}}
async function nominatimSearch(q,signal){const key='nom:'+q.toLowerCase();const cached=cacheGet(key);if(cached)return cached;
 const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=5&q='+encodeURIComponent(q),{signal:linkSignal(signal,12000)});
 if(!r.ok)throw new Error('HTTP '+r.status);const places=await r.json();if(!Array.isArray(places))throw new Error('Bad search result');
 if(places.length)cacheSet(key,places);return places}
async function searchCourses(raw){const q=String(raw||'').trim();if(q.length<2)return say(tr('Type a course name, town, or ZIP.','I-type ang pangalan ng course, bayan, o ZIP.'));
 const op=beginUserOp();retryFn=()=>searchCourses(q);
 $('#cresults').innerHTML='<div class="card" id="picker" style="margin-bottom:0"><b>'+hx(tr('Courses','Mga course'))+'</b><div><span class="spin"></span>'+hx(tr('Looking up courses…','Hinahanap ang mga course…'))+'</div>'+cancelBtn()+'</div>';
 openCard();try{$('#csearchq').blur()}catch{}
 status(tr('Looking up courses…','Hinahanap ang mga course…'),{busy:true});
 try{const places=await nominatimSearch(q,op.signal);if(stale(op.gen))return;
  if(!places.length){status(tr('No place matched. Try the town or ZIP, or add the course yourself.','Walang lugar na tumugma. Subukan ang bayan o ZIP, o i-add ang course.'));return}
  const box=boxFromPlace(places[0]);let els=[],opErr=null;
  try{els=(await overpass(golfAreaQuery(box,q),op.signal)).elements||[]}catch(e){if(isAbort(e)||stale(op.gen))throw e;opErr=e;els=[]}
  if(stale(op.gen))return;
  let hits=rankCourses(els,[box.lat,box.lon],q);
  for(const n of places){const h=nominatimHit(n);if(!h||hits.some(x=>x.osmId===h.osmId))continue;h.km=dist([box.lat,box.lon],[h.lat,h.lon])/1000;h.score=scoreName(h.name,nameTokens(q));hits.push(h)}
  hits=dedupeHits(hits.concat(savedQueryHits(q))).filter(h=>h.localOnly||h.type==='way'||h.type==='relation').sort((a,b)=>(b.score||0)-(a.score||0)||((a.km??99)-(b.km??99))).slice(0,12);
  if(!hits.length){if(opErr){status(tr('Could not load the course list. ','Hindi ma-load ang listahan. ')+loadErr(opErr),{retry:true});return}
   showCourseHits([]);status(tr('No mapped golf course. You can mark it yourself or get one from a friend.','Walang mapped na course. I-mark mo, o kunin sa kaibigan.'));return}
  showCourseHits(hits);
  if(opErr)status(tr('Showing matches. The full list failed: ','May mga tugma. Hindi kumpleto ang listahan: ')+loadErr(opErr),{retry:true});
  else say(tr(hits.length+' course'+(hits.length===1?'':'s')+'. Pick one to load it.',hits.length+' course. Pili ka isa para i-load.'))}
 catch(e){if(stale(op.gen)||isAbort(e))return;status(tr('Search failed. ','Hindi nag-search. ')+loadErr(e),{retry:true})}}
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
async function fetchOutline(hit,signal){const key='out:'+hit.osmId;const cached=cacheGet(key);if(cached)return cached;
 try{const q=hit.type==='relation'?`[out:json][timeout:25];relation(${hit.id});out geom;`:`[out:json][timeout:25];way(${hit.id});out geom;`;
  const el=((await overpass(q,signal)).elements||[])[0];const rings=ringsOf(el);if(rings.outers.length){const out={...rings,bbox:bboxOf(rings)};cacheSet(key,out);return out}}catch(e){if(isAbort(e))throw e}
 const url=hit.type==='relation'?`https://api.openstreetmap.org/api/0.6/relation/${hit.id}/full`:`https://api.openstreetmap.org/api/0.6/way/${hit.id}/full`;
 const r=await fetch(url,{signal:linkSignal(signal,20000)});if(!r.ok)throw new Error('HTTP '+r.status);const rings=ringsFromParsed(parseOsm(await r.text()),hit.type,hit.id);
 if(!rings.outers.length)throw new Error('No course outline');const out={...rings,bbox:bboxOf(rings)};cacheSet(key,out);return out}
function padBox(b,pad){return {south:b.south-pad,north:b.north+pad,west:b.west-pad,east:b.east+pad}}
async function fetchGolf(box,signal){const bb=`${box.south},${box.west},${box.north},${box.east}`;
 const q=`[out:json][timeout:25];(way["golf"~"^(hole|green|tee|bunker|water_hazard|lateral_water_hazard)$"](${bb});node["golf"~"^(hole|tee)$"](${bb}););out geom tags;`;
 const key='golf:'+bb;const cached=cacheGet(key);if(cached)return cached;
 try{const els=((await overpass(q,signal)).elements)||[];cacheSet(key,els);return els}catch(e){if(isAbort(e))throw e;const area=(box.north-box.south)*(box.east-box.west);if(area>0.25)throw e;
  const r=await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${box.west},${box.south},${box.east},${box.north}`,{signal:linkSignal(signal,25000)});if(!r.ok)throw new Error('HTTP '+r.status);const els=elementsFromMap(await r.text());cacheSet(key,els);return els}}
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
 const tee=sets[0],holes=tee&&tee.holes;if(!holes||holes.length<9)return;const yards=[],si=[];
 for(let i=0;i<Math.min(18,holes.length);i++){const par=+holes[i].par;if(par>=3&&par<=6)course.pars[i]=par;const y=+holes[i].yardage;yards[i]=y>0?Math.round(y):0;const hv=+(holes[i].handicap??holes[i].handicap_index??holes[i].stroke_index);si[i]=hv>=1&&hv<=18?Math.round(hv):0}
 course.yardages=yards;if(si.some(n=>n>=1))course.si=si;
 const rating=+(tee.course_rating??tee.rating),slope=+(tee.slope_rating??tee.slope);
 if(isFinite(rating)&&rating>=50&&rating<=90)course.rating=Math.round(rating*10)/10;
 if(isFinite(slope)&&slope>=55&&slope<=155)course.slope=Math.round(slope)}
let pendingLoad=null,splitSig='';
function layoutLabel(facility,group,twice){const base=String(facility||'Course').replace(/\s+/g,' ').trim();const tail=group&&group.name?group.name:'';let name=tail?base+' - '+tail:base;if(twice)name+=' ×2';return name.replace(/[<>]/g,'').trim().slice(0,60)||'Course'}
function holeHas(c,h){const g=c&&c.greens&&(c.greens[h]||c.greens[String(h)]);const line=c&&c.holes&&(c.holes[h]||c.holes[String(h)]);return !!(Array.isArray(g)&&g.length>=2)||!!(line&&line.line&&line.line.length>=2)}
function showLayoutPicker(hit,groups){openCard();try{$('#csearchq').blur()}catch{}resultsLocked=true;const nines=groups.filter(g=>g.count>=7&&g.count<=9);
 let html=`<div class="card" id="picker" style="margin-bottom:0"><b>${esc(hit.name)}</b><br><small>${tr('This club has more than one course. Pick one.','Maraming course dito. Pili ka isa.')}</small>`;
 groups.forEach((g,i)=>{const saved=layoutSavedName(hit,g);html+=`<button type="button" class="b b2" data-ly="${i}" style="display:block;width:100%;margin:6px 0;min-height:56px;font-size:18px;text-align:left">${esc(g.name)} · ${g.count} ${tr('holes','holes')}${saved?' <span class="badge">'+esc(tr('Saved','Naka-save'))+'</span>':''}</button>`;if(g.count>=7&&g.count<=9)html+=`<button type="button" class="b" data-twice="${i}" style="display:block;width:100%;margin:0 0 8px;min-height:52px;font-size:18px">${tr('Play 9 twice','9, dalawang beses')}</button>`});
 if(nines.length>=2){const opts=nines.map(g=>`<option value="${esc(g.key)}">${esc(g.name)} · ${g.count}</option>`).join('');html+=`<div class="row"><select id="nineA">${opts}</select><select id="nineB">${opts}</select></div><button type="button" class="b b2" id="pairnines" style="width:100%;font-size:18px">${tr('Play these two nines','Dalawang nine')}</button>`}
 html+=`<small>${tr('Play 9 twice fills holes 10–18 with the same nine. This list stays until you pick or cancel.','Ang Play 9 twice, inuulit ang nine sa holes 10–18. Mananatili ang listahan hanggang pumili ka o mag-cancel.')}</small>`+cancelBtn()+'</div>';
 $('#cresults').innerHTML=html}
function loadedLine(hit,group,label,nh,twice){const nice=group&&group.name?String(hit.name||'').trim()+' '+group.name+(twice?' ×2':''):label;const n=tr(nice+' loaded, '+nh+' hole'+(nh===1?'':'s')+'.',nice+' loaded, '+nh+' holes.');return n}
async function chooseLayout(i,twice){const pend=pendingLoad;if(!pend)return;if(loadingCourse)return status(tr('Still loading…','Lino-load pa…'),{busy:true});const g=pend.groups[i];if(!g)return;retryFn=()=>chooseLayout(i,twice);status(tr('Loading course…','Lino-load ang course…'),{busy:true});await saveBuilt(pend.hit,pend.outline,pend.elements,g,twice)}
async function pairLayouts(){const pend=pendingLoad;if(!pend)return;if(loadingCourse)return status(tr('Still loading…','Lino-load pa…'),{busy:true});const ga=pend.groups.find(g=>g.key===$('#nineA').value),gb=pend.groups.find(g=>g.key===$('#nineB').value);
 if(!ga||!gb||ga.key===gb.key)return say(tr('Pick two different nines.','Pumili ng dalawang magkaibang nine.'));
 const label=layoutLabel(pend.hit.name,{name:ga.name+' + '+gb.name},false),osmId=pend.hit.osmId+'#'+ga.key+'+'+gb.key,name=courseKeyFor({name:label,osmId,city:pend.hit.city||''});
 if(name!==cur&&totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.')))return status(tr('Still on '+cur+'.','Nandito pa sa '+cur+'.'));
 retryFn=()=>pairLayouts();status(tr('Loading course…','Lino-load ang course…'),{busy:true});
 const token=++loadToken;loadingCourse=true;try{const A=XLMap.buildCourse({name:ga.name,osmId:pend.hit.osmId+'#'+ga.key,layout:ga.key,ids:ga.ids,outers:pend.outline.outers,inners:pend.outline.inners,elements:pend.elements});
  const B=XLMap.buildCourse({name:gb.name,osmId:pend.hit.osmId+'#'+gb.key,layout:gb.key,ids:gb.ids,outers:pend.outline.outers,inners:pend.outline.inners,elements:pend.elements});
  const built=XLMap.appendNine(A,B);built.name=label;built.osmId=osmId;courses[name]=built;cur=name;round=newRound();hole=1;save();render();resultsLocked=false;openMap();
  say(tr(label+' loaded, 18 holes.',label+' loaded, 18 holes.'))}
 catch(e){status(tr('Could not load that course. ','Hindi ma-load ang course. ')+loadErr(e),{retry:true})}finally{endLoad(token)}}
async function saveBuilt(hit,outline,elements,group,twice){const label=layoutLabel(hit.name,group,twice),osmId=hit.osmId+(group&&group.key?'#'+group.key:'')+(twice?'#x2':''),name=courseKeyFor({name:label,osmId,city:hit.city||''}),switching=name!==cur;
 if(switching&&totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.')))return status(tr('Still on '+cur+'.','Nandito pa sa '+cur+'.'));
 const token=++loadToken;loadingCourse=true;try{let built=XLMap.buildCourse({name:label,osmId,layout:group&&group.key,ids:group&&group.ids,outers:outline.outers,inners:outline.inners,elements});
  if(twice)built=XLMap.replayNine(built);built.name=label;built.osmId=osmId;if(!twice&&!(group&&group.key)){try{await maybeGolfApi(built)}catch{}}
  courses[name]=built;if(switching){cur=name;round=newRound();hole=1}save();render();resultsLocked=false;openMap();const miss=missingHoles();
  const nh=Object.keys(built.holes||{}).length;
  const again=twice?tr(' Holes 10 to 18 are the same nine again.',' 10 hanggang 18, ulit ang nine.'):'';
  const missTxt=miss.length?tr(' '+miss.length+' still need a green.',' Kulang ang green sa hole '+miss[0]+'.'):'';
  say(loadedLine(hit,group,label,nh,twice)+missTxt+again)}
 catch(e){status(tr('Could not load '+(group&&group.name?group.name:label)+'. ','Hindi ma-load si '+(group&&group.name?group.name:label)+'. ')+loadErr(e),{retry:true})}finally{endLoad(token)}}
async function loadCourse(hit,opts){const auto=!!(opts&&opts.auto);if(!hit)return;if(auto&&(resultsLocked||(opts.gen!=null&&stale(opts.gen))))return;if(hit.type!=='way'&&hit.type!=='relation')return say(tr('That course has no outline to load.','Walang outline ang course na iyan.'));
 let gen,signal;if(auto){gen=opts.gen!=null?opts.gen:opGen;signal=autoCtl&&autoCtl.signal}
 else{const op=beginUserOp();gen=op.gen;signal=op.signal;retryFn=()=>loadCourse(hit,{auto:false});
  $('#cresults').innerHTML='<div class="card" id="picker" style="margin-bottom:0"><b>'+hx(hit.name)+'</b><div><span class="spin"></span>'+hx(tr('Loading course…','Lino-load ang course…'))+'</div>'+cancelBtn()+'</div>';
  openCard();try{$('#csearchq').blur()}catch{}status(tr('Loading course…','Lino-load ang course…'),{busy:true})}
 const token=++loadToken;loadingCourse=true;try{const outline=await fetchOutline(hit,signal);if(stale(gen)||(auto&&resultsLocked))return;const elements=await fetchGolf(padBox(outline.bbox,0.002),signal);if(stale(gen)||(auto&&resultsLocked))return;
  const choices=dedupeLayouts((XLMap.layouts({elements,outers:outline.outers,inners:outline.inners})||[]).filter(g=>g&&g.name&&g.count>=1));
  if(choices.length>1){pendingLoad={hit,outline,elements,groups:choices};if(auto)return;showLayoutPicker(hit,choices);
   say(tr(hit.name+'. '+choices.map(g=>g.name+' '+g.count).join(', ')+'. Pick one.',hit.name+'. '+choices.map(g=>g.name+' '+g.count).join(', ')+'. Pili ka isa.'));return}
  if(auto&&resultsLocked)return;await saveBuilt(hit,outline,elements,choices[0]||null,false)}
 catch(e){if(stale(gen)||isAbort(e)||auto)return;status(tr('Could not load '+hit.name+'. ','Hindi ma-load si '+hit.name+'. ')+loadErr(e),{retry:true})}
 finally{endLoad(token)}}
async function findNearby(auto){if(auto&&(navigator.webdriver||resultsLocked))return;if(!pos){if(!auto)say(tr('Waiting for GPS. Search by name works from home.','Hintayin ang GPS. Pwede ring mag-search ng course sa bahay.'));return}
 let gen,signal;if(auto){if(autoCtl){try{autoCtl.abort()}catch{}}autoCtl=new AbortController();signal=autoCtl.signal;gen=opGen}
 else{const op=beginUserOp();gen=op.gen;signal=op.signal;retryFn=()=>findNearby(false);
  $('#cresults').innerHTML='<div class="card" id="picker" style="margin-bottom:0"><b>'+hx(tr('Courses near you','Mga course malapit'))+'</b><div><span class="spin"></span>'+hx(tr('Looking for a course near you…','Hinanap ang course malapit sa iyo…'))+'</div>'+cancelBtn()+'</div>';
  openCard();status(tr('Looking for a course near you…','Hinanap ang course malapit sa iyo…'),{busy:true})}
 try{const around=`around:3000,${pos[0]},${pos[1]}`;
  const qGeom=`[out:json][timeout:25];(way["leisure"="golf_course"](${around});relation["leisure"="golf_course"](${around}););out tags center geom;`;
  let els=[];try{els=((await overpass(qGeom,signal)).elements)||[]}
  catch(e){if(isAbort(e)||stale(gen)||(auto&&resultsLocked))return;try{els=((await overpass(qGeom.replace(' center geom;',' center;'),signal)).elements)||[]}catch(e2){if(isAbort(e2)||stale(gen)||auto)return;status(tr('Could not reach OpenStreetMap. ','Hindi maabot ang OpenStreetMap. ')+loadErr(e2),{retry:true});return}}
  if(stale(gen)||(auto&&resultsLocked))return;
  const hits=rankCourses(els,pos,'');if(!hits.length){if(auto)return;showCourseHits([]);status(tr('No mapped course within 3 km. Search by name, or mark the greens yourself.','Walang course sa loob ng 3 km. Mag-search, o i-mark ang greens.'));return}
  const inside=hits.find(h=>h.outers&&h.outers.length&&XLMap.pointInCourse(pos,h.outers,h.inners||[]));
  if(auto){const id=C().osmId||'';if(inside&&id!==inside.osmId&&!id.startsWith(inside.osmId+'#')&&!resultsLocked)await loadCourse(inside,{auto:true,gen});return}
  if(inside)await loadCourse(inside);else{showCourseHits(hits);say(tr(hits.length+' course'+(hits.length>1?'s':'')+' nearby. Pick one to load it.',hits.length+' course ang malapit. Pili ka isa.'))}}
 catch(e){if(stale(gen)||isAbort(e)||auto)return;status(tr('Could not reach OpenStreetMap. ','Hindi maabot ang OpenStreetMap. ')+loadErr(e),{retry:true})}}
$('#gosearch').onclick=()=>{openCard();$('#csearchq').focus()};
$('#csearchgo').onclick=()=>searchCourses($('#csearchq').value);
$('#csearchq').addEventListener('keydown',e=>{if(e.key==='Enter')searchCourses($('#csearchq').value)});
$('#findgps').onclick=()=>findNearby(false);
let choiceAt=0,choiceBtn=null,touchPick=null,ignorePtrUntil=0,swallowClick=false;
function useSaved(name){if(!courses[name])return;if(name!==cur&&totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.')))return;
 cur=name;round=newRound();hole=1;save();render();if(map)fitGreens();const nh=Object.keys((C().greens)||{}).length;const line=tr(name+' loaded, '+nh+' hole'+(nh===1?'':'s')+'.',name+' loaded, '+nh+' holes.');status(line);say(line)}
function fireChoice(b){if(!b)return;if(b.id==='pcancel'){cancelPicker();return}
 if(b.dataset.ci==null&&b.dataset.ly==null&&b.dataset.twice==null&&b.id!=='pairnines')return;
 const now=Date.now();if(choiceBtn===b&&now-choiceAt<700)return;choiceAt=now;choiceBtn=b;$$('#cresults button.picked').forEach(x=>x.classList.remove('picked'));b.classList.add('picked');b.setAttribute('aria-busy','true');
 if(b.dataset.ci!=null){const hit=searchHits[+b.dataset.ci];if(hit&&hit.localOnly&&hit.savedAs)return useSaved(hit.savedAs);loadCourse(hit)}
 else if(b.dataset.ly!=null)chooseLayout(+b.dataset.ly,false);
 else if(b.dataset.twice!=null)chooseLayout(+b.dataset.twice,true);
 else if(b.id==='pairnines')pairLayouts()}
const resultsEl=$('#cresults');
if(resultsEl){resultsEl.addEventListener('touchstart',e=>{const b=e.target.closest&&e.target.closest('button');if(!b)return;b.classList.add('pressed');const t=e.changedTouches&&e.changedTouches[0];touchPick=t?{x:t.clientX,y:t.clientY,b}:null},{passive:true});
 resultsEl.addEventListener('touchend',e=>{const b=e.target.closest&&e.target.closest('button');$$('#cresults button.pressed').forEach(x=>x.classList.remove('pressed'));if(!b||!touchPick||touchPick.b!==b)return;const t=e.changedTouches&&e.changedTouches[0];if(!t||Math.hypot(t.clientX-touchPick.x,t.clientY-touchPick.y)>16)return;swallowClick=true;ignorePtrUntil=Date.now()+700;fireChoice(b)},{passive:true});
 resultsEl.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button');if(b)fireChoice(b)})}
function eatGhost(e){if(!swallowClick||Date.now()>ignorePtrUntil){swallowClick=false;return}e.preventDefault();e.stopPropagation();if(e.type==='click')swallowClick=false}
for(const type of ['mousedown','mouseup','click'])document.addEventListener(type,eatGhost,true);
document.addEventListener('pointerdown',e=>{const b=e.target.closest&&e.target.closest('button');if(b)b.classList.add('pressed')},{passive:true});
document.addEventListener('pointerup',()=>$$('button.pressed').forEach(b=>b.classList.remove('pressed')),{passive:true});
document.addEventListener('pointercancel',()=>$$('button.pressed').forEach(b=>b.classList.remove('pressed')),{passive:true});
function showSplit(){const box=$('#splitbox');if(!box)return;const c=C(),have=[];for(let h=1;h<=18;h++)if(holeHas(c,h))have.push(h);
 if(have.length<2){box.style.display='none';return}box.style.display='block';
 const nine=have.every(h=>h<=9)&&have.filter(h=>h<=9).length>=7;const b=$('#replay9');if(b)b.style.display=nine?'':'none';
 const sig=cur+'|'+have.join(',');if(sig===splitSig)return;splitSig=sig;
 $('#splitholes').innerHTML=have.map(h=>`<label style="display:inline-block;margin:4px 10px 4px 0"><input type="checkbox" value="${h}" style="width:auto"> ${h}</label>`).join('');
 $('#splithint').textContent=tr('OSM sometimes maps a whole club as one course. Check the holes that belong together, name that course, and save it. Share course sends the saved course to a friend.','Minsan isang course lang ang OSM sa buong club. I-check ang holes na magkasama, pangalanan, tapos i-save. Pwedeng i-share sa kaibigan.')}
$('#splitopen').onclick=()=>{const f=$('#splitform');f.style.display=f.style.display==='none'?'block':'none'};
$('#replay9').onclick=()=>{const built=XLMap.replayNine(C());const label=(cur+' ×2').slice(0,60),osmId=(C().osmId||cur)+'#x2';built.name=label;built.osmId=osmId;const name=courseKeyFor({name:label,osmId,city:''});
 if(name!==cur&&totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.')))return;
 courses[name]=built;cur=name;round=newRound();hole=1;splitSig='';save();render();openMap();say(tr(name+'. Holes 10 to 18 are the same nine again.',name+'. 10 hanggang 18, ulit ang nine.'))};
$('#splitsave').onclick=()=>{const label=$('#splitname').value.trim();const nums=[...$$('#splitholes input:checked')].map(x=>+x.value);
 if(!label||!nums.length)return say(tr('Name the course and check its holes.','Pangalanan ang course at i-check ang holes.'));
 const built=XLMap.takeHoles(C(),nums);const osmId=(C().osmId||cur)+'#split:'+label.toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,24);built.name=label;built.osmId=osmId;built.source='split';
 const name=courseKeyFor({name:label,osmId,city:''});
 if(name!==cur&&totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.')))return;
 courses[name]=built;cur=name;round=newRound();hole=1;$('#splitname').value='';splitSig='';save();render();openMap();
 const nh=Object.keys(built.holes||{}).length,ng=Object.keys(built.greens||{}).length;
 say(tr(name+' saved. '+nh+' holes, '+ng+' greens. Share course sends it to a friend.',name+' saved. '+nh+' holes, '+ng+' greens. I-share ang course sa kaibigan.'))};
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
 const packed={v:1,name:String(name||'Course').replace(/[<>]/g,'').trim().slice(0,40)||'Course',pars,greens,shapes};
 const rating=+c?.rating,slope=+c?.slope;
 if(isFinite(rating)&&rating>=50&&rating<=90)packed.rating=Math.round(rating*10)/10;
 if(isFinite(slope)&&slope>=55&&slope<=155)packed.slope=Math.round(slope);
 if(Array.isArray(c?.si)&&c.si.some(n=>+n>=1&&+n<=18))packed.si=c.si.slice(0,18).map(n=>{const v=Math.round(+n);return v>=1&&v<=18?v:0});
 return packed}
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
  if(isFinite(+data.rating))dest.rating=+data.rating;if(isFinite(+data.slope))dest.slope=+data.slope;if(Array.isArray(data.si))dest.si=data.si.slice(0,18).map(Number);
  dest.shapes=data.shapes.map(s=>({hole:s.hole,kind:s.kind,pts:s.pts.map(p=>[p[0],p[1]])}));
  delete dest.tees;delete dest.holes;delete dest.hazards;delete dest.outline;delete dest.source;delete dest.osmId;delete dest.yardages;delete dest.loadedAt;
  if(switching){cur=name;round=newRound();hole=1}
  save();render();if(map)fitGreens();say(tr(`${name}. ${Object.keys(data.greens).length} greens set.`,`${name}. ${Object.keys(data.greens).length} green ang naka-set.`));
 }else{
  const c=C();let added=0;
  for(const[h,g]of Object.entries(data.greens))if(!hasGreen(c,h)){c.greens[h]=[g[0],g[1]];added++}
  const have=new Set((c.shapes||[]).map(s=>+s.hole));c.shapes=[...(c.shapes||[])];
  for(const s of data.shapes)if(!have.has(+s.hole))c.shapes.push({hole:s.hole,kind:s.kind,pts:s.pts.map(p=>[p[0],p[1]])});
  save();render();if(map)fitGreens();say(tr(`Merged into ${cur}. Added ${added} green${added===1?'':'s'}.`,`Na-merge sa ${cur}. Nadagdag ang ${added} green.`));
 }
 pendingCourse=null;
}
async function shareCourse(){
 const data=packCourse(C(),cur);const code=courseCode();let cache;try{cache=await encodeCache(data)}catch{return say(tr('Could not package this course.','Hindi ma-package ang course.'))}
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
 say(tr((copied?'Link copied. ':'Share link is ready. ')+'Code '+(code.split('').join(' '))+'.'+(ntfyOk?'':' The live copy could not be published, but the link still has the course.'), (copied?'Na-copy ang link. ':'Handa na ang share link. ')+'Code '+(code.split('').join(' '))+'.'+(ntfyOk?'':' Hindi na-publish ang live copy, pero nasa link pa rin ang course.')));
}
async function previewCourse(raw){
 const ref=parseShareInput(raw);if(!ref.code||ref.code.length<4)return say(tr('Paste a course code or a share link.','I-paste ang code o ang share link.'));
 openCard();$('#getbox').style.display='block';$('#coursein').value=String(raw||'').trim();$('#cprev').innerHTML='<small>Looking up '+esc(ref.code)+'…</small>';
 if(ref.cache){try{const data=await courseFromCache(ref.cache);if(data){showCoursePreview(data,'link');say(tr(`${data.name}. Greens set on ${Object.keys(data.greens).length} hole${Object.keys(data.greens).length===1?'':'s'}. Merge or replace.`,`${data.name}. May green sa ${Object.keys(data.greens).length} hole. Merge o replace.`));return}}catch{}}
 try{const remote=await fetchCourseNtfy(ref.code);if(!remote){$('#cprev').innerHTML='<small>'+tr('No course found for '+esc(ref.code)+'. ntfy.sh keeps it about 12 hours. Use the full link if you have it.','Walang course para sa '+esc(ref.code)+'. Mga 12 oras lang sa ntfy.sh. Gamitin ang buong link.')+'</small>';return say(tr('No course found for that code.','Walang course sa code na iyan.'))}showCoursePreview(remote,'ntfy');say(tr(`${remote.name}. Greens set on ${Object.keys(remote.greens).length} hole${Object.keys(remote.greens).length===1?'':'s'}. Merge or replace.`,`${remote.name}. May green sa ${Object.keys(remote.greens).length} hole. Merge o replace.`))}
 catch(e){$('#cprev').innerHTML='<small>'+tr('Could not load '+esc(ref.code)+'. '+(e.message||'offline'),'Hindi ma-load si '+esc(ref.code)+'. '+(e.message||'offline'))+'</small>';say(tr('Could not load that course.','Hindi ma-load ang course.'))}
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
 $('#neartxt').textContent=tr(`You're near ${best}. Closest green is ${yds(bd)} ${unit()} away. Switch to it?`,`Malapit ka sa ${best}. ${yds(bd)} ${unitTl()} ang pinakamalapit na green. Lipat tayo?`);
 if(nearSaid!==best){nearSaid=best;say(tr(`You're near ${best}. Switch to it?`,`Malapit ka sa ${best}. Lipat tayo?`))}
}
$('#nearyes').onclick=()=>{
 if(!nearName||!courses[nearName])return;
 if(totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.'))){nearSkip.add(nearName);considerNearby();return}
 cur=nearName;round=newRound();hole=1;save();render();if(map)fitGreens();say(tr(`Switched to ${cur}.`,`Lipat na tayo sa ${cur}.`));considerNearby()};
$('#nearno').onclick=()=>{if(nearName)nearSkip.add(nearName);considerNearby()};
// ---------- tournament ----------
const myId=L('id',null)||(()=>{const i=Math.random().toString(36).slice(2,12);P('id',i);return i})();
// Tournaments run over ntfy.sh (free, no login). Topic = xlooper-<code>. Events are JSON in the message body.
// ntfy.sh keeps messages ~12h, so the leaderboard/chat is rebuilt from that window on every (re)connect.
const NTFY='https://ntfy.sh/';
function topicFor(code,practice){return ((practice!=null?practice:!!(tour&&tour.practice))?'xlooper-practice-':'xlooper-')+String(code||'').toLowerCase()}
const pub=(code,ev,as,practice)=>fetch(NTFY+topicFor(code,practice!=null?!!practice:!!(tour&&tour.practice)),{method:'POST',body:JSON.stringify({...ev,id:as||myId,ts:Date.now()})}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
let es,seen=new Set();
let virtKey='';
function todayKey(d){const x=d||new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function addDaysKey(n){const x=new Date();x.setHours(12,0,0,0);x.setDate(x.getDate()+n);return todayKey(x)}
function coursePar(pars){const p=Array.isArray(pars)?pars:[];let s=0,n=0;for(let i=0;i<18;i++){const v=+p[i];if(v>=3&&v<=6){s+=v;n++}else s+=4}return n?s:72}
function playingHandicap(index,slope,rating,par,allowance,maxIndex){
 let idx=+index;if(!isFinite(idx))return null;
 if(maxIndex!=null&&maxIndex!==''&&isFinite(+maxIndex))idx=Math.min(idx,+maxIndex);
 const allow=isFinite(+allowance)?+allowance:100;
 const sl=slope==null||slope===''?NaN:+slope,rt=rating==null||rating===''?NaN:+rating;
 const has=isFinite(sl)&&sl>0&&isFinite(rt);
 if(!has)return {course:idx,playing:Math.round(idx*allow/100),approx:true};
 const ch=Math.round(idx*(sl/113)+(rt-(isFinite(+par)?+par:72)));
 return {course:ch,playing:Math.round(ch*allow/100),approx:false};
}
function strokeIndex(si,hole){const v=si&&(+si[hole-1]||+si[String(hole)]);return v>=1&&v<=18?v:hole}
function strokesOn(playing,hole,si){
 const h=Math.round(+playing||0),idx=strokeIndex(si,hole);
 if(h>=0){const extra=h%18;return Math.floor(h/18)+(idx<=extra?1:0)}
 const give=-h,extra=give%18,easiest=19-idx;return -(Math.floor(give/18)+(easiest<=extra?1:0));
}
function stablefordPoints(netToPar){const p=2-(+netToPar||0);return p<0?0:p>5?5:p}
function playerRow(p,format,allowance,maxIndex,fallbackPars){
 const pars=(Array.isArray(p.pars)&&p.pars.length)?p.pars:(fallbackPars||Array(18).fill(4));
 const hcp=playingHandicap(p.index,p.slope,p.rating,coursePar(pars),allowance,maxIndex);
 const hs=Object.entries(p.scores||{}).filter(([,v])=>+v>0);
 let gross=0,grossToPar=0,strokes=0,points=0;
 for(const[h,v]of hs){const hn=+h,sc=+v,pr=+pars[hn-1]||4,gtp=sc-pr,st=hcp?strokesOn(hcp.playing,hn,p.si):0;
  gross+=sc;grossToPar+=gtp;strokes+=st;points+=stablefordPoints(gtp-st)}
 return {n:p.name||'',course:p.course||'',thru:hs.length,gross,grossToPar,net:gross-strokes,netToPar:grossToPar-strokes,points,playing:hcp&&hcp.playing,attested:!!p.attestedBy,approx:!!(hcp&&hcp.approx)};
}
function sortRows(rows,format){const key=format==='stableford'?(a,b)=>b.points-a.points:format==='gross'?(a,b)=>a.grossToPar-b.grossToPar:(a,b)=>a.netToPar-b.netToPar;
 return rows.sort((a,b)=>(b.thru>0)-(a.thru>0)||key(a,b)||b.thru-a.thru||String(a.n).localeCompare(String(b.n)))}
function virtualFields(src){const o={virtual:true,format:src.format==='gross'||src.format==='stableford'?src.format:'net',start:src.start||todayKey(),end:src.end||addDaysKey(6),allowance:isFinite(+src.allowance)?+src.allowance:100};
 if(src.maxIndex!=null&&src.maxIndex!==''&&isFinite(+src.maxIndex))o.maxIndex=+src.maxIndex;return o}
function copyPlayerMeta(p,ev){
 if(ev.course)p.course=String(ev.course).slice(0,60);
 if(Array.isArray(ev.pars))p.pars=ev.pars.slice(0,18).map(n=>+n||4);
 if(ev.rating!=null&&ev.rating!==''&&isFinite(+ev.rating))p.rating=+ev.rating;
 if(ev.slope!=null&&ev.slope!==''&&isFinite(+ev.slope))p.slope=+ev.slope;
 if(ev.index!=null&&ev.index!==''&&isFinite(+ev.index))p.index=+ev.index;
 if(Array.isArray(ev.si))p.si=ev.si.slice(0,18).map(n=>+n||0);
}
function apply(ev){if(!tstate)return;const n=String(ev.name||ev.from||'').slice(0,24);
 if(ev.t==='info'){tstate.name=String(ev.title||'xLooper Cup').slice(0,40);
  if(ev.virtual)tstate.virtual=true;if(ev.format)tstate.format=ev.format;if(ev.start)tstate.start=String(ev.start).slice(0,10);if(ev.end)tstate.end=String(ev.end).slice(0,10);
  if(ev.allowance!=null&&ev.allowance!==''&&isFinite(+ev.allowance))tstate.allowance=+ev.allowance;
  if(ev.maxIndex!=null&&ev.maxIndex!==''&&isFinite(+ev.maxIndex))tstate.maxIndex=+ev.maxIndex;
  if(tour){if(ev.virtual)tour.virtual=true;if(ev.format)tour.format=ev.format;if(ev.start)tour.start=String(ev.start).slice(0,10);if(ev.end)tour.end=String(ev.end).slice(0,10);
   if(ev.allowance!=null&&ev.allowance!==''&&isFinite(+ev.allowance))tour.allowance=+ev.allowance;
   if(ev.maxIndex!=null&&ev.maxIndex!==''&&isFinite(+ev.maxIndex))tour.maxIndex=+ev.maxIndex;if(ev.virtual)tstate.virtual=true}
  if(Array.isArray(ev.pars)&&!tstate.parsSet){tstate.pars=ev.pars.slice(0,18).map(n=>+n||4);tstate.parsSet=1;if(tour&&!tour.pars){tour.pars=tstate.pars.slice();if(!tstate.virtual&&!tour.virtual){C().pars=tstate.pars.slice();save();render()}else save()}}}
 else if(ev.t==='join'&&ev.id){const p=tstate.players[ev.id]=tstate.players[ev.id]||{name:n,scores:{}};if(n)p.name=n;copyPlayerMeta(p,ev)}
 else if((ev.t==='score'||ev.t==='player')&&ev.id){const p=tstate.players[ev.id]=tstate.players[ev.id]||{name:n,scores:{}};if(n)p.name=n;copyPlayerMeta(p,ev);
  if(ev.t==='score'){const h=+ev.hole;if(h>=1&&h<=18){if(+ev.strokes)p.scores[h]=Math.min(15,+ev.strokes);else delete p.scores[h]}}}
 else if(ev.t==='attest'&&ev.playerId){if(ev.id&&ev.id===ev.playerId)return;const p=tstate.players[ev.playerId];if(!p)return;p.attestedBy=String(ev.by||ev.name||'partner').slice(0,24)}
 else if(ev.t==='msg'&&ev.text){msgs.push({from:n||'?',text:String(ev.text).slice(0,280),ts:ev.ts||Date.now(),ann:!!ev.ann});msgs=msgs.slice(-200);return 'msg'}}
function connect(){if(!tour)return;$('#tjoin').style.display='none';$('#tin').style.display='block';$('#tcd').textContent=tour.code;es?.close();
 tstate={name:tour.title||'Tournament',pars:(tour.pars||C().pars).slice(),players:{},parsSet:!!tour.pars,virtual:!!tour.virtual,format:tour.format||'net',start:tour.start||'',end:tour.end||'',allowance:tour.allowance!=null?+tour.allowance:100,maxIndex:tour.maxIndex!=null&&tour.maxIndex!==''?+tour.maxIndex:null};msgs=[];seen=new Set();let live=false;
 $('#ttitle').textContent=tstate.name;$('#tstat').textContent='Connecting…';paintVirtual();
 es=new EventSource(NTFY+topicFor(tour.code,!!tour.practice)+'/sse?since=all');
 es.addEventListener('open',()=>{live=true;$('#tstat').textContent='Live ✓ (ntfy.sh · ~12h history)'});
 es.onmessage=e=>{let d,ev;try{d=JSON.parse(e.data);if(d.event!=='message'||seen.has(d.id))return;seen.add(d.id);ev=JSON.parse(d.message)}catch{return}
  const k=apply(ev);$('#ttitle').textContent=tstate.name;paintVirtual();drawLB();drawMsgs();if(k==='msg'&&live&&opts.autoread&&ev.id!==myId&&Date.now()-(ev.ts||0)<6e4)readMsgs(false)};
 es.onerror=()=>$('#tstat').textContent='Reconnecting… (scores still save locally)'}
function drawLB(){if(!tstate)return;
 if(!tstate.virtual){const pars=tstate.pars,rows=Object.values(tstate.players).map(p=>{const hs=Object.entries(p.scores);const s=hs.reduce((a,[,v])=>a+v,0),pr=hs.reduce((a,[h])=>a+(pars[h-1]||4),0);return{n:p.name,s,rel:s-pr,thru:hs.length}}).sort((a,b)=>(b.thru>0)-(a.thru>0)||a.rel-b.rel||b.thru-a.thru);
  $('#lb').innerHTML='<tr><th>#</th><th>Player</th><th>+/-</th><th>Thru</th><th>Tot</th></tr>'+rows.map((r,i)=>`<tr><td>${i+1}</td><td style="text-align:left">${esc(r.n)}</td><td><b>${r.thru?relS(r.rel):'-'}</b></td><td>${r.thru}</td><td>${r.s||''}</td></tr>`).join('');return}
 const fmt=tstate.format==='gross'||tstate.format==='stableford'?tstate.format:'net';
 const rows=sortRows(Object.values(tstate.players).map(p=>playerRow(p,fmt,tstate.allowance,tstate.maxIndex,tstate.pars)),fmt);
 const mark=r=>r.attested?' ✓':'';
 let head,cell;
 if(fmt==='stableford'){head='<tr><th>#</th><th>Player</th><th>Course</th><th>Pts</th><th>Thru</th></tr>';cell=r=>`<td><b>${r.thru?r.points:''}</b></td><td>${r.thru}</td>`}
 else if(fmt==='gross'){head='<tr><th>#</th><th>Player</th><th>Course</th><th>+/-</th><th>Thru</th><th>Tot</th></tr>';cell=r=>`<td><b>${r.thru?relS(r.grossToPar):'-'}</b></td><td>${r.thru}</td><td>${r.gross||''}</td>`}
 else{head='<tr><th>#</th><th>Player</th><th>Course</th><th>Net</th><th>Thru</th><th>Tot</th></tr>';cell=r=>`<td><b>${r.thru?relS(r.netToPar):'-'}</b></td><td>${r.thru}</td><td>${r.net||''}</td>`}
 $('#lb').innerHTML=head+rows.map((r,i)=>`<tr><td>${i+1}</td><td style="text-align:left">${esc(r.n)}${mark(r)}</td><td style="text-align:left">${esc(r.course||'')}</td>${cell(r)}</tr>`).join('');
 drawAttest()}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function drawMsgs(){$('#msgs').innerHTML=msgs.map(m=>`<div class="msg ${m.ann?'ann':''}"><b>${m.ann?'📢 ':''}${esc(m.from)}</b> <small>${new Date(m.ts).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small><br>${esc(m.text)}</div>`).join('');$('#msgs').scrollTop=1e9}
function readMsgs(all){if(!tour)return say(tr('Join a tournament on the Tourney tab first.','Sumali muna sa tournament sa Tourney tab.'));const nw=msgs.filter(m=>m.ts>lastHeard&&m.from!==tour.name);const list=nw.length?nw:(all?msgs.slice(-3):[]);
 if(!list.length)return say(tr('No new messages.','Walang bagong message.'));lastHeard=Math.max(...msgs.map(m=>m.ts));P('heard',lastHeard);
 const body=list.map(m=>`${m.ann?tr('Announcement from','Announcement ni'):''} ${m.from} ${tr('says','says')}: ${m.text}.`).join(' ');
 say(tr((nw.length?`${nw.length} new message${nw.length>1?'s':''}. `:'Last messages. '),'')+(taglish()?(nw.length?`${nw.length} bagong message. `:'Huling messages. '):'')+body)}
async function sendMsg(text,ann){if(!tour)return say(tr('Join a tournament first.','Sumali muna sa tournament.'));const r=await pub(tour.code,{t:'msg',from:tour.name,text:String(text).slice(0,280),ann:!!(ann||$('#mann').checked)}).catch(e=>({error:e.message||'offline'}));say(r.error?tr('Message failed: ','Hindi na-send: ')+r.error:tr('Sent.','Na-send na.'))}
function voiceMsg(){listen(t=>sendMsg(t),tr('Say your message…','Sabihin ang message…'))}
function canPost(){if(!tour||round.course!==cur)return false;if(tour.practice)return true;if(round.practice||opts.sim)return !!opts.countSim;return true}
function inWindow(){if(!tour||!tour.virtual)return true;const t=todayKey();if(tour.start&&t<tour.start)return false;if(tour.end&&t>tour.end)return false;return true}
function readVirtForm(){const rating=$('#vrating')?$('#vrating').value:'',slope=$('#vslope')?$('#vslope').value:'',index=$('#vindex')?$('#vindex').value:'';
 return {rating:rating===''||!isFinite(+rating)?null:+rating,slope:slope===''||!isFinite(+slope)?null:+slope,index:index===''||!isFinite(+index)?null:+index}}
function currentIndex(){const f=$('#vindex')&&tour&&tour.virtual?readVirtForm().index:null;if(f!=null)return f;if(opts.hcpIndex!=null&&opts.hcpIndex!==''&&isFinite(+opts.hcpIndex))return +opts.hcpIndex;return null}
function myCard(){const c=C(),card={course:cur,pars:(c.pars||[]).slice(0,18).map(n=>+n||4)};
 if(c.rating!=null&&c.rating!==''&&isFinite(+c.rating))card.rating=+c.rating;
 if(c.slope!=null&&c.slope!==''&&isFinite(+c.slope))card.slope=+c.slope;
 if(opts.hcpIndex!=null&&opts.hcpIndex!==''&&isFinite(+opts.hcpIndex))card.index=+opts.hcpIndex;
 if(Array.isArray(c.si)&&c.si.some(n=>+n>=1))card.si=c.si.slice(0,18).map(n=>+n||0);
 return card}
function applyVirtForm(){if(!$('#vrating'))return;const f=readVirtForm(),c=C();
 if(f.rating!=null)c.rating=f.rating;else delete c.rating;if(f.slope!=null)c.slope=f.slope;else delete c.slope;
 if(f.index!=null)opts.hcpIndex=f.index;else delete opts.hcpIndex;virtKey='';save()}
function postScore(h){if(!canPost())return;
 if(tour.virtual){if(!inWindow())return say(tr('Scores count from '+(tour.start||'')+' through '+(tour.end||'')+'.','Sa '+(tour.start||'')+' hanggang '+(tour.end||'')+' lang ang score.'));
  const fmt=tour.format||'net';if((fmt==='net'||fmt==='stableford')&&currentIndex()==null)return say(tr('Enter your handicap index on the Tourney tab.','Ilagay ang handicap index sa Tourney tab.'));
  applyVirtForm();const ev={t:'score',name:tour.name,hole:h,strokes:round.holes[h]?.s||0,...myCard()};if(tstate)apply({...ev,id:myId});drawLB();
  pub(tour.code,ev,myId,!!tour.practice).catch(()=>{});return}
 pub(tour.code,{t:'score',name:tour.name,hole:h,strokes:round.holes[h]?.s||0},myId,!!tour.practice).catch(()=>{})}
function tourCode(){const a=crypto.getRandomValues(new Uint8Array(8)),cs='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...a].map(x=>cs[x%cs.length]).join('')}
async function join(code,name,info,practice){code=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');name=String(name||'').trim().slice(0,24);if(!code||!name)return say(tr('Enter your name and the code.','Ilagay ang pangalan at ang code.'));
 const prac=!!practice;
 const virt=info&&Object.prototype.hasOwnProperty.call(info,'virtual')?!!info.virtual:!!($('#tvirtual')&&$('#tvirtual').checked);
 try{if(info)await pub(code,{t:'info',practice:prac,...info},myId,prac);await pub(code,{t:'join',name},myId,prac)}catch(e){return say(tr('Could not join: ','Hindi maka-join: ')+(e.message||'offline'))}
 if(L('botCode','')!==code){bots=[];P('bots',bots)}
 P('botCode',code);
 tour={code,name,title:info?.title,pars:info?.pars,practice:prac,host:!!info,invites:info?.invites||[],virtual:virt,format:info?.format||'net',start:info?.start||'',end:info?.end||'',allowance:info?.allowance!=null?+info.allowance:100,maxIndex:info&&info.maxIndex!=null&&info.maxIndex!==''?+info.maxIndex:null};save();render();connect();for(let h=1;h<=18;h++)if(round.holes[h]?.s)postScore(h);
 say(tr(`Joined ${prac?'practice ':''}${virt?'online ':''}${info?.title||'tournament '+code}. Good luck, ${name}.`,`Sumali ka sa ${prac?'practice ':''}${virt?'online ':''}${info?.title||'tournament '+code}. Good luck, ${name}.`))}
const BOT_NAMES=['Alex','Blair','Casey','Drew','Eden','Fran','Gray','Harper','Indy','Jules','Kai','Logan'];
function simScore(par){const r=Math.random();const d=r<0.08?-1:r<0.42?0:r<0.78?1:r<0.93?2:3;return Math.max(1,(par||4)+d)}
function inviteNames(){const names=Object.values((tstate&&tstate.players)||{}).map(p=>p.name).filter(Boolean);return [...new Set([...(tour&&tour.invites||[]),...names])]}
function botCard(i){const places=['North Links','South Hills','River Bend','Oak Ridge','Pine Valley','Lake View','Cedar Park','Maple Run'];
 const pars=Array.from({length:18},(_,h)=>[4,5,3,4,4,4,3,5,4][h%9]);
 return {course:places[i%places.length],pars,rating:72,slope:113,index:Math.round((8+i*1.5)*10)/10,si:Array.from({length:18},(_,h)=>((h+i)%18)+1)}}
function addBots(){if(!tour||!tour.practice||!tour.host)return say(tr('Create a practice tournament first.','Gumawa muna ng practice tournament.'));
 const typed=$('#botnames')&&$('#botnames').value.trim();const custom=typed?typed.split(/[,|\n]/).map(s=>s.trim().slice(0,24)).filter(Boolean).slice(0,12):[];
 const n=custom.length||Math.max(1,Math.min(12,+$('#botn').value||1));const used=new Set(bots.map(b=>b.name));const created=[];
 for(let i=0;i<n;i++){const name=custom[i]||BOT_NAMES.find(x=>!used.has(x))||('Player '+(bots.length+1));used.add(name);const id='bot'+Math.random().toString(36).slice(2,10);
  const b={id,name,scores:{}};if(tour.virtual)Object.assign(b,botCard(bots.length));bots.push(b);created.push(b);
  const ev={t:'join',name,id};if(tstate)apply(ev);pub(tour.code,ev,id,true).catch(()=>{});
  if(tour.virtual){const pev={t:'player',name,id,course:b.course,pars:b.pars,rating:b.rating,slope:b.slope,index:b.index,si:b.si};if(tstate)apply(pev);pub(tour.code,pev,id,true).catch(()=>{})}}
 P('bots',bots);drawLB();if($('#botnames'))$('#botnames').value='';say(tr('Added '+created.map(b=>b.name).join(', ')+'.','Nadagdag sina '+created.map(b=>b.name).join(', ')+'.'))}
function advanceBots(all){if(!tour||!tour.practice||!tour.host)return say(tr('Practice controls are for the host.','Sa host ang practice controls.'));if(!bots.length)return say(tr('Add simulated players first. Real players can still join.','Magdagdag muna ng simulated players. Pwede pa ring sumali ang totoong players.'));
 const pars=(tstate&&tstate.pars)||C().pars;const step=()=>{let moved=false;for(const b of bots){const played=Object.keys(b.scores).map(Number);const next=(played.length?Math.max(...played):0)+1;if(next>18)continue;const pr=(tour.virtual&&b.pars)?(b.pars[next-1]||4):(pars[next-1]||4);const s=simScore(pr);b.scores[next]=s;
  const ev={t:'score',name:b.name,hole:next,strokes:s,id:b.id};if(tour.virtual)Object.assign(ev,{course:b.course,pars:b.pars,rating:b.rating,slope:b.slope,index:b.index,si:b.si});if(tstate)apply(ev);pub(tour.code,ev,b.id,true).catch(()=>{});moved=true}return moved};
 if(all){let g=0;while(step()&&g++<18){}}else step();P('bots',bots);drawLB();say(tr(all?'Simulated players finished the round.':'Simulated players advanced one hole.',all?'Tapos na ang simulated players.':'Isang hole ang simulated players.'))}
async function promoteTour(){if(!tour||!tour.host||!tour.practice)return;const invites=inviteNames();const title=tour.title||(tstate&&tstate.name)||'Tournament';const pars=(tour.pars||C().pars).slice();
 const info={t:'info',title,pars,practice:false};if(tour.virtual)Object.assign(info,virtualFields(tour));
 tour.practice=false;tour.title=title;tour.pars=pars;tour.invites=invites;save();
 try{await pub(tour.code,info,myId,false);await pub(tour.code,{t:'join',name:tour.name},myId,false);await pub(tour.code,{t:'msg',from:tour.name,text:'Promoted to a real tournament. Practice scores stayed on the practice board.'+(invites.length?' Invited: '+invites.join(', '):''),ann:true},myId,false)}
 catch(e){tour.practice=true;save();return say(tr('Could not promote: ','Hindi ma-promote: ')+(e.message||'offline'))}
 connect();render();say(tr('Promoted to a real tournament. Same code. Practice scores stayed on the practice board.','Real tournament na. Parehong code. Nasa practice board ang practice scores.'))}
async function freshReal(){if(!tour||!tour.host)return;const invites=inviteNames();const title=tour.title||(tstate&&tstate.name)||(cur+' Cup');const pars=(tour.pars||C().pars).slice();const nm=tour.name;const code=tourCode();
 const info={title,pars,invites};if(tour.virtual)Object.assign(info,virtualFields(tour));
 await join(code,nm,info,false);
 try{if(invites.length)await pub(code,{t:'msg',from:nm,text:'You are invited: '+invites.join(', '),ann:true},myId,false)}catch{}}
function paintHcp(){const out=$('#vhcpout');if(!out||!tour||!tour.virtual)return;const f=readVirtForm();
 if(f.index==null){out.textContent=tr('Enter a handicap index.','Ilagay ang handicap index.');return}
 const h=playingHandicap(f.index,f.slope,f.rating,coursePar(C().pars),tour.allowance,tour.maxIndex);if(!h){out.textContent='';return}
 const note=h.approx?tr(' No rating or slope, so the index is the course handicap.',' Walang rating o slope, kaya ang index ang course handicap.'):'';
 out.textContent=tr('Course handicap '+h.course+' · playing '+h.playing+'.'+note,'Course handicap '+h.course+' · playing '+h.playing+'.'+note)}
function fillVirtInputs(){const c=C();const key=cur+'|'+(c.rating??'')+'|'+(c.slope??'')+'|'+(opts.hcpIndex??'');if(key===virtKey)return;
 const ae=document.activeElement;if(ae&&(ae.id==='vrating'||ae.id==='vslope'||ae.id==='vindex'))return;virtKey=key;
 if($('#vrating'))$('#vrating').value=c.rating!=null&&c.rating!==''?c.rating:'';
 if($('#vslope'))$('#vslope').value=c.slope!=null&&c.slope!==''?c.slope:'';
 if($('#vindex'))$('#vindex').value=opts.hcpIndex!=null&&opts.hcpIndex!==''?opts.hcpIndex:''}
function paintVirtual(){const on=!!(tour&&tour.virtual);const flag=$('#vflag');if(flag)flag.hidden=!on;const box=$('#virtbox');if(box)box.style.display=on?'block':'none';if(!on)return;
 const sel=$('#vcourse');if(sel){const keys=Object.keys(courses),sig=keys.join('\n')+'|'+cur;if(sel.dataset.sig!==sig){sel.innerHTML=keys.map(c=>`<option ${c===cur?'selected':''}>${esc(c)}</option>`).join('');sel.dataset.sig=sig;sel.value=cur}}
 const meta=$('#vmeta');if(meta){const fmt=tour.format==='gross'?'Stroke play, gross':tour.format==='stableford'?'Stableford':'Stroke play, net';const allow=tour.allowance!=null?tour.allowance:100;
  meta.textContent=fmt+' · '+(tour.start||'')+' – '+(tour.end||'')+' · '+allow+'%'+(tour.maxIndex!=null&&tour.maxIndex!==''?' · max '+tour.maxIndex:'')}
 fillVirtInputs();paintHcp()}
function drawAttest(){const el=$('#vattest');if(!el)return;if(!tstate||!tour||!tour.virtual){el.innerHTML='';return}
 const others=Object.entries(tstate.players).filter(([id,p])=>id!==myId&&p.name);
 el.innerHTML=others.map(([id,p])=>`<div class="row" style="align-items:center"><span style="flex:2">${esc(p.name)}${p.course?' · '+esc(p.course):''}${p.attestedBy?' ✓ '+esc(p.attestedBy):''}</span><button type="button" class="b b2" data-attest="${esc(id)}" style="flex:0 0 auto;min-height:44px;font-size:16px;padding:8px 12px">Confirm</button></div>`).join('')||'<small>'+esc(tr('No other cards to attest yet.','Wala pang ibang card.'))+'</small>'}
function saveVirtCourse(){if(!tour||!tour.virtual)return;applyVirtForm();paintHcp();
 const ev={t:'player',name:tour.name,...myCard()};if(tstate)apply({...ev,id:myId});drawLB();
 pub(tour.code,ev,myId,!!tour.practice).catch(()=>{});say(tr('Course handicap saved.','Naka-save ang course handicap.'))}
function askAttest(){if(!tour)return say(tr('Join a tournament first.','Sumali muna sa tournament.'));sendMsg((tour.name||'A player')+' asks a playing partner to attest the card.',true)}
$('#tj').onclick=()=>join($('#tcode').value,$('#tname').value,null,!!($('#tpractice')&&$('#tpractice').checked));
$('#tvirtual').onchange=()=>{const on=$('#tvirtual').checked;const box=$('#tvirtualbox');if(box)box.style.display=on?'block':'none';
 if(on){if($('#tstart')&&!$('#tstart').value)$('#tstart').value=todayKey();if($('#tend')&&!$('#tend').value)$('#tend').value=addDaysKey(6)}};
$('#tc').onclick=()=>{const nm=$('#tname').value.trim();if(!nm)return say(tr('Enter your name first.','Ilagay muna ang pangalan mo.'));
 const virtual=!!($('#tvirtual')&&$('#tvirtual').checked);
 const info={title:($('#tnew').value||cur+' Cup').slice(0,40),pars:C().pars.slice()};
 if(virtual){const start=$('#tstart')?$('#tstart').value:'',end=$('#tend')?$('#tend').value:'';if(start&&end&&end<start)return say(tr('The end date is before the start.','Mas maaga ang wakas kaysa simula.'));
  Object.assign(info,virtualFields({format:$('#tformat')?$('#tformat').value:'net',start:start||todayKey(),end:end||addDaysKey(6),allowance:$('#tallow')?+$('#tallow').value:100,maxIndex:$('#tmax')?$('#tmax').value:''}))}
 join(tourCode(),nm,info,!!($('#tmakePractice')&&$('#tmakePractice').checked))};
$('#addbots').onclick=addBots;$('#adv1').onclick=()=>advanceBots(false);$('#playall').onclick=()=>advanceBots(true);$('#promote').onclick=()=>promoteTour();$('#freshreal').onclick=()=>freshReal();
$('#msend').onclick=()=>{const t=$('#mtxt').value.trim();if(t){sendMsg(t);$('#mtxt').value=''}};$('#mread').onclick=()=>readMsgs(true);$('#mvoice').onclick=voiceMsg;
$('#vsave').onclick=saveVirtCourse;$('#vask').onclick=askAttest;
for(const id of ['vrating','vslope','vindex']){const el=$('#'+id);if(el)el.oninput=paintHcp}
$('#vcourse').onchange=()=>{const next=$('#vcourse').value;if(!next||next===cur||!courses[next])return;
 if(totals().n&&!confirm(tr('Switch course? Current round card stays saved only if you Finish it first.','Lipat ng course? I-finish muna ang card kung gusto mong i-save.'))){$('#vcourse').value=cur;return}
 cur=next;round=newRound();hole=1;virtKey='';save();render();if(map)fitGreens()};
$('#vattest').onclick=e=>{const b=e.target.closest('[data-attest]');if(!b||!tour)return;const playerId=b.getAttribute('data-attest');if(!playerId||playerId===myId)return;
 const ev={t:'attest',playerId,by:tour.name,name:tour.name};if(tstate)apply({...ev,id:myId});drawLB();pub(tour.code,ev,myId,!!tour.practice).catch(()=>{});say(tr('Card attested.','Na-attest na ang card.'))};
$('#leave').onclick=()=>{tour=null;es?.close();save();$('#tjoin').style.display='block';$('#tin').style.display='none';const pb=$('#pracbox');if(pb)pb.style.display='none';const flag=$('#tpracflag');if(flag)flag.hidden=true;const vf=$('#vflag');if(vf)vf.hidden=true;const vb=$('#virtbox');if(vb)vb.style.display='none'};
$('#share').onclick=()=>{if(!tour)return;const u=location.origin+location.pathname+'?t='+tour.code+(tour.practice?'&p=1':'')+(tour.virtual?'&v=1':'');const title=tour.practice?'Join my xLooper practice tournament':tour.virtual?'Join my xLooper online tournament':'Join my xLooper tournament';navigator.share?navigator.share({title,text:(tour.practice?'Practice tournament code ':'Tournament code ')+tour.code,url:u}).catch(()=>{}):(navigator.clipboard.writeText(u),say(tr('Link copied.','Na-copy ang link.')))};
const qparams=new URLSearchParams(location.search);const qt=qparams.get('t');if(qparams.get('p')==='1'){const box=$('#tpractice');if(box)box.checked=true}
if(qparams.get('v')==='1'){const box=$('#tvirtual');if(box)box.checked=true;const vb=$('#tvirtualbox');if(vb)vb.style.display='block';if($('#tstart')&&!$('#tstart').value)$('#tstart').value=todayKey();if($('#tend')&&!$('#tend').value)$('#tend').value=addDaysKey(6)}
if(qt){$('#tcode').value=qt;if(!tour||tour.code!==qt.toUpperCase()){$$('nav button')[3].click();$('#tname').focus()}}
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
 try{await sendXircle(got.body);xstate.signup.sent=true;P('xircle',xstate);$('#xircle').style.display='none';say(tr('You are in xircle.','Nasa xircle ka na.'))}
 catch(e){$('#xi-err').textContent='Saved on this device, but the notice did not send ('+(e.message||'offline')+'). You can retry from Clubs.'}
 xircleStatus()}
async function withdrawXircle(){
 if(!xstate.signup)return;
 if(!confirm('Withdraw from xircle? This removes your signup from this device.'))return;
 const email=xstate.signup.email,name=xstate.signup.name;
 xstate.signup=null;xstate.withdrawn=true;xstate.asks=2;P('xircle',xstate);xircleStatus();
 try{await sendXircle({t:'withdraw',email,name,ts:Date.now()});say(tr('Withdrawn from xircle.','Umalis ka na sa xircle.'))}
 catch{say(tr('Removed on this device. The withdrawal notice did not send.','Tinanggal sa phone na ito. Hindi na-send ang withdrawal.'))}}
async function retryXircle(){
 const s=xstate.signup;if(!s)return;
 const body={t:'signup',name:s.name,email:s.email,consent:true,ts:s.ts||Date.now()};
 if(s.phone)body.phone=s.phone;if(s.zip)body.zip=s.zip;if(s.home)body.home=s.home;
 try{await sendXircle(body);s.sent=true;P('xircle',xstate);say(tr('Signup sent.','Na-send na ang signup.'))}
 catch{say(tr('Still could not send the signup.','Hindi pa rin ma-send ang signup.'))}
 xircleStatus()}
$('#xi-set').onclick=()=>{if(xstate.signup&&!xstate.signup.sent)return retryXircle();if(xstate.signup)return withdrawXircle();openXircle(true)};
$('#xi-join').onclick=()=>submitXircle();
$('#xi-later').onclick=()=>dismissXircle();
$('#xircle').onclick=e=>{if(e.target.id==='xircle')dismissXircle()};
if(opts.sim){const t=teePoint(hole,true);if(t){pos=[t[0],t[1]];acc=3}}
render();connect();
maybeXircle();
function showUpdate(){const el=$('#upd');if(!el)return;el.hidden=false;el.onclick=()=>location.reload()}
if('serviceWorker'in navigator){let sawControl=!!navigator.serviceWorker.controller,readyForUpdate=sawControl;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!sawControl){sawControl=true;setTimeout(()=>{readyForUpdate=true},1500);return}showUpdate()});
 navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='xlooper-update'&&readyForUpdate)showUpdate()});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{reg.update().catch(()=>{})}).catch(()=>{})}
