import {bounds,objectBounds} from './model.mjs?v=group-selection-v078-1';
import {selectionDescription} from './selection.mjs?v=group-selection-v078-1';

export function drawSelectionFrames({root,doc,ids,groupId=null,scale,editableIds,el}){
 const set=new Set(ids),all=doc.objects.filter(object=>set.has(object.id)),box=bounds(all),u=1/scale;
 const grouped=all.some(object=>object.groupId),locked=all.length>0&&!editableIds.length,ink=locked?'#6a7583':groupId?'#146bd1':grouped?'#7a45bf':'#146bd1';
 root.setAttribute('data-selection-mode',groupId?'member':grouped?'group':'object');
 if(groupId){const context=bounds(doc.objects.filter(object=>object.groupId===groupId));if(context)root.append(el('rect',{x:context.x,y:context.y,width:context.w,height:context.h,fill:'none',stroke:'#718096','stroke-width':1.4*u,'stroke-dasharray':`${6*u} ${4*u}`,'pointer-events':'none','data-frame-role':'group-context'}));}
 if(!box)return {box,ink,u};
 for(const object of all){const b=objectBounds(object);root.append(el('rect',{x:b.x,y:b.y,width:Math.max(b.w,u),height:Math.max(b.h,u),fill:'none',stroke:ink,'stroke-opacity':.65,'stroke-width':u,'stroke-dasharray':`${3*u} ${3*u}`,'pointer-events':'none','data-frame-role':'object-member'}));}
 const frame={x:box.x,y:box.y,width:Math.max(box.w,u),height:Math.max(box.h,u),'pointer-events':'none'};
 root.append(el('rect',{...frame,fill:'none',stroke:'#fff','stroke-width':4*u}),el('rect',{...frame,fill:groupId?'#146bd109':'none',stroke:ink,'stroke-width':2*u,'data-frame-role':'selection'}));
 const text=(groupId?'個別選択：'+(all.length===1?(all[0].name||{image:'画像',text:'文字',arrow:'矢印',line:'線',rect:'図形'}[all[0].type]||'オブジェクト'):all.length+'個'):selectionDescription(doc,ids))+(locked?' · 固定':'');
 const tag=el('g',{'pointer-events':'none','data-frame-role':'label'}),width=Math.min(300,text.length*9+16)*u;
 tag.append(el('rect',{x:box.x,y:box.y-23*u,width,height:19*u,rx:3*u,fill:ink,stroke:'#fff','stroke-width':u}),el('text',{x:box.x+7*u,y:box.y-10*u,'font-size':10*u,'font-family':'Arial, sans-serif',fill:'#fff'},text));root.append(tag);
 return {box,ink,u};
}
