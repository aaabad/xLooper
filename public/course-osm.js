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
function buildCourse(opts){
 const name=String(opts.name||'Course').replace(/[<>]/g,'').trim().slice(0,60)||'Course';
 const outers=opts.outers||[], inners=opts.inners||[];
 const elements=opts.elements||[];
 const inside=p=>pointInCourse(p,outers,inners)||outers.some(r=>nearPoint(p,r)<60);
 const byRef={};
 for(const el of elements){
  const t=el.tags||{}; if(t.golf!=='hole')continue;
  const ref=+t.ref; if(!(ref>=1&&ref<=18))continue;
  const line=geomOf(el); if(line.length<2)continue;
  const end=line[line.length-1], mid=line[Math.floor(line.length/2)];
  if(outers.length&&!inside(end)&&!inside(mid))continue;
  const cand={ref,par:+t.par||0,line,end,endIn:outers.length?pointInCourse(end,outers,inners):true};
  const prev=byRef[ref];
  if(!prev||(cand.endIn!==prev.endIn?cand.endIn:line.length>prev.line.length))byRef[ref]=cand;
 }
 const polys=[];
 for(const el of elements){
  const t=el.tags||{}; if(t.golf!=='green')continue;
  const pts=geomOf(el); if(pts.length<3)continue;
  const c=centroid(pts); if(outers.length&&!inside(c))continue;
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
 for(const el of elements){if((el.tags||{}).golf!=='tee')continue;const pts=geomOf(el);if(!pts.length)continue;const c=pts.length>=3?centroid(pts):pts[0];if(outers.length&&!inside(c))continue;tees.push({ref:+(el.tags.ref)||0,at:c})}
 const pars=Array(18).fill(4),greens={},shapes=[],teeOut={},holes={};
 for(const h of Object.values(byRef)){
  if(h.par>=3&&h.par<=6)pars[h.ref-1]=h.par;
  holes[h.ref]={line:thin(h.line,12)};
  const tee=tees.filter(t=>t.ref===h.ref).sort((a,b)=>dist(a.at,h.line[0])-dist(b.at,h.line[0]))[0]||tees.filter(t=>!t.ref).sort((a,b)=>dist(a.at,h.line[0])-dist(b.at,h.line[0]))[0];
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
  hazards.push({kind,pts:thin(pts,16)});
  if(hazards.length>=48)break;
 }
 return {name,osmId:opts.osmId||'',pars,greens,shapes,tees:teeOut,holes,hazards,outline:{outers:outers.map(r=>thin(r,48)),inners:(inners||[]).map(r=>thin(r,24))},source:'osm',loadedAt:Date.now()};
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
const api={dist,centroid,pointInRing,pointInCourse,frontBack,thin,buildCourse,targets,geomOf};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.XLMap=api;
})(typeof window!=='undefined'?window:globalThis);
