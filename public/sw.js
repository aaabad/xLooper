const V='xlooper-v18',CORE=['./','index.html','app.js','chat.js','games.js','course-osm.js','config.js','xircle-db.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
let tileNet=false;
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(V);await Promise.all(CORE.map(u=>c.add(u).catch(()=>{})));await self.skipWaiting()})())});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(x=>x!==V&&x!=='xl-tiles').map(x=>caches.delete(x)));await self.clients.claim();const cs=await self.clients.matchAll({type:'window'});for(const c of cs)c.postMessage({type:'xlooper-update'})})())});
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='xl-tile-net'){tileNet=!!d.allow;if(e.ports&&e.ports[0])e.ports[0].postMessage({ok:1})}});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 const api=/openstreetmap\.org$|overpass|ntfy\.sh|golfcourseapi\.com|googleapis\.com$|firebaseio\.com$|firebaseapp\.com$/.test(u.hostname);
 if(e.request.method!=='GET'||api||u.pathname.startsWith('/api/'))return;
 if(u.hostname.includes('arcgisonline')){e.respondWith((async()=>{const c=await caches.open('xl-tiles');const hit=await c.match(e.request);if(hit)return hit;if(!tileNet)return new Response('',{status:404});try{const n=await fetch(e.request);if(n&&n.ok)c.put(e.request,n.clone());return n}catch(err){return hit||new Response('',{status:504})}})());return}
 e.respondWith((async()=>{const cached=await caches.match(e.request);const same=u.origin===self.location.origin;
  const net=fetch(same?new Request(e.request,{cache:'no-cache'}):e.request).then(n=>{if(n&&n.ok){const copy=n.clone();caches.open(V).then(x=>x.put(e.request,copy))}return n}).catch(()=>null);
  if(cached){net.then(()=>{},()=>{});return cached}
  const n=await net;if(n)return n;
  if(e.request.mode==='navigate'){const i=await caches.match('index.html');if(i)return i}
  return new Response('',{status:504})})())});
