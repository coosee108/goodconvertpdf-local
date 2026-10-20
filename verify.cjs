const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const prefix = 'window.GCD_I18N_CONFIG=';
const sourceI18n = fs.readFileSync(path.join(root, 'i18n-config.js'), 'utf8');
assert(sourceI18n.startsWith(prefix));
const i18n = JSON.parse(sourceI18n.slice(prefix.length).replace(/;\s*$/, ''));
for (const locale of i18n.locales) {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', locale + '.json'), 'utf8'));
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(i18n.catalogs.en).sort(), `Translation keys differ for ${locale}`);
}
const excluded = ['api.js', 'auth-callback.html', 'auth-callback.js', 'env.js', 'config.dev.js', 'config.prod.js'];
for (const name of excluded) assert(!fs.existsSync(path.join(root, name)), `Unexpected private file: ${name}`);
assert(!('key' in manifest), 'Chrome store identity key must not be published');
assert(!manifest.web_accessible_resources.some(entry => entry.resources.includes('auth-callback.html')));
assert(!manifest.content_scripts.some(entry => entry.js.some(file => excluded.includes(file))));
for (const name of ['popup.html', 'workspace.html', 'documents.html', 'pdf-tools.html', 'recent.html']) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  assert(!/assets\/(?:presence|analytics)\.js/.test(html), `Website telemetry remains in ${name}`);
  for (const file of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
    const ref = file[1];
    if (/^(?:https?:|data:|mailto:)/.test(ref)) continue;
    assert(!ref.startsWith('/'), `Absolute local path in ${name}: ${ref}`);
    assert(fs.existsSync(path.join(root, ref)), `Missing asset in ${name}: ${ref}`);
  }
}
for (const license of ['pdf-lib-LICENSE.md', 'fflate-LICENSE', 'dompurify-LICENSE', 'dompurify-LICENSE-MPL', 'turndown-LICENSE', 'turndown-plugin-gfm-LICENSE', 'readability-LICENSE.md', 'pdfjs-dist-LICENSE', 'html2pdf.bundle.min.js.LICENSE.txt']) {
  assert(fs.existsSync(path.join(root, 'vendor', 'licenses', license)), `Missing third-party license: ${license}`);
}
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { inspect(file); continue; }
    if (!/\.(?:js|mjs|html|json)$/.test(entry.name)) continue;
    const code = fs.readFileSync(file, 'utf8');
    assert(!/cpolar\.top|gcd_token|googleLogin|openAPI\/user|api\.goodconvertpdf\.com|sk_(?:live|test)_[A-Za-z0-9]+|BEGIN [A-Z ]*PRIVATE KEY/.test(code), `Private service or credential content remains in ${file}`);
  }
}
inspect(root);
console.log('Community source checks passed.');
