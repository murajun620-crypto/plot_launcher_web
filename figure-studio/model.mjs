import {ARROW_PROPERTIES} from './arrowheads.mjs';
import {isPathObject,validatePathObject} from './paths.mjs';
import {isLineStyle} from './line-styles.mjs';
import {validateGroupHierarchy} from './groups.mjs?v=nested-groups-v0712-1';
export const STROKE_ALIGNMENTS=Object.freeze(['outside','inside','center']);
export const TEXT_MODES=Object.freeze(['auto','tex','plain']);
export const PT_PER_MM=72/25.4;
export const mm=v=>v*PT_PER_MM;
export const toMM=v=>v/PT_PER_MM;
export const uid=()=>globalThis.crypto?.randomUUID?.()||`id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clone=v=>JSON.parse(JSON.stringify(v));
export function newDocument(){return {format:'figure-studio',version:1,id:uid(),name:'Untitled Figure',width:mm(180),height:mm(135),objects:[]};}
export function makeObject(type,props={}){return {id:uid(),type,x:mm(10),y:mm(10),w:mm(40),h:mm(25),rotation:0,opacity:1,fillTransparency:0,strokeTransparency:0,locked:false,groupId:null,stroke:'#263b44',fill:'none',strokeWidth:1,strokeAlignment:'center',...(type==='text'?{text:'Text',textMode:'auto',fontFamily:'Arial',fontSize:9,bold:false,italic:false,underline:false,textAlign:'left',fill:'#172f36',stroke:'none',strokeAlignment:'outside'}:{}),...(type==='arrow'?{arrowEnd:true}:{}),...(type==='curve'?{points:[{x:0,y:1},{x:.5,y:0},{x:1,y:1}],closed:false}:type==='freeform'?{points:[{x:0,y:1},{x:.3,y:.2},{x:.7,y:.8},{x:1,y:0}],closed:false}:type==='arc'?{startAngle:0,endAngle:180,closed:false}:{}),...props};}
export function objectBounds(o){
 const r=(o.rotation||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),cx=o.x+o.w/2,cy=o.y+o.h/2;
 const p=(o.type==='line'||o.type==='arrow'?[[o.x,o.y],[o.x+o.w,o.y+o.h]]:[[o.x,o.y],[o.x+o.w,o.y],[o.x+o.w,o.y+o.h],[o.x,o.y+o.h]]).map(([x,y])=>{const dx=(x-cx)*(o.flipX?-1:1),dy=(y-cy)*(o.flipY?-1:1);return {x:cx+dx*c-dy*s,y:cy+dx*s+dy*c};});
 return {x:Math.min(...p.map(v=>v.x)),y:Math.min(...p.map(v=>v.y)),w:Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x)),h:Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y))};
}
export function bounds(objects){if(!objects.length)return null;const bs=objects.map(objectBounds);const x=Math.min(...bs.map(o=>o.x)),y=Math.min(...bs.map(o=>o.y));return {x,y,w:Math.max(...bs.map(o=>o.x+o.w))-x,h:Math.max(...bs.map(o=>o.y+o.h))-y};}
export function selectionUnits(doc,ids,{individual=false}={}){
 const selected=new Set(individual?ids:expandSelection(doc,ids)),units=new Map(),lockedGroups=new Set(doc.objects.filter(object=>object.locked&&object.groupId).map(object=>object.groupId));
 for(const o of doc.objects){if(!selected.has(o.id))continue;const key=individual?o.id:o.groupId||o.id;if(!units.has(key))units.set(key,[]);units.get(key).push(o);}
 // A group remains one transform unit, including when a member is locked.
 return [...units.values()].filter(unit=>!unit.some(o=>o.locked||lockedGroups.has(o.groupId)));
}
export function expandSelection(doc,ids){const set=new Set(ids),groups=new Set(doc.objects.filter(o=>set.has(o.id)&&o.groupId).map(o=>o.groupId));for(const o of doc.objects)if(o.groupId&&groups.has(o.groupId))set.add(o.id);return [...set];}
export function rotateOrFlip(doc,ids,action,options={}){
 if(!['rotate-right','rotate-left','flip-v','flip-h'].includes(action))return;
 const angle=value=>((value%360)+360)%360;
 for(const unit of selectionUnits(doc,ids,options)){
  const b=bounds(unit),cx=b.x+b.w/2,cy=b.y+b.h/2;
  for(const o of unit){
   const dx=o.x+o.w/2-cx,dy=o.y+o.h/2-cy;let x=dx,y=dy;
   if(action==='rotate-right'){x=-dy;y=dx;o.rotation=angle((o.rotation||0)+90);}
   if(action==='rotate-left'){x=dy;y=-dx;o.rotation=angle((o.rotation||0)-90);}
   if(action==='flip-h'){x=-dx;o.rotation=angle(-(o.rotation||0));o.flipX=!o.flipX;}
   if(action==='flip-v'){y=-dy;o.rotation=angle(-(o.rotation||0));o.flipY=!o.flipY;}
   o.x=cx+x-o.w/2;o.y=cy+y-o.h/2;
  }
 }
}
export function align(doc,ids,mode,target='selection',options={}){
 const units=selectionUnits(doc,ids,options);if(!units.length)return;
 const b=target==='page'?{x:0,y:0,w:doc.width,h:doc.height}:bounds(units.flat());
 for(const unit of units){const q=bounds(unit);let dx=0,dy=0;
 if(mode==='left')dx=b.x-q.x;if(mode==='center')dx=b.x+b.w/2-q.x-q.w/2;if(mode==='right')dx=b.x+b.w-q.x-q.w;
 if(mode==='top')dy=b.y-q.y;if(mode==='middle')dy=b.y+b.h/2-q.y-q.h/2;if(mode==='bottom')dy=b.y+b.h-q.y-q.h;
 for(const o of unit){o.x+=dx;o.y+=dy;}}
}
export function distribute(doc,ids,axis,options={}){const units=selectionUnits(doc,ids,options);if(units.length<3)return;const p=axis==='h'?'x':'y',s=axis==='h'?'w':'h';units.sort((a,b)=>bounds(a)[p]-bounds(b)[p]);const first=bounds(units[0]),last=bounds(units.at(-1));const gap=(last[p]+last[s]-first[p]-units.reduce((sum,u)=>sum+bounds(u)[s],0))/(units.length-1);let pos=first[p];for(const unit of units){const b=bounds(unit),d=pos-b[p];unit.forEach(o=>o[p]+=d);pos+=b[s]+gap;}}
export function reorder(doc,ids,mode,options={}){const set=new Set(selectionUnits(doc,ids,options).flat().map(o=>o.id));if(mode==='front')doc.objects=[...doc.objects.filter(o=>!set.has(o.id)),...doc.objects.filter(o=>set.has(o.id))];if(mode==='back')doc.objects=[...doc.objects.filter(o=>set.has(o.id)),...doc.objects.filter(o=>!set.has(o.id))];if(mode==='forward')for(let i=doc.objects.length-2;i>=0;i--)if(set.has(doc.objects[i].id)&&!set.has(doc.objects[i+1].id))[doc.objects[i],doc.objects[i+1]]=[doc.objects[i+1],doc.objects[i]];if(mode==='backward')for(let i=1;i<doc.objects.length;i++)if(set.has(doc.objects[i].id)&&!set.has(doc.objects[i-1].id))[doc.objects[i],doc.objects[i-1]]=[doc.objects[i-1],doc.objects[i]];}
export function autoLayout(doc,ids,kind='grid',options={}){
 const units=selectionUnits(doc,ids,options);if(!units.length)return;const m=Math.min(mm(8),Math.min(doc.width,doc.height)*.1),W=doc.width-2*m,H=doc.height-2*m;
 const cols=Math.max(1,Math.min(units.length,Math.ceil(Math.sqrt(units.length*W/H)))),rows=Math.ceil(units.length/cols);
 // Preserve positive cells for small pages and large selections.
 const gap=Math.min(mm(5),W/(cols*4),H/((kind==='hero'?units.length:rows)*4));
 units.forEach((unit,i)=>{let cell={x:m+(i%cols)*(W+gap)/cols,y:m+Math.floor(i/cols)*(H+gap)/rows,w:(W-gap*(cols-1))/cols,h:(H-gap*(rows-1))/rows};
 if(kind==='hero'&&units.length>1){cell=i===0?{x:m,y:m,w:W*.56-gap/2,h:H}:{x:m+W*.56+gap/2,y:m+(i-1)*(H+gap)/(units.length-1),w:W*.44-gap/2,h:(H-gap*(units.length-2))/(units.length-1)};}
 const b=bounds(unit),scale=Math.min(cell.w/Math.max(b.w,1),cell.h/Math.max(b.h,1));for(const o of unit){o.x=cell.x+(cell.w-b.w*scale)/2+(o.x-b.x)*scale;o.y=cell.y+(cell.h-b.h*scale)/2+(o.y-b.y)*scale;o.w*=scale;o.h*=scale;}
 });
}
export class History{
 constructor(limit=100){this.limit=limit;this.past=[];this.future=[];}
 push(before,after){if(JSON.stringify(before)===JSON.stringify(after))return false;this.past.push(clone(before));if(this.past.length>this.limit)this.past.shift();this.future=[];return true;}
 undo(current){if(!this.past.length)return current;this.future.push(clone(current));return this.past.pop();}
 redo(current){if(!this.future.length)return current;this.past.push(clone(current));return this.future.pop();}
 reset(){this.past=[];this.future=[];}
}
const types=new Set(['image','text','line','arrow','rect','ellipse','curve','freeform','arc']);
export function validateDocument(input){
 if(input?.format!=='figure-studio'||input.version!==1||!Array.isArray(input.objects)||input.objects.length>3000)throw Error('対応しているFigure Studioプロジェクトではありません。');
 const finite=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
 if(!finite(input.width,mm(10),mm(2000))||!finite(input.height,mm(10),mm(2000)))throw Error('用紙サイズが不正です。');
 const seen=new Set();for(const o of input.objects){
  if(!o||!types.has(o.type)||typeof o.id!=='string'||!o.id||o.id.length>200||seen.has(o.id))throw Error('オブジェクトが不正です。');seen.add(o.id);
  for(const p of ['x','y','w','h'])if(!finite(o[p],-1e6,1e6))throw Error('配置が不正です。');
  if(!['line','arrow'].includes(o.type)&&(o.w<=0||o.h<=0))throw Error('幅と高さは0より大きくしてください。');
  if(isPathObject(o))validatePathObject(o);
  if(o.rotation!==undefined&&!finite(o.rotation,-1e6,1e6))throw Error('角度が不正です。');
  if(o.type==='text'&&(typeof o.text!=='string'||o.text.length>100000||!finite(o.fontSize,1,1000)||(o.fontFamily!==undefined&&(typeof o.fontFamily!=='string'||o.fontFamily.length>500))||(o.textAlign!==undefined&&!['left','center','right','justify'].includes(o.textAlign))))throw Error('テキストが不正です。');
  if(o.textMode!==undefined&&!TEXT_MODES.includes(o.textMode))throw Error('文字の入力形式が不正です。');
  if(!finite(o.opacity??1,0,1)||!finite(o.strokeWidth??1,0,1000))throw Error('書式が不正です。');
  if(o.dashStyle!==undefined&&!isLineStyle(o.dashStyle)||o.dashed!==undefined&&typeof o.dashed!=='boolean')throw Error('線種が不正です。');
  if(o.strokeAlignment!==undefined&&!STROKE_ALIGNMENTS.includes(o.strokeAlignment))throw Error('線の位置は外側・内側・中央から選んでください。');
  for(const p of ['fillTransparency','strokeTransparency'])if(o[p]!==undefined&&!finite(o[p],0,100))throw Error('塗りつぶしと線の透明度は0〜100%で指定してください。');
  for(const p of ['fill','stroke'])if(o[p]&&!/^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|none|transparent)$/i.test(o[p]))throw Error('色が不正です。');
  if(o.groupId!=null&&(typeof o.groupId!=='string'||!o.groupId||o.groupId.length>200))throw Error('グループが不正です。');
  for(const p of ['locked','bold','italic','underline','arrowEnd','arrowStart','flipX','flipY','textAutoSize'])if(o[p]!==undefined&&typeof o[p]!=='boolean')throw Error('書式が不正です。');
  for(const [p,values]of Object.entries(ARROW_PROPERTIES))if(o[p]!==undefined&&!values.includes(o[p]))throw Error('矢印の書式が不正です。');
 }
 validateGroupHierarchy(input.objects);
 const result=clone(input);
 // Older files keep their overall opacity; new independent channels start opaque.
 for(const object of result.objects){object.fillTransparency??=0;object.strokeTransparency??=0;if(object.type==='text'){object.strokeAlignment??='center';object.textMode??='auto';}}
 return result;
}
