const fs = require('node:fs')
const p = 'C:/Users/Administrator/AppData/Local/Programs/DSH NEXT/resources/app.asar'
const s = fs.readFileSync(p, 'utf8')
for (const probe of ['awesome-dsh-plugin', 'dsh-community-market', 'dsh-market']) {
  let at = -1
  let n = 0
  while ((at = s.indexOf(probe, at + 1)) >= 0 && n < 3) {
    n += 1
    console.log('===', probe, at)
    console.log(s.slice(Math.max(0, at - 700), at + 700).replace(/\s+/g, ' ').slice(0, 1400))
  }
  if (n === 0) console.log('===', probe, 'none')
}
