// Simple service worker for app shell caching (demo)
const CACHE = 'chitzy-shell-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
});
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if(ASSETS.includes(url.pathname)){
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
  }
});