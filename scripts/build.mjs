import { mkdir, copyFile, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css']) {
  await copyFile(name, `dist/${name}`);
}
console.log('Built three public frontend files. Server rules, SQL and worker source excluded.');
