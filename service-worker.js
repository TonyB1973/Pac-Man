const CACHE='maze-munch-build-210';
const ASSETS=[
'./','./index.html?v=21','./styles.css?v=21','./app.js?v=21',
'./manifest.webmanifest?v=21','./icons/icon.svg?v=21','./icons/apple-touch-icon.svg?v=21'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(resp=>{
    const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html?v=21'))));
});
