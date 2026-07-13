const CACHE='maze-munch-2-build-200';
const ASSETS=[
'./','./index.html?v=2','./styles.css?v=2','./app.js?v=2',
'./manifest.webmanifest?v=2','./icons/icon.svg?v=2','./icons/apple-touch-icon.svg?v=2'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(resp=>{
    const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html?v=2'))));
});
