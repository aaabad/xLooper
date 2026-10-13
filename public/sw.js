const V='xlooper-v5',CORE=['./','index.html','app.js','config.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&x!=='xl-tiles').map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.hostname==='ntfy.sh')return;
 if(u.hostname.includes('arcgisonline')){e.respondWith(caches.open('xl-tiles').then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{c.put(e.request,n.clone());return n}))));return;}
 e.respondWith(fetch(e.request).then(n=>{if(n.ok){const c=n.clone();caches.open(V).then(x=>x.put(e.request,c))}return n}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))))});
