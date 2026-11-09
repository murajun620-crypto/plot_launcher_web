import {objectSelectionLabel} from './selection.mjs?v=text-fit-v0710-1';

const icons={image:'▧',text:'T',line:'╱',arrow:'↗',rect:'□',ellipse:'○',curve:'∿',freeform:'⌁',arc:'⌒'};
export function renderGroupLayers({root,doc,ids,groupId=null,onSelect}){
 const document=root.ownerDocument,selected=new Set(ids),seen=new Set(),groupNames=new Map();
 for(const object of doc.objects)if(object.groupId&&!groupNames.has(object.groupId))groupNames.set(object.groupId,`グループ ${groupNames.size+1}`);
 root.replaceChildren();
 function row(object,parent){
  const button=document.createElement('button');button.type='button';button.dataset.id=object.id;
  button.className='layer-row'+(object.groupId?' layer-child':'')+(selected.has(object.id)?' selected':'');button.setAttribute('aria-pressed',String(selected.has(object.id)));
  button.title=object.groupId?'クリックでグループ内を個別選択':'クリックで選択';
  for(const [name,text]of [['layer-kind',icons[object.type]],['layer-name',objectSelectionLabel(object)],['layer-meta',object.locked?'固定':object.groupId?(groupId===object.groupId&&selected.has(object.id)?'個別':'内'):'']]){const span=document.createElement('span');span.className=name;span.textContent=text;button.append(span);}
  button.onclick=event=>onSelect({id:object.id,individual:!!object.groupId,additive:event.shiftKey});parent.append(button);
 }
 for(const object of [...doc.objects].reverse()){
  if(!object.groupId){row(object,root);continue;}
  if(seen.has(object.groupId))continue;seen.add(object.groupId);
  const members=doc.objects.filter(member=>member.groupId===object.groupId),all=members.every(member=>selected.has(member.id))&&!groupId;
  const block=document.createElement('div');block.className='layer-group'+(all?' group-selected':groupId===object.groupId?' group-editing':'');
  const header=document.createElement('button');header.type='button';header.className='layer-group-header';header.dataset.groupId=object.groupId;header.setAttribute('aria-pressed',String(all));header.title='クリックでグループ全体を選択';
  const name=document.createElement('span'),count=document.createElement('span');name.textContent='▣ '+groupNames.get(object.groupId);count.textContent=members.length+'個';count.className='layer-meta';header.append(name,count);
  header.onclick=event=>onSelect({groupId:object.groupId,additive:event.shiftKey});
  const children=document.createElement('div');children.className='layer-group-children';children.setAttribute('role','group');children.setAttribute('aria-label',groupNames.get(object.groupId)+'の内容');
  for(const member of [...members].reverse())row(member,children);block.append(header,children);root.append(block);
 }
 const active=root.querySelector?.('.group-editing .layer-row.selected')||root.querySelector?.('.group-selected .layer-group-header')||root.querySelector?.('.layer-row.selected');
 if(active){const outer=root.getBoundingClientRect(),block=active.closest?.('.layer-group'),target=block&&block.getBoundingClientRect().height<=outer.height?block:active,inner=target.getBoundingClientRect();if(inner.top<outer.top)root.scrollTop+=inner.top-outer.top;else if(inner.bottom>outer.bottom)root.scrollTop+=inner.bottom-outer.bottom;}
}
