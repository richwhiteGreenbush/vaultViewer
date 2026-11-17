// Zips a vault folder. Default: fixtures/sample-vault -> public/sample-vault.zip
// (used by e2e tests and the in-app "Try the sample vault" button).
// Usage: node scripts/zip-fixtures.mjs [srcDir] [out.zip]
import { zipSync } from 'fflate';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'fixtures/sample-vault';
const outFile = process.argv[3] ?? 'public/sample-vault.zip';
const top = root.split('/').filter(Boolean).pop();
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name !== 'EXPECTED.json') {
      files[`${top}/${relative(root, full).split('\\').join('/')}`] = [
        new Uint8Array(readFileSync(full)),
        { mtime: st.mtime },
      ];
    }
  }
})(root);

writeFileSync(outFile, zipSync(files, { level: 6 }));
console.log(`zipped ${Object.keys(files).length} files to ${outFile}`);
