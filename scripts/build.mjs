import {build} from 'esbuild';
import { mkdir, copyFile, rm, cp } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'sw.js','commercial.js','commercial-api.mjs','commercial-drafts.mjs']) {
  await copyFile(name, `dist/${name}`);
}
await cp('assets', 'dist/assets', { recursive: true });
await copyFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'dist/supabase.js');
console.log('Built public frontend with pinned authentication client. Server rules, SQL and worker source excluded.');

await build({entryPoints:['document-studio.mjs'],outfile:'dist/document-studio.js',bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true});
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','dist/assets/pdf.worker.min.mjs');
