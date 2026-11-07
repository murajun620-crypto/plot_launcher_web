/** Stable MiFiTo image identities shared by the editor and Figure Studio. */
const MAGIC=new TextEncoder().encode('MiFiTo\r\n'),HEADER_BYTES=MAGIC.length+4;
const MANIFEST_LIMIT=8*1024*1024,DATA_LIMIT=256*1024*1024;
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{16,100}$/.test(value);
const fail=()=>{throw Error('MiFiToプロジェクトの画像情報が正しくありません。');};
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;

function validate(data){
 if(data?.application!=='MiFiTo'||data.version!==1||!Array.isArray(data.images)||!data.images.length||data.images.length>100||!Number.isInteger(data.activeIndex)||!data.images[data.activeIndex]||!data.ui||typeof data.ui!=='object')fail();
 if(data.ui.figureStudioProjectId!==undefined&&!id(data.ui.figureStudioProjectId))fail();
 const seen=new Set();let bytes=0;
 for(const image of data.images){
  if(!image||typeof image.name!=='string'||!image.name||image.name.length>255||/[\\/\x00-\x1f]/.test(image.name)||!/^[a-f0-9]{64}$/.test(image.sha256)||!Number.isSafeInteger(image.bytes)||image.bytes<=0||image.bytes>128*1024*1024||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<=0||image.height<=0||image.width>16384||image.height>16384||image.width*image.height>64000000||!image.settings||typeof image.settings!=='object'||Array.isArray(image.settings))fail();
  if(image.figureStudioImageId!==undefined){if(!id(image.figureStudioImageId)||seen.has(image.figureStudioImageId))fail();seen.add(image.figureStudioImageId);}
  bytes+=image.bytes;
 }
 if(bytes>DATA_LIMIT)fail();return bytes;
}

export async function identifyManifest(data){
 validate(data);
 const keys=data.images.map(image=>JSON.stringify([image.sha256,image.name,image.width,image.height]));
 const counts=new Map();for(const key of keys)counts.set(key,(counts.get(key)||0)+1);
 const projectId=data.ui.figureStudioProjectId||`legacy-project-${await hash(JSON.stringify([...keys].sort()))}`;
 const occurrences=new Map(),resolvedIds=new Set(),images=[];
 for(const [index,image]of data.images.entries()){
  const key=keys[index],occurrence=(occurrences.get(key)||0)+1;occurrences.set(key,occurrence);
  const imageId=image.figureStudioImageId||`legacy-image-${await hash(key)}-${occurrence}`;
  if(resolvedIds.has(imageId))fail();resolvedIds.add(imageId);
  // Only committed rendering settings affect the SVG. Selection, pending crop
  // controls and export-list/PPT/PNG choices must not trigger image updates.
  const {cropOptions,...settings}=image.settings;
  if(settings.output){const {dpi,pptEditable,pptIncludeLabel,...output}=settings.output;settings.output=output;}
  const fingerprint=await hash(JSON.stringify(stable({source:image.sha256,width:image.width,height:image.height,settings})));
  images.push({imageId,name:image.name,fingerprint,...(!image.figureStudioImageId&&counts.get(key)>1?{ambiguous:true}:{})});
 }
 return {projectId,activeImageId:images[data.activeIndex].imageId,images,legacy:!data.ui.figureStudioProjectId||data.images.some(image=>!image.figureStudioImageId)};
}

export async function readMifitoIdentity(blob){
 if(!(blob instanceof Blob)||blob.size<HEADER_BYTES||blob.size>HEADER_BYTES+MANIFEST_LIMIT+DATA_LIMIT)fail();
 const header=new Uint8Array(await blob.slice(0,HEADER_BYTES).arrayBuffer());
 if(!MAGIC.every((byte,index)=>byte===header[index]))fail();
 const length=new DataView(header.buffer).getUint32(MAGIC.length,true);
 if(length<=0||length>MANIFEST_LIMIT||HEADER_BYTES+length>blob.size)fail();
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await blob.slice(HEADER_BYTES,HEADER_BYTES+length).arrayBuffer()));}catch{fail();}
 if(HEADER_BYTES+length+validate(data)!==blob.size)fail();
 return identifyManifest(data);
}

// A single-image acknowledgement cannot mark edits to other images as synced.
// Keep File references from the exact captured snapshot, never the live editor.
export function mergeMifitoBaseline(baseline,captured,batch=false){
 if(!captured)return baseline;if(batch)return captured;if(!baseline)return null;
 const before=JSON.parse(baseline.content),after=JSON.parse(captured.content);
 const oldIndex=before.images.findIndex(image=>image.id===captured.activeId),newIndex=after.images.findIndex(image=>image.id===captured.activeId);
 if(oldIndex<0||newIndex<0)return baseline;
 before.images[oldIndex]=after.images[newIndex];
 const files=[...baseline.files];files[oldIndex]=captured.files[newIndex];
 return {...baseline,content:JSON.stringify(before),activeId:captured.activeId,files};
}

// These are receipt checkpoints, not load checkpoints. Another editor tab may
// have newer Studio content, so replaying our last accepted image is a no-op.
export function createMifitoAcknowledgements(){
 const accepted=new Map();
 const key=(projectId,imageId)=>`${projectId}\0${imageId}`;
 return {
  isUnchanged(projectId,image){const token=key(projectId,image.imageId);return accepted.has(token)&&accepted.get(token)===image.fingerprint;},
  accept(result){
   const projectId=result?.batch?.projectId||result?.image?.projectId;
   const images=result?.batch?.images||(result?.image?[result.image]:[]);
   if(!id(projectId))return;
   for(const image of images)if(id(image.imageId)&&/^[a-f0-9]{64}$/.test(image.fingerprint))accepted.set(key(projectId,image.imageId),image.fingerprint);
  }
 };
}
