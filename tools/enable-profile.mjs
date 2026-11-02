// Patch a DSH profile manifest to reference this local plugin.
// Usage: node tools/enable-profile.mjs [--profile desktop] [--home <dir>] [--remove]
import fs from 'node:fs'
import path from 'node:path'

const plugin = 'dsh-task-groups'
const repo = path.resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}
const profileName = flag('profile') ?? 'desktop'
const home = flag('home') ?? process.env.DSH_HOME ?? path.join(process.env.USERPROFILE ?? '', '.dsh')
const profileDir = path.join(home, 'profiles', profileName)
const manifestPath = path.join(profileDir, 'package.json')
// Windows editors (and PowerShell's Set-Content) may leave a UTF-8 BOM.
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/u, ''))
const remove = argv.includes('--remove')
const before = JSON.stringify(manifest)

manifest.dependencies ??= {}
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []

if (remove) {
  delete manifest.dependencies[plugin]
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((id) => id !== plugin)
} else {
  manifest.dependencies[plugin] = `link:${repo.replaceAll('\\', '/')}`
  if (!manifest.dsh.profile.bundles.includes(plugin)) manifest.dsh.profile.bundles.push(plugin)
}

if (JSON.stringify(manifest) !== before) {
  const backup = `${manifestPath}.bak-${new Date().toISOString().replace(/[:.]/gu, '-')}`
  fs.copyFileSync(manifestPath, backup)
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`updated ${manifestPath}\nbackup  ${backup}`)
} else {
  console.log('profile already up to date')
}

const link = path.join(profileDir, 'node_modules', plugin)
if (remove) {
  // A junction is a directory entry; rmdir removes the link, never the target.
  const stat = fs.lstatSync(link, { throwIfNoEntry: false })
  if (stat) fs.rmdirSync(link)
} else if (!fs.existsSync(link)) {
  // A brand-new profile may not have node_modules yet.
  fs.mkdirSync(path.dirname(link), { recursive: true })
  fs.symlinkSync(repo, link, 'junction')
  console.log(`linked ${link} -> ${repo}`)
}
