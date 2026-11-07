/** Apply to a checked-out copy of the appropriate Web repository. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args = process.argv.slice(2), kind = args[0], directory = args[1];
if (!['plot','mifito'].includes(kind) || !directory) {
  console.error('Usage: node integration/apply-bridge.mjs plot|mifito <web-repository-directory>'); process.exit(1);
}
const root = path.resolve(directory), here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(root,'app.js');
let source = await fs.readFile(appPath,'utf8');
if (source.includes('// Figure Studio bridge:')) source=source.slice(0,source.indexOf('// Figure Studio bridge:')).trimEnd()+'\n';
source=source.replace(/^import .*?from ['"]\.\/(?:bridge-host|direct-transfer)\.mjs[^\n]*\n/gm,'');
source=source.replace('if(!await restoreUpdateSession() && !getFigureBridgeContext())await openGalleryProject();','if(!await restoreUpdateSession())await openGalleryProject();');
source=source.replace('if (!await appUpdater.restore() && !getFigureBridgeContext() && galleryProject &&','if (!await appUpdater.restore() && galleryProject &&');
const restore = kind === 'plot'
  ? 'if(!await restoreUpdateSession())await openGalleryProject();'
  : 'if (!await appUpdater.restore() && galleryProject &&';
const replacement = kind === 'plot'
  ? 'if(!await restoreUpdateSession() && !getFigureBridgeContext())await openGalleryProject();'
  : 'if (!await appUpdater.restore() && !getFigureBridgeContext() && galleryProject &&';
const required = kind === 'plot'
  ? ['function readProject(', 'function projectEditState(', 'async function exportFigure(', 'makeProject(', restore]
  : ['async function openProject(', 'function projectUI(', 'createProject(', 'exportImage(', restore];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Source changed; review the adapter before applying. Missing: ${token}`);
}
const hook = await fs.readFile(path.join(here,`${kind}-hook.js.txt`),'utf8');
source = `import {setupFigureBridge,getFigureBridgeContext} from './bridge-host.mjs?v=0.1.0';\nimport {setupDirectSendButton} from './direct-transfer.mjs?v=0.1.0';\n${source.replace(restore,replacement)}\n${hook}\n`;
const syncAnchor=kind==='plot'?'function updateButtons() {':"busy = value; document.body.classList.toggle('busy', value);";
if(!source.includes('figureStudioDirectSender?.sync();'))source=source.replace(syncAnchor,`${syncAnchor}\n  figureStudioDirectSender?.sync();`);
if (kind === 'plot') {
  const start = source.indexOf('async function readProject(file, saved) {'), end = source.indexOf('\nasync function openGalleryProject()',start);
  if (start < 0 || end < 0) throw new Error('Source changed; could not isolate project loader.');
  const block = source.slice(start,end);
  const updated = block.replace('    renderWanted=true;\n','    renderWanted=true; return true;\n').replace("status(`プロジェクトを開けませんでした: ${error.message}`,'error');}","status(`プロジェクトを開けませんでした: ${error.message}`,'error'); return false;}");
  if (!updated.includes('return true;') || !updated.includes('return false;')) throw new Error('Source changed; project error handling needs review.');
  source = source.slice(0,start) + updated + source.slice(end);
}
const host = await fs.readFile(path.join(here,'bridge-host.mjs'),'utf8');
const direct = await fs.readFile(path.join(here,'direct-transfer.mjs'),'utf8');
const build = createHash('sha256').update(source).update(host).update(direct).digest('hex').slice(0,12);
source = source.replace('./bridge-host.mjs?v=0.1.0',`./bridge-host.mjs?v=${build}`);
source = source.replace('./direct-transfer.mjs?v=0.1.0',`./direct-transfer.mjs?v=${build}`);
let index = await fs.readFile(path.join(root,'index.html'),'utf8');
if (!/app\.js\?v=[a-f0-9]+/.test(index)) throw new Error('Source changed; app.js cache version not found.');
index = index.replace(/app\.js\?v=[a-f0-9]+/,`app.js?v=${build}`);
const version = JSON.parse(await fs.readFile(path.join(root,'version.json'),'utf8')); version.build = build;
let updater;
if (kind === 'plot') source = source.replace(/const APP_BUILD = "[a-f0-9]+";/,`const APP_BUILD = "${build}";`);
else {
  updater = await fs.readFile(path.join(root,'app-update.js'),'utf8');
  updater = updater.replace(/export const APP_BUILD = '[a-f0-9]+';/,`export const APP_BUILD = '${build}';`);
  source = source.replace(/app-update\.js\?v=[a-f0-9]+/,`app-update.js?v=${build}`);
}
await fs.copyFile(appPath,path.join(root,'app.js.before-figure-bridge'));
await fs.writeFile(path.join(root,'bridge-host.mjs'),host,'utf8');
await fs.writeFile(path.join(root,'direct-transfer.mjs'),direct,'utf8');
await fs.writeFile(appPath,source,'utf8');
await fs.writeFile(path.join(root,'index.html'),index,'utf8');
await fs.writeFile(path.join(root,'version.json'),JSON.stringify(version)+'\n','utf8');
if (updater) await fs.writeFile(path.join(root,'app-update.js'),updater,'utf8');
console.log(`Installed ${kind} adapter in ${root}. Check app.js and bridge-host.mjs before deploying.`);
