/**
 * Hook electron-builder (afterSign) : donne à l'app macOS une identité de
 * signature stable d'une version à l'autre.
 *
 * Sans certificat Apple, l'app est signée « ad hoc » : macOS l'identifie alors
 * par l'empreinte exacte de son binaire (exigence `cdhash H"…"`). Or la mise à
 * jour automatique (Squirrel.Mac) n'accepte une nouvelle version que si elle
 * satisfait l'exigence de la version installée : avec une empreinte, aucune
 * nouvelle version ne passe, et la mise à jour s'arrête à 100 % sans bouton.
 *
 * On re-signe donc le paquet (ad hoc, signatures internes conservées) avec une
 * exigence fondée sur l'identifiant de l'app. L'intégrité de la mise à jour
 * reste vérifiée par electron-updater (HTTPS + sha512 publié avec la release).
 * Un certificat Developer ID rendrait ce hook inutile.
 */
const path = require('node:path')
const { execFileSync } = require('node:child_process')

exports.default = async function macStableSignature(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const appId = context.packager.appInfo.id
  execFileSync('codesign', [
    '--force',
    '--sign', '-',
    '--identifier', appId,
    '--preserve-metadata=entitlements,flags',
    `-r=designated => identifier "${appId}"`,
    appPath,
  ], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--strict', '--deep', appPath], { stdio: 'inherit' })
  const requirement = execFileSync('codesign', ['-d', '-r-', appPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (!requirement.includes(`identifier "${appId}"`)) {
    throw new Error(`Signature macOS : exigence inattendue pour ${appPath} : ${requirement}`)
  }
}
