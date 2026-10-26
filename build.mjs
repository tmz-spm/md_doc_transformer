import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const dist = new URL('dist/', root);
// Only remove this script's fixed output directory, never a caller-supplied path.
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of ['index.html', 'style.css', 'engine-offline.js', 'app-offline.js',
  'README.txt', 'SUPPORTED_FEATURES.md', 'AUDIT_REPORT.md', 'NOTICE.txt']) {
  await cp(new URL(name, root), new URL(name, dist));
}
console.log(`Built offline converter: ${fileURLToPath(dist)}`);
