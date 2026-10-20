const fs = require('node:fs');
const path = require('node:path');
require('./verify.cjs');
const target = path.join(__dirname, 'build');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, 'extension'), target, { recursive: true });
console.log('Load unpacked extension from:', target);
