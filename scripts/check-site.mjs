// HTTP/build and live-client checks. This is NOT a browser or visual layout test.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const preview = process.argv.slice(2).find(argument => !argument.startsWith('--')) ?? 'http://127.0.0.1:4173/';
const pages = ['', 'play/', 'play/?demo=1', 'whitepaper/', 'whitelist/', 'collection/', 'admin/'];
const titles = ['SqueekRunner', 'Play', 'Play', 'Whitepaper', 'Whitelist', 'Collection', 'Review Panel'];

async function checkPages(base) {
  const seen = new Map();
  async function get(url) {
    const key = new URL(url); key.hash = '';
    if (!seen.has(key.href)) seen.set(key.href, (async () => {
      const response = await fetch(key, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200, key.href);
      return response.text();
    })());
    return seen.get(key.href);
  }
  for (const [index, route] of pages.entries()) {
    const url = new URL(route, base);
    const html = await get(url);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title?.includes(titles[index]), `Wrong page at ${url}: ${title}`);
    if (route.startsWith('whitepaper')) assert.equal((html.match(/<script\b/g) ?? []).length, 0, 'Whitepaper must remain readable without JS');
    if (route.startsWith('play')) assert.match(html, /id="game"/);
    if (!route) { assert.match(html, /data-telemetry/); assert.doesNotMatch(html, /src="[^"]*\/play-[^"]+\.js/); }
    for (const [, attr] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|data:)/.test(attr)) continue;
      assert.ok(!attr.startsWith('/'), `Root-absolute resource breaks subdirectory hosting: ${attr}`);
      const target = new URL(attr, url);
      assert.ok(target.pathname.startsWith(new URL(base).pathname), `Escaped mount: ${target}`);
      const body = await get(target);
      if (target.hash) assert.ok(body.includes(`id="${target.hash.slice(1)}"`), `Broken anchor: ${target}`);
      if (/\.js$/.test(target.pathname)) {
        for (const [, dependency] of body.matchAll(/\bfrom["'](\.[^"']+)["']/g)) await get(new URL(dependency, target));
      }
    }
  }
  console.log(`PASS pages, links, anchors and assets: ${base} (${seen.size} resources)`);
}

await checkPages(preview);

// Check the actual authored text palette in both system themes (WCAG AA normal text).
const css = await readFile(resolve(root, 'src/site/site.css'), 'utf8');
const themes = [...css.matchAll(/:root\s*\{([^}]+)\}/g)].slice(0, 2);
const luminance = hex => {
  const values = hex.slice(1).match(/../g).map(channel => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
let palette = {};
for (const [index, theme] of themes.entries()) {
  palette = { ...palette, ...Object.fromEntries([...theme[1].matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(([, key, value]) => [key, value])) };
  for (const background of ['paper', 'surface']) for (const foreground of ['ink', 'muted', 'accent-ink', 'live', 'idle', 'no-data']) {
    const a = luminance(palette[background]); const b = luminance(palette[foreground]);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5, `${index === 0 ? 'Light' : 'Dark'} ${foreground}/${background} contrast ${ratio.toFixed(2)}`);
  }
}
assert.equal(themes.length, 2);
console.log('PASS normal-text contrast for light and dark palettes (24 pairs ≥ 4.5:1)');

// Serve the exact same dist under a prefix to catch absolute-path regressions.
const prefix = '/nested/squeekrunner/';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    assert.ok(pathname.startsWith(prefix));
    let path = resolve(dist, pathname.slice(prefix.length));
    assert.ok(path === dist || path.startsWith(dist + sep));
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    response.writeHead(200); response.end(await readFile(path));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
try {
  await checkPages(`http://127.0.0.1:${server.address().port}${prefix}`);
} finally { await new Promise(resolveClose => server.close(resolveClose)); }

// Evaluate the actual production landing bundle with a minimal DOM port under Node.
// This exercises LiveSource + parser + widget, not browser rendering or CORS enforcement.
if (process.argv.includes('--live')) {
  const fields = new Map();
  for (const key of ['rpm', 'height', 'height-label', 'mode', 'mode-text', 'explanation', 'announcement']) {
    fields.set(`[data-${key}]`, { textContent: '', dataset: {} });
  }
  const widget = { querySelector: selector => fields.get(selector) ?? null };
  const documentPort = new EventTarget();
  Object.assign(documentPort, {
    hidden: false,
    querySelector: selector => selector === '[data-telemetry]' ? widget : null,
    createElement: () => ({ relList: { supports: () => true } }),
  });
  globalThis.document = documentPort;
  globalThis.window = new EventTarget();
  const originalFetch = globalThis.fetch;
  let proof;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.squeekchain.com/v1/status');
    assert.equal(options.credentials, 'omit');
    const started = Date.now();
    const response = await originalFetch(url, { ...options, headers: { Origin: new URL(preview).origin } });
    proof = { status: response.status, cors: response.headers.get('access-control-allow-origin'), elapsedMs: Date.now() - started };
    return response;
  };
  try {
    const entry = (await readdir(resolve(dist, 'assets'))).find(name => /^home-.*\.js$/.test(name));
    assert.ok(entry, 'Missing production landing entry');
    await import(pathToFileURL(resolve(dist, 'assets', entry)).href);
    const deadline = Date.now() + 15000;
    while (!fields.get('[data-height]').textContent.startsWith('#') && Date.now() < deadline) {
      await new Promise(resolveTick => setTimeout(resolveTick, 100));
    }
    assert.equal(proof?.status, 200, JSON.stringify(proof));
    assert.equal(proof.cors, '*', 'Expected public read CORS header');
    assert.match(fields.get('[data-height]').textContent, /^#\d+$/);
    console.log('PASS production widget with real API (Node DOM port):', JSON.stringify({
      ...proof, mode: fields.get('[data-mode-text]').textContent,
      rpm: fields.get('[data-rpm]').textContent, block: fields.get('[data-height]').textContent,
    }));
  } finally {
    window.dispatchEvent(new Event('pagehide'));
    globalThis.fetch = originalFetch;
  }
}
