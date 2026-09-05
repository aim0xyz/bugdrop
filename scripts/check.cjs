const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const file of fs.readdirSync(path.join(root, 'extension')).filter(x => x.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(root, 'extension', file)]);
for (const dir of ['mobile', 'bin', 'desktop']) for (const file of fs.readdirSync(path.join(root, dir)).filter(x => x.endsWith('.cjs') || x.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(root, dir, file)]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json')));
for (const file of [manifest.action.default_popup, manifest.background.service_worker, ...Object.values(manifest.icons)]) {
  if (!fs.existsSync(path.join(root, 'extension', file))) throw new Error('Missing manifest asset: ' + file);
}
if (manifest.host_permissions || manifest.permissions.includes('debugger')) throw new Error('Unexpected broad permissions');
console.log('Extension JavaScript, manifest assets, and permission boundary checked.');
