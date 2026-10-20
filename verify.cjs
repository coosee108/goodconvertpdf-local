const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
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
for (const name of ['background.js', 'config.js', 'studio/jobs-client.js']) {
  const code = fs.readFileSync(path.join(root, name), 'utf8');
  assert(!/cpolar\.top|gcd_token|googleLogin|openAPI\/user|api\.goodconvertpdf\.com/.test(code), `Cloud/account code remains in ${name}`);
}
console.log('Community source checks passed.');
