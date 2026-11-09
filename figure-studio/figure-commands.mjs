import {clone,newDocument,uid} from './model.mjs?v=nested-groups-v0712-1';
import {remapGroupIds} from './groups.mjs?v=nested-groups-v0712-1';

// Book operations keep shared image/source assets intact and form one undo step.
export function deleteFigures(figures,ids,activeId){
 const removed=new Set(ids),index=figures.findIndex(f=>f.id===activeId);
 let next=figures.filter(f=>!removed.has(f.id));
 if(next.length===figures.length)return {figures,activeId};
 if(!next.length){const blank=newDocument(),old=figures[index]||figures[0];blank.name='Fig. 1';blank.width=old.width;blank.height=old.height;next=[blank];}
 const active=next.find(f=>f.id===activeId)||next[Math.min(Math.max(index,0),next.length-1)];
 return {figures:next,activeId:active.id};
}

export function duplicateFigures(figures,ids){
 const selected=new Set(ids),sources=figures.filter(f=>selected.has(f.id));
 if(!sources.length)return {figures,ids:[]};
 if(figures.length+sources.length>100)throw Error('1プロジェクトのFigureは100枚までです');
 const copies=sources.map((f,index)=>{const copy=clone(f);copy.id=uid();copy.name=`${f.name} のコピー`;
  copy.objects.forEach(o=>o.id=uid());remapGroupIds(copy.objects,uid);return copy;
 });
 const at=figures.findLastIndex(f=>selected.has(f.id))+1;
 return {figures:[...figures.slice(0,at),...copies,...figures.slice(at)],ids:copies.map(f=>f.id)};
}
