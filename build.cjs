const fs = require('node:fs');
const path = require('node:path');
require('./verify.cjs');
const target = path.join(__dirname, 'build');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, 'extension'), target, { recursive: true });
const configFile = path.join(target, 'i18n-config.js');
const prefix = 'window.GCD_I18N_CONFIG=';
const source = fs.readFileSync(configFile, 'utf8');
if (!source.startsWith(prefix)) throw Error('Unexpected translation bundle');
const config = JSON.parse(source.slice(prefix.length).replace(/;\s*$/, ''));
for (const locale of config.locales) {
  config.catalogs[locale] = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', locale + '.json'), 'utf8'));
}
fs.writeFileSync(configFile, prefix + JSON.stringify(config).replace(/</g, '\\u003c') + ';');
console.log('Load unpacked extension from:', target);
