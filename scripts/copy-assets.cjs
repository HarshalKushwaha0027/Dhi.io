const fs = require('fs')
const path = require('path')

if (!fs.existsSync('dist')) fs.mkdirSync('dist')

fs.copyFileSync(path.join('public', 'background.js'), path.join('dist', 'background.js'))
fs.copyFileSync(path.join('public', 'manifest.json'), path.join('dist', 'manifest.json'))

console.log('✅ background.js → dist/background.js')
console.log('✅ manifest.json → dist/manifest.json')