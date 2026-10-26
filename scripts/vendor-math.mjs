import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = resolve(root, 'vendor');
await mkdir(resolve(vendor, 'licenses'), { recursive: true });
const result = await build({ absWorkingDir: root, entryPoints: ['math-support.js'],
  outfile: 'vendor/math-libraries.js', bundle: true, format: 'iife', globalName: 'OfflineMath',
  platform: 'browser', target: 'es2020', minify: true, legalComments: 'eof', metafile: true });
await cp(resolve(root, 'node_modules/katex/dist/katex.min.css'), resolve(vendor, 'katex.min.css'));
await cp(resolve(root, 'node_modules/katex/dist/fonts'), resolve(vendor, 'fonts'), { recursive: true });
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.startsWith('node_modules/')) continue;
  const parts = input.split('/');
  const name = parts[1].startsWith('@') ? parts.slice(1, 3).join('/') : parts[1];
  packages.set(name, resolve(root, 'node_modules', name));
}
const records = [];
for (const [name, dir] of packages) {
  const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
  for (const file of await readdir(dir)) if (/^(license|licence|copying|notice)/i.test(file)) {
    await cp(resolve(dir, file), resolve(vendor, 'licenses', `${name.replaceAll('/', '--')}-${file}`));
  }
  records.push({ name, version: pkg.version, license: pkg.license });
}
// The LGPL converter remains replaceable in a separate bundle; include its unminified source.
await mkdir(resolve(vendor, 'sources'), { recursive: true });
await cp(resolve(root, 'node_modules/mathml2omml/dist/index.js'), resolve(vendor, 'sources/mathml2omml.js'));
await cp(resolve(root, 'scripts/licenses/GPL-3.0.txt'), resolve(vendor, 'licenses/GPL-3.0.txt'));
await writeFile(resolve(vendor, 'manifest.json'), JSON.stringify(records, null, 2) + '\n');
console.log(`Vendored ${records.length} JavaScript packages. No WASM or remote runtime assets.`);
