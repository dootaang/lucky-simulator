import * as esbuild from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const tempJs = path.join(dist, 'bundle.js');

await mkdir(dist, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outfile: tempJs,
  legalComments: 'inline',
  logLevel: 'info',
});

const [js, css] = await Promise.all([
  readFile(tempJs, 'utf8'),
  readFile(path.join(root, 'src', 'style.css'), 'utf8'),
]);

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>시뮬봇 카드 플레이그라운드</title>
  <style>
${css}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
${js}
  </script>
</body>
</html>
`;

await writeFile(path.join(dist, 'index.html'), html, 'utf8');
await rm(tempJs, { force: true });
console.log('Built dist/index.html');
