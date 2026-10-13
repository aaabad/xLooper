// OSM golf course geometry. No DOM. Front/center/back use the approach point
// (the player when they are near the green, otherwise the tee).
(function(root){
const R=6371000, rad=x=>x*Math.PI/180;
function dist(a,b){const dl=rad(b[0]-a[0]),dn=rad(b[1]-a[1]),h=Math.sin(dl/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const r6=n=>Math.round(+n*1e6)/1e6;
function thin(pts,max){pts=(pts||[]).filter(p=>Array.isArray(p)&&p.length>=2&&isFinite(+p[0])&&isFinite(+p[1]));if(pts.length<=max)return pts.map(p=>[r6(p[0]),r6(p[1])]);const step=pts.length/max;return Array.from({length:max},(_,i)=>pts[Math.min(pts.length-1,Math.floor(i*step))]).map(p=>[r6(p[0]),r6(p[1])])}
function centroid(pts){
 const n=pts.length||1;
 const avg=[pts.reduce((s,p)=>s+p[0],0)/n,pts.reduce((s,p)=>s+p[1],0)/n];
 let a=0,cx=0,cy=0;
 for(let i=0,j=pts.length-1;i<pts.length;j=i++){const c=pts[j][0]*pts[i][1]-pts[i][0]*pts[j][1];a+=c;cx+=(pts[j][0]+pts[i][0])*c;cy+=(pts[j][1]+pts[i][1])*c}
 if(Math.abs(a)<1e-12)return avg;
 const c=[cx/(3*a),cy/(3*a)];
 let min0=Infinity,max0=-Infinity,min1=Infinity,max1=-Infinity;
 for(const p of pts){if(p[0]<min0)min0=p[0];if(p[0]>max0)max0=p[0];if(p[1]<min1)min1=p[1];if(p[1]>max1)max1=p[1]}
 const pad0=(max0-min0)+1e-8, pad1=(max1-min1)+1e-8;
 if(c[0]<min0-pad0||c[0]>max0+pad0||c[1]<min1-pad1||c[1]>max1+pad1)return avg;
 return c;
}
function pointInRing(p,ring){
 if(!ring||ring.length<3)return false;
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const yi=ring[i][0],xi=ring[i][1],yj=ring[j][0],xj=ring[j][1];
  if(((yi>p[0])!==(yj>p[0]))&&(p[1]<(xj-xi)*(p[0]-yi)/(yj-yi+0.0)+xi))inside=!inside;
 }
 return inside;
}
function pointInCourse(p,outers,inners){
 if(!outers||!outers.length)return true;
 if(!outers.some(r=>pointInRing(p,r)))return false;
 return !(inners||[]).some(r=>pointInRing(p,r));
}
function segHitsLine(a,b,p,q){
 // Intersection of edge a–b with the ray from the approach p through the green center q.
 const rx=b[0]-a[0],ry=b[1]-a[1],sx=q[0]-p[0],sy=q[1]-p[1];
 const den=rx*sy-ry*sx; if(Math.abs(den)<1e-18)return null;
 const dx=p[0]-a[0],dy=p[1]-a[1];
 const u=(dx*sy-dy*sx)/den; if(u<-1e-6||u>1+1e-6)return null;
 const t=(dx*ry-dy*rx)/den; if(t<0)return null;
 return [a[0]+u*rx,a[1]+u*ry];
}
function frontBack(pts,from){
 const c=centroid(pts);
 const origin=from&&isFinite(from[0])?from:c;
 const hits=[];
 for(let i=0;i<pts.length;i++){const hit=segHitsLine(pts[i],pts[(i+1)%pts.length],origin,c);if(hit)hits.push(hit)}
 if(hits.length>=2){hits.sort((a,b)=>dist(origin,a)-dist(origin,b));return {front:hits[0],center:c,back:hits[hits.length-1]}}
 const dx=c[0]-origin[0],dy=c[1]-origin[1],L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
 let f=pts[0],b=pts[0],fp=Infinity,bp=-Infinity;
 for(const p of pts){const t=(p[0]-origin[0])*ux+(p[1]-origin[1])*uy;if(t<fp){fp=t;f=p}if(t>bp){bp=t;b=p}}
 return {front:f,center:c,back:b};
}
function nearPoint(pt,poly){let m=dist(pt,centroid(poly));for(const p of poly){const d=dist(pt,p);if(d<m)m=d}return m}
function geomOf(el){
 if(el.geometry&&el.geometry.length)return el.geometry.map(p=>[p.lat,p.lon]);
 if(isFinite(el.lat)&&isFinite(el.lon))return [[el.lat,el.lon]];
 return [];
}
function titleCourse(s){s=String(s||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();if(!s)return '';return s.replace(/\b[a-z]/g,c=>c.toUpperCase())}
function parseHoleRef(tags){
 tags=tags||{};
 const raw=String(tags.ref==null?'':tags.ref).trim();
 const tagged=String(tags['golf:course']||tags.course||tags['hole:course']||'').trim();
 let pref='',num=NaN;
 const spaced=raw.match(/^([A-Za-z][A-Za-z .']*?)[\s._-]+(\d{1,2})$/);
 if(spaced){pref=spaced[1];num=+spaced[2]}
 else if(/^\d{1,2}$/.test(raw))num=+raw;
 else{const glued=raw.match(/^([A-Za-z]+)(\d{1,2})$/);if(glued){pref=glued[1];num=+glued[2]}}
 if(!(num>=1&&num<=18))return null;
 const course=titleCourse(tagged||pref);
 return {course,key:course.toLowerCase(),num};
}
function nearAny(p,lines,max){for(const line of lines)for(const q of line)if(dist(p,q)<=max)return true;return false}
function holeRecs(elements,outers,inners){
 const inside=p=>!outers.length||pointInCourse(p,outers,inners)||outers.some(r=>nearPoint(p,r)<60);
 const best=new Map(),loose=[];
 for(const el of elements||[]){
  if((el.tags||{}).golf!=='hole')continue;
  const id=parseHoleRef(el.tags);if(!id)continue;
  const line=geomOf(el);if(line.length<2)continue;
  const end=line[line.length-1],mid=line[Math.floor(line.length/2)];
  if(outers.length&&!inside(end)&&!inside(mid))continue;
  const rec={key:id.key,course:id.course,num:id.num,line,end,endIn:outers.length?pointInCourse(end,outers,inners):true,el};
  if(!id.key){loose.push(rec);continue}
  const k=id.key+'#'+id.num,prev=best.get(k);
  if(!prev||(rec.endIn!==prev.endIn?rec.endIn:line.length>prev.line.length))best.set(k,rec);
 }
 const recs=[...best.values(),...loose];
 for(const el of elements||[]){
  if(el.type!=='relation')continue;
  const tags=el.tags||{};
  if(!(tags.route==='golf'||tags.golf==='course'))continue;
  const name=titleCourse(tags.name||'');if(!name)continue;
  const ids=new Set((el.members||[]).map(m=>+m.ref));
  for(const r of recs)if(!r.key&&ids.has(+r.el.id)){r.key=name.toLowerCase();r.course=name}
 }
 return recs;
}
function clusterByRef(recs){
 if(recs.length<2)return recs.length?[recs]:[];
 const counts={};for(const r of recs)counts[r.num]=(counts[r.num]||0)+1;
 let seedNum=0,seedN=0;for(const n of Object.keys(counts))if(counts[n]>seedN){seedN=counts[n];seedNum=+n}
 if(seedN<=1)return [dedupeNums(recs)];
 const clusters=recs.filter(r=>r.num===seedNum).map(s=>[s]);
 for(const r of recs)if(r.num!==seedNum){
  let best=null,bd=Infinity;
  for(const c of clusters){if(c.some(x=>x.num===r.num))continue;let d=Infinity;for(const x of c){const dd=dist(r.end,x.end);if(dd<d)d=dd}if(d<bd){bd=d;best=c}}
  if(best)best.push(r);else clusters.push([r]);
 }
 return clusters.map(dedupeNums);
}
function dedupeNums(list){
 const best=new Map();
 for(const r of list){const prev=best.get(r.num);if(!prev||(r.endIn!==prev.endIn?r.endIn:r.line.length>prev.line.length))best.set(r.num,r)}
 return [...best.values()];
}
function layouts(opts){
 opts=opts||{};
 const recs=holeRecs(opts.elements,opts.outers||[],opts.inners||[]);
 const by=new Map();
 for(const r of recs){const k=r.key||'';if(!by.has(k))by.set(k,[]);by.get(k).push(r)}
 const named=[];
 for(const [k,list] of by)if(k)named.push(list);
 let groups=named.filter(list=>list.length>=3).map(list=>asGroup(list));
 if(!groups.length&&named.length)groups=named.map(list=>asGroup(list));
 const unnamed=by.get('')||[];
 const clusters=clusterByRef(unnamed);
 if(groups.length){
  let i=0;
  for(const c of clusters)if(c.length>=9){i++;groups.push(asGroup(c,'Course '+i,'course '+i))}
 }else if(clusters.length>1){
  groups=clusters.map((c,i)=>asGroup(c,'Course '+(i+1),'course '+(i+1)));
 }else{
  const only=clusters[0]||[];
  return [asGroup(only,'','')];
 }
 groups.sort((a,b)=>a.name.localeCompare(b.name));
 return groups;
}
function asGroup(list,name,key){
 const nums=[...new Set(list.map(r=>r.num))].sort((a,b)=>a-b);
 const ids=list.map(r=>+((r.el&&r.el.id)||0)).filter(n=>n>0);
 return {key:key!=null?key:(list[0]?list[0].key:''),name:name!=null?name:(list[0]?list[0].course:''),count:nums.length,nums,ids};
}
function buildCourse(opts){
 const name=String(opts.name||'Course').replace(/[<>]/g,'').trim().slice(0,60)||'Course';
 const outers=opts.outers||[], inners=opts.inners||[];
 const elements=opts.elements||[];
  const layout=opts.layout?String(opts.layout).toLowerCase():'';
 const allow=opts.ids&&opts.ids.length?new Set(opts.ids.map(Number)):null;
 const inside=p=>pointInCourse(p,outers,inners)||outers.some(r=>nearPoint(p,r)<60);
 const byRef={};
 for(const el of elements){
  const t=el.tags||{}; if(t.golf!=='hole')continue;
  const id=parseHoleRef(t); if(!id)continue;
  if(allow){if(!allow.has(+el.id))continue}
  else if(layout){if(id.key!==layout)continue}
  else if(id.key)continue;
  const ref=id.num;
  const line=geomOf(el); if(line.length<2)continue;
  const end=line[line.length-1], mid=line[Math.floor(line.length/2)];
  if(outers.length&&!inside(end)&&!inside(mid))continue;
  const cand={ref,par:+t.par||0,line,end,endIn:outers.length?pointInCourse(end,outers,inners):true};
  const prev=byRef[ref];
  if(!prev||(cand.endIn!==prev.endIn?cand.endIn:line.length>prev.line.length))byRef[ref]=cand;
 }
 const holeLines=Object.values(byRef).map(h=>h.line);
 const polys=[];
 for(const el of elements){
  const t=el.tags||{}; if(t.golf!=='green')continue;
  const pts=geomOf(el); if(pts.length<3)continue;
  const c=centroid(pts); if(outers.length&&!inside(c))continue;
  if(layout&&holeLines.length&&!nearAny(c,holeLines,160))continue;
  polys.push({pts,c});
 }
 const pairs=[];
 for(const h of Object.values(byRef)){
  let bi=-1,bd=180;
  polys.forEach((g,i)=>{const d=nearPoint(h.end,g.pts);if(d<bd){bd=d;bi=i}});
  if(bi>=0)pairs.push({h,i:bi,d:bd});
 }
 pairs.sort((a,b)=>a.d-b.d);
 const used=new Set(),assign={};
 for(const p of pairs){if(assign[p.h.ref]||used.has(p.i))continue;used.add(p.i);assign[p.h.ref]=polys[p.i]}
  const tees=[];
 for(const el of elements){if((el.tags||{}).golf!=='tee')continue;const pts=geomOf(el);if(!pts.length)continue;const c=pts.length>=3?centroid(pts):pts[0];if(outers.length&&!inside(c))continue;if(layout&&holeLines.length&&!nearAny(c,holeLines,140))continue;tees.push({ref:+(el.tags.ref)||0,at:c})}
 const pars=Array(18).fill(4),greens={},shapes=[],teeOut={},holes={};
 for(const h of Object.values(byRef)){
  if(h.par>=3&&h.par<=6)pars[h.ref-1]=h.par;
  holes[h.ref]={line:thin(h.line,12)};
  const teeStart=tees.filter(t=>(t.ref===h.ref||!t.ref)&&dist(t.at,h.line[0])<140).sort((a,b)=>dist(a.at,h.line[0])-dist(b.at,h.line[0]))[0];
  const tee=teeStart;
  const from=tee?tee.at:h.line[0];
  if(tee)teeOut[h.ref]=[r6(tee.at[0]),r6(tee.at[1])];
  const g=assign[h.ref]; if(!g)continue;
  const fb=frontBack(g.pts,from);
  greens[h.ref]=[r6(fb.center[0]),r6(fb.center[1])];
  shapes.push({hole:h.ref,kind:'green',pts:thin(g.pts,24),front:[r6(fb.front[0]),r6(fb.front[1])],back:[r6(fb.back[0]),r6(fb.back[1])]});
 }
 const hazards=[];
 for(const el of elements){
  const kind=(el.tags||{}).golf;
  if(kind!=='bunker'&&kind!=='water_hazard'&&kind!=='lateral_water_hazard')continue;
  const pts=geomOf(el); if(pts.length<3)continue;
  const c=centroid(pts); if(outers.length&&!inside(c))continue;
  if(layout&&holeLines.length&&!nearAny(c,holeLines,140))continue;
  hazards.push({kind,pts:thin(pts,16)});
  if(hazards.length>=48)break;
 }
 const keepOutline=!layout;
 return {name,osmId:opts.osmId||'',layout:layout||'',pars,greens,shapes,tees:teeOut,holes,hazards,outline:keepOutline?{outers:outers.map(r=>thin(r,48)),inners:(inners||[]).map(r=>thin(r,24))}:{outers:[],inners:[]},source:'osm',loadedAt:Date.now()};
}
function copyHole(course,from,to,out){
 const g=course.greens&&(course.greens[from]||course.greens[String(from)]);
 if(g)out.greens[to]=[g[0],g[1]];
 const tee=course.tees&&(course.tees[from]||course.tees[String(from)]);
 if(tee)out.tees[to]=[tee[0],tee[1]];
 const line=course.holes&&(course.holes[from]||course.holes[String(from)]);
 if(line&&line.line)out.holes[to]={line:line.line.map(p=>[p[0],p[1]])};
 if(course.pars&&course.pars[from-1]>=3)out.pars[to-1]=course.pars[from-1];
 for(const s of course.shapes||[])if(+s.hole===+from)out.shapes.push({...s,hole:to,pts:(s.pts||[]).map(p=>[p[0],p[1]]),front:s.front&&[s.front[0],s.front[1]],back:s.back&&[s.back[0],s.back[1]]});
}
function blankFrom(course,name){
 return {name:name||course.name,osmId:course.osmId||'',pars:Array(18).fill(4),greens:{},shapes:[],tees:{},holes:{},hazards:course.hazards||[],outline:{outers:[],inners:[]},source:course.source||'osm',loadedAt:Date.now()};
}
function replayNine(course){
 const out=blankFrom(course,course.name);
 for(let h=1;h<=9;h++){copyHole(course,h,h,out);copyHole(course,h,h+9,out)}
 out.replay9=true;out.layout=course.layout||'';out.osmId=course.osmId||'';
 return out;
}
function appendNine(front,back){
 const out=blankFrom(front,(front.name||'Nine')+' + '+(back.name||'Nine'));
 for(let h=1;h<=9;h++)copyHole(front,h,h,out);
 for(let h=1;h<=9;h++)copyHole(back,h,h+9,out);
 const seen=new Set(),haz=[];
 for(const h of [...(front.hazards||[]),...(back.hazards||[])]){const k=JSON.stringify(h.pts&&h.pts[0]);if(seen.has(k))continue;seen.add(k);haz.push(h);if(haz.length>=48)break}
 out.hazards=haz;
 return out;
}
function takeHoles(course,nums){
 const list=[...new Set((nums||[]).map(n=>+n).filter(n=>n>=1&&n<=18))].sort((a,b)=>a-b);
 const out=blankFrom(course,course.name);
 list.forEach((h,i)=>copyHole(course,h,i+1,out));
 const lines=Object.values(out.holes).map(h=>h.line).filter(l=>l&&l.length);
 out.hazards=(course.hazards||[]).filter(h=>{const c=centroid(h.pts||[]);return lines.some(line=>nearAny(c,[line],140))}).slice(0,48);
 return out;
}
function targets(course,hole,player){
 const shape=(course.shapes||[]).find(s=>s.kind==='green'&&+s.hole===+hole);
 const center=course.greens&&(course.greens[hole]||course.greens[String(hole)]);
 if(!center)return null;
 let from=null;
 if(player&&dist(player,center)<2500)from=player;
 else if(course.tees&&(course.tees[hole]||course.tees[String(hole)]))from=course.tees[hole]||course.tees[String(hole)];
 else if(course.holes&&course.holes[hole]&&course.holes[hole].line)from=course.holes[hole].line[0];
 if(shape&&shape.pts&&shape.pts.length>=3&&from){const fb=frontBack(shape.pts,from);return {front:fb.front,center:fb.center,back:fb.back}}
 return {front:(shape&&shape.front)||center,center,back:(shape&&shape.back)||center};
}
const api={dist,centroid,pointInRing,pointInCourse,frontBack,thin,buildCourse,layouts,parseHoleRef,replayNine,appendNine,takeHoles,targets,geomOf};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.XLMap=api;
})(typeof window!=='undefined'?window:globalThis);
