const frames=new WeakMap();
const numbers=value=>String(value??'').trim().split(/[\s,]+/).map(Number);
const valid=box=>box&&[box.x,box.y,box.w,box.h].every(Number.isFinite)&&box.w>0&&box.h>0;

function rectangle(node){
 if(node.localName==='rect'){
  const box={x:Number(node.getAttribute('x')||0),y:Number(node.getAttribute('y')||0),w:Number(node.getAttribute('width')),h:Number(node.getAttribute('height'))};
  return valid(box)?box:null;
 }
 const tokens=String(node.getAttribute('d')||'').match(/[A-Za-z]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)||[];
 if(tokens.filter(token=>/[A-Za-z]/.test(token)&&!Number.isFinite(Number(token))).join('')!=='MLLLz'&&tokens.filter(token=>/[A-Za-z]/.test(token)&&!Number.isFinite(Number(token))).join('')!=='MLLLZ')return null;
 const values=tokens.map(Number).filter(Number.isFinite);
 if(values.length!==8)return null;
 const xs=values.filter((_,i)=>i%2===0),ys=values.filter((_,i)=>i%2===1);
 if(new Set(xs).size!==2||new Set(ys).size!==2||new Set(xs.map((x,i)=>`${x},${ys[i]}`)).size!==4)return null;
 return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}

/** Recover the main Matplotlib axes from both old and newly sent SVGs. */
export function svgPlotFrame(text){
 const xml=new DOMParser().parseFromString(text,'image/svg+xml'),root=xml.documentElement;
 if(xml.querySelector('parsererror')||root.localName!=='svg')return null;
 const view=numbers(root.getAttribute('viewBox'));
 if(view.length!==4||!view.every(Number.isFinite)||view[2]<=0||view[3]<=0)return null;
 const axes=root.querySelector('g[id="axes_1"]');if(!axes)return null;
 // The axes background is still present when its fill or spines are hidden.
 // Unlike a data-series clip, it also exists for unclipped boundary markers.
 const patch=[...axes.children].find(node=>node.localName==='g'&&/^patch_\d+$/.test(node.getAttribute('id')||''));
 const node=patch&&[...patch.children].find(node=>['path','rect'].includes(node.localName));
 if(!node)return null;
 for(let parent=node;parent&&parent!==root;parent=parent.parentElement)if(parent.getAttribute('transform')?.trim())return null;
 const box=rectangle(node);if(!valid(box))return null;
 const normalized={x:(box.x-view[0])/view[2],y:(box.y-view[1])/view[3],w:box.w/view[2],h:box.h/view[3]};
 if(normalized.x<0||normalized.y<0||normalized.x+normalized.w>1.00001||normalized.y+normalized.h>1.00001)return null;
 return normalized;
}

function assetFrame(asset){
 if(!asset||asset.mime!=='image/svg+xml'||typeof asset.dataUrl!=='string')return null;
 if(frames.has(asset))return frames.get(asset);
 let frame=null;
 try{
  const match=/^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/.exec(asset.dataUrl);
  if(match){
   const text=match[1]?new TextDecoder().decode(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))):decodeURIComponent(match[2]);
   frame=svgPlotFrame(text);
  }
 }catch{}
 frames.set(asset,frame);return frame;
}

/** Transform the frame with the image, including Studio resizing and rotation. */
export function plotPanelBounds(object,asset){
 const frame=assetFrame(asset);if(!frame||object.type!=='image')return null;
 const angle=(object.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const corners=[[frame.x,frame.y],[frame.x+frame.w,frame.y],[frame.x+frame.w,frame.y+frame.h],[frame.x,frame.y+frame.h]].map(([x,y])=>{
  const dx=(x-.5)*object.w*(object.flipX?-1:1),dy=(y-.5)*object.h*(object.flipY?-1:1);
  return {x:object.x+object.w/2+dx*c-dy*s,y:object.y+object.h/2+dx*s+dy*c};
 });
 const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y));
 return {x,y,w:Math.max(...corners.map(p=>p.x))-x,h:Math.max(...corners.map(p=>p.y))-y};
}
