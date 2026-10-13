// xLooper server: static PWA + tiny tournament API (SSE). No deps. Data in data.json.
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||8787, PUB=path.join(__dirname,'public'), DB=path.join(__dirname,'data.json');
let db={t:{}}; try{db=JSON.parse(fs.readFileSync(DB))}catch{}
const save=()=>fs.writeFile(DB,JSON.stringify(db),()=>{});
const subs={}; // code -> Set(res)
const push=(c,ev,d)=>(subs[c]||[]).forEach(r=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`));
const T=c=>db.t[c];
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.css':'text/css'};
const body=r=>new Promise(ok=>{let s='';r.on('data',d=>{s+=d;if(s.length>2e4)r.destroy()});r.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch{ok({})}})});
const J=(res,o,st=200)=>{res.writeHead(st,{'content-type':'application/json'});res.end(JSON.stringify(o))};
const clean=(s,n=40)=>String(s||'').replace(/[<>]/g,'').slice(0,n).trim();
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),p=u.pathname,m=p.match(/^\/api\/t\/([A-Z0-9]{4,8})(\/\w+)?$/);
  if(p==='/api/t'&&req.method==='POST'){const b=await body(req);let c;do{c=Math.random().toString(36).slice(2,7).toUpperCase()}while(db.t[c]);
    db.t[c]={code:c,name:clean(b.name)||'xLooper Cup',pars:Array.isArray(b.pars)?b.pars.slice(0,18).map(Number):Array(18).fill(4),players:{},msgs:[],created:Date.now()};save();return J(res,db.t[c]);}
  if(m){const c=m[1],t=T(c),a=m[2];if(!t)return J(res,{error:'not found'},404);
    if(!a&&req.method==='GET')return J(res,t);
    if(a==='/join'){const b=await body(req),id=clean(b.id,20),n=clean(b.name,24);if(!id||!n)return J(res,{error:'name'},400);t.players[id]=t.players[id]||{name:n,scores:{}};t.players[id].name=n;save();push(c,'state',t);return J(res,t);}
    if(a==='/score'){const b=await body(req),pl=t.players[clean(b.id,20)];if(!pl)return J(res,{error:'join first'},400);const h=+b.hole;if(h>=1&&h<=18){if(b.strokes)pl.scores[h]=Math.min(15,+b.strokes);else delete pl.scores[h];}save();push(c,'state',t);return J(res,{ok:1});}
    if(a==='/msg'){const b=await body(req),pl=t.players[clean(b.id,20)];if(!pl)return J(res,{error:'join first'},400);const msg={from:pl.name,text:clean(b.text,280),ts:Date.now(),ann:!!b.ann};if(!msg.text)return J(res,{error:'empty'},400);t.msgs.push(msg);t.msgs=t.msgs.slice(-200);save();push(c,'msg',msg);return J(res,msg);}
    if(a==='/stream'){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'});res.write(`event: state\ndata: ${JSON.stringify(t)}\n\n`);(subs[c]=subs[c]||new Set).add(res);const k=setInterval(()=>res.write(':k\n\n'),20000);req.on('close',()=>{clearInterval(k);subs[c].delete(res)});return;}
    return J(res,{error:'bad'},400);}
  let f=path.normalize(path.join(PUB,p==='/'?'index.html':p));if(!f.startsWith(PUB))return J(res,{},403);
  fs.readFile(f,(e,d)=>{if(e){fs.readFile(path.join(PUB,'index.html'),(e2,d2)=>{res.writeHead(200,{'content-type':'text/html'});res.end(d2)});return;}
    res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-cache'});res.end(d)});
}).listen(PORT,()=>console.log('xLooper on',PORT));
