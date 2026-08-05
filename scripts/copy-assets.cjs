const fs   = require('fs')
const path = require('path')

if (!fs.existsSync('dist')) fs.mkdirSync('dist')

const pairs = [
  ['public/background.js',  'dist/background.js'],
  ['public/manifest.json',  'dist/manifest.json'],
]

// Copy icon if it exists
if (fs.existsSync('public/icon16.png')) {
  pairs.push(['public/icon16.png', 'dist/icon16.png'])
}

for (const [src, dest] of pairs) {
  const from = path.resolve(__dirname, '..', src)
  const to   = path.resolve(__dirname, '..', dest)
  if (!fs.existsSync(from)) {
    console.error(`❌ Source not found: ${from}`)
    process.exit(1)
  }
  fs.copyFileSync(from, to)
  console.log(`✅ ${src} → ${dest}`)
}
