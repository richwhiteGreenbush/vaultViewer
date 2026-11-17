// Zips fixtures/sample-vault into public/sample-vault.zip.
// Used by e2e tests and the in-app "Try the sample vault" button.
import { zipSync } from 'fflate';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'fixtures/sample-vault';
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name !== 'EXPECTED.json') {
      files[`sample-vault/${relative(root, full).split('\\').join('/')}`] = [
        new Uint8Array(readFileSync(full)),
        { mtime: st.mtime },
      ];
    }
  }
})(root);

writeFileSync('public/sample-vault.zip', zipSync(files, { level: 9 }));
console.log(`zipped ${Object.keys(files).length} files to public/sample-vault.zip`);
