import {build} from 'esbuild';
import { mkdir, copyFile, rm, cp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const sourceSha = execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim();
const dirty = !!execFileSync('git', ['status','--porcelain','--untracked-files=all'], {encoding:'utf8'}).trim();
await writeFile('dist/release.json', JSON.stringify({source_sha:sourceSha,dirty,built_at:new Date().toISOString()})+'\n');
for (const name of ['index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'sw.js','commercial.js','commercial-api.mjs','commercial-drafts.mjs']) {
  await copyFile(name, `dist/${name}`);
}
await copyFile('_redirects','dist/_redirects');
await copyFile('_headers','dist/_headers');
await cp('assets', 'dist/assets', { recursive: true });
await copyFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'dist/supabase.js');
console.log('Built public frontend with pinned authentication client. Server rules, SQL and worker source excluded.');

await build({entryPoints:['document-studio.mjs'],outfile:'dist/document-studio.js',bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true});
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','dist/assets/pdf.worker.min.mjs');
