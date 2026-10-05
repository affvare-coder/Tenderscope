const CACHE="tenderscope-app-v2";
const APP_SHELL=["/","/index.html","/styles.css","/app.js","/manifest.webmanifest","/assets/tenderscope-logo.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("tenderscope-app-")&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin) return;
  // Live bid feeds and member responses must never enter the app-shell cache.
  if(e.request.headers.has("Authorization")||u.pathname.startsWith("/api/")) return;
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put("/index.html",copy)));}return r;}).catch(()=>caches.match("/index.html")));
    return;
  }
  if(!APP_SHELL.includes(u.pathname)||u.search) return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request)));
});
