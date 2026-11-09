const nonempty=value=>typeof value==='string'&&value.length>0;
const validFingerprint=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

/** Plan by persistent project/image identity, never by image order or filename.
 * `fingerprint` in linked/matched entries describes the existing Studio preview.
 * No document, panel, source reference, or descriptor is changed here.
 */
export function planMiFiToSync(figures,batch,identityByAsset=new Map(),{anchorPanelId,app='mifito',addOnly=false}={}){
 if(!nonempty(batch?.projectId)||!Array.isArray(batch.images))throw Error('MiFiToの同期情報が正しくありません。');
 const incoming=new Map();
 for(const image of batch.images){
  if(!nonempty(image?.imageId)||!validFingerprint(image.fingerprint)||incoming.has(image.imageId))throw Error('MiFiToの画像識別情報が正しくありません。');
  incoming.set(image.imageId,image);
 }
 if(addOnly)return {matches:[],linked:[],additions:[...batch.images],summary:{updated:0,added:batch.images.length,unchanged:0}};
 const matches=[],linked=[],matchedIds=new Set(),changedIds=new Set();
 for(const figure of figures)for(const panel of figure.objects){
  const source=panel.source;
  if(panel.type!=='image'||source?.app!==app||!nonempty(source.assetId))continue;
  const identity=identityByAsset.get(source.assetId);
  const explicit=source.projectId!==undefined||source.imageId!==undefined;
  // A partially present identity must not fall back into a different project.
  if(explicit&&(!nonempty(source.projectId)||!nonempty(source.imageId)))continue;
  const projectId=explicit?source.projectId:identity?.projectId;
  const imageId=explicit?source.imageId:identity?.activeImageId;
  if(projectId!==batch.projectId||!nonempty(imageId))continue;
  // Reject stale metadata if its actual project no longer contains the image.
  if(identity&&identity.projectId!==projectId)continue;
  const descriptor=identity?.images?.find(image=>image.imageId===imageId);
  if(identity&&!descriptor)continue;
  if(!explicit&&(!descriptor||descriptor.ambiguous&&panel.id!==anchorPanelId))continue;
  const fingerprint=validFingerprint(source.fingerprint)?source.fingerprint:validFingerprint(descriptor?.fingerprint)?descriptor.fingerprint:null;
  // An unchanged acknowledgement belongs to this source editor's own snapshot.
  // A different Studio preview may have been edited in another source window;
  // retain it unless this sender explicitly has a new edit to apply.
  const image=incoming.get(imageId),changed=!!image&&image.unchanged!==true&&fingerprint!==image.fingerprint;
  const entry={figureId:figure.id,panelId:panel.id,sourceAssetId:source.assetId,projectId,imageId,fingerprint,changed};
  linked.push({...entry,image:descriptor||{imageId,name:panel.name,fingerprint}});
  if(!image)continue;
  matches.push({...entry,image});matchedIds.add(imageId);if(changed)changedIds.add(imageId);
 }
 const additions=batch.images.filter(image=>!matchedIds.has(image.imageId));
 return {matches,linked,additions,summary:{updated:changedIds.size,added:additions.length,unchanged:matchedIds.size-changedIds.size}};
}
