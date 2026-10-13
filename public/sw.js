const V='xlooper-v9',CORE=['./','index.html','app.js','course-osm.js','config.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(V);await Promise.all(CORE.map(u=>c.add(u).catch(()=>{})));await self.skipWaiting()})())});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(x=>x!==V&&x!=='xl-tiles').map(x=>caches.delete(x)));await self.clients.claim();const cs=await self.clients.matchAll({type:'window'});for(const c of cs)c.postMessage({type:'xlooper-update'})})())});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 const api=/openstreetmap\.org$|overpass|ntfy\.sh|golfcourseapi\.com/.test(u.hostname);
 if(e.request.method!=='GET'||api||u.pathname.startsWith('/api/'))return;
 if(u.hostname.includes('arcgisonline')){e.respondWith(caches.open('xl-tiles').then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{c.put(e.request,n.clone());return n}).catch(()=>r))));return;}
 const same=u.origin===self.location.origin;
 const req=same?new Request(e.request,{cache:'no-cache'}):e.request;
 e.respondWith(fetch(req).then(n=>{if(n.ok){const c=n.clone();caches.open(V).then(x=>x.put(e.request,c))}return n}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('index.html'):Promise.reject(new Error('offline'))))))});
