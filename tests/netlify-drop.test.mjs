import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('manual Netlify ZIP always contains explicit reverse proxy and SPA routes',()=>{
 const redirect=read('_redirects');
 assert.ok(redirect.indexOf('/api/public/*')>=0);
 assert.ok(redirect.indexOf('/api/public/*')<redirect.indexOf('/* /index.html 200'));
 assert.match(redirect,/https:\/\/agdmlgbfxoqhztiormij\.supabase\.co\/rest\/v1\/:splat 200!/);
 const build=read('scripts/build.mjs');
 assert.match(build,/copyFile\('_redirects','dist\/_redirects'\)/);
 assert.match(build,/copyFile\('_headers','dist\/_headers'\)/);
});
test('all public and member API requests transmit only the publishable browser key',()=>{
 const app=read('app.js'),commercial=read('commercial-api.mjs');
 const key=app.match(/const KEY = '(sb_publishable_[^']+)'/)?.[1];
 assert.ok(key);
 assert.ok(commercial.includes("const PUBLIC_SUPABASE_KEY = '"+key+"'"));
 assert.match(app,/response = await fetch\(API_URL \+ path, \{ cache: 'no-store', headers:H,/);
 assert.match(app,/headers:\{apikey:KEY,Authorization:\x60Bearer \$\{token\}\x60,'Content-Type':'application\/json'\}/);
 assert.match(commercial,/headers:\{apikey:PUBLIC_SUPABASE_KEY,Authorization:/);
 assert.doesNotMatch(app+commercial,/service_role\s*[:=]\s*['\x60]eyJ|sb_secret_/);
});
