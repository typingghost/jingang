// 未然·金刚网页版的离线缓存。页面先走网络、断网用缓存；音频第一次播放时在后台整段存下来，之后断网也能听。
// 苹果的 Safari 播放音频时会按 Range 分段请求，所以从缓存回放时要自己切出 206 片段。
const VERSION = '31254b3d6ba3';
const SHELL = 'jingang-shell-' + VERSION;
const AUDIO = 'jingang-audio-v1';
const SHELL_FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const AUDIO_FILES = ["audio/vol1.m4a", "audio/vol2.m4a", "audio/vol3.m4a", "audio/vol4.m4a", "audio/vol5.m4a", "audio/vol6.m4a", "audio/vol7.m4a", "audio/vol8.m4a", "audio/read/ch01.m4a", "audio/read/ch02.m4a", "audio/read/ch03.m4a", "audio/read/ch04.m4a", "audio/read/ch05.m4a", "audio/read/ch06.m4a", "audio/read/ch07.m4a", "audio/read/ch08.m4a", "audio/read/ch09.m4a", "audio/read/ch10.m4a", "audio/read/ch11.m4a", "audio/read/ch12.m4a", "audio/read/ch13.m4a", "audio/read/ch14.m4a", "audio/read/ch15.m4a", "audio/read/ch16.m4a", "audio/read/ch17.m4a", "audio/read/ch18.m4a", "audio/read/ch19.m4a", "audio/read/ch20.m4a", "audio/read/ch21.m4a", "audio/read/ch22.m4a", "audio/read/ch23.m4a", "audio/read/ch24.m4a", "audio/read/ch25.m4a", "audio/read/ch26.m4a", "audio/read/ch27.m4a", "audio/read/ch28.m4a", "audio/read/ch29.m4a", "audio/read/ch30.m4a", "audio/read/ch31.m4a", "audio/read/ch32.m4a"];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('jingang-shell-') && k !== SHELL).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

const pending = new Set();

function cacheWholeAudio(url) {
  if (pending.has(url)) return;
  pending.add(url);
  fetch(url, { cache: 'no-store' })
    .then((r) => (r.ok && r.status === 200 ? caches.open(AUDIO).then((c) => c.put(url, r)) : null))
    .catch(() => {})
    .finally(() => pending.delete(url));
}

async function rangeFromCache(request, cached) {
  const range = request.headers.get('range');
  if (!range) return cached;
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mp4',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.endsWith('.m4a')) {
    const key = new URL(path, self.location.href).href;
    event.respondWith(caches.open(AUDIO).then((c) => c.match(key)).then((cached) => {
      if (cached) return rangeFromCache(event.request, cached);
      cacheWholeAudio(key);
      return fetch(event.request);
    }));
    return;
  }
  // 页面和图标：先走网络拿最新的，断网再用缓存
  event.respondWith(fetch(event.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(event.request, copy)); }
    return r;
  }).catch(() => caches.match(event.request).then((r) => r || caches.match('index.html'))));
});

// 页面可以要求一次性把八期都存下来（"全部下载以便离线"）
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'cache-audio' && Array.isArray(msg.files)) {
    msg.files.filter((p) => AUDIO_FILES.includes(p))
      .forEach((p) => cacheWholeAudio(new URL(p, self.location.href).href));
  }
});
