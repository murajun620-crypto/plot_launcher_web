import {bounds,expandSelection} from './model.mjs?v=text-fit-v0710-1';

export function resolveObjectSelection(doc,ids,{groupId=null}={}){
 const valid=new Set(ids),objects=doc.objects.filter(object=>valid.has(object.id));
 const inside=!!groupId&&objects.length>0&&objects.every(object=>object.groupId===groupId);
 return {ids:inside?objects.map(object=>object.id):expandSelection(doc,objects.map(object=>object.id)),groupId:inside?groupId:null};
}

export function clickObjectSelection(doc,state,id,{individual=false,additive=false}={}){
 const object=doc.objects.find(object=>object.id===id);if(!object)return resolveObjectSelection(doc,[],{});
 const scope=object.groupId&&(individual||state.groupId===object.groupId)?object.groupId:null;
 let ids=additive?[...state.ids]:[];
 if(scope&&state.groupId!==scope)ids=[];
 const target=scope?[id]:expandSelection(doc,[id]),set=new Set(ids),remove=additive&&target.every(value=>set.has(value));
 for(const value of target)if(remove)set.delete(value);else set.add(value);
 return resolveObjectSelection(doc,[...set],{groupId:scope});
}

export function objectSelectionLabel(object){return object.name||(object.type==='text'?object.text.slice(0,24):{line:'線',arrow:'矢印',rect:'長方形',ellipse:'楕円',image:'画像',curve:'曲線',freeform:'フリーフォーム',arc:'円弧'}[object.type])||'オブジェクト';}
export function selectionDescription(doc,ids,groupId=null){
 const set=new Set(ids),objects=doc.objects.filter(object=>set.has(object.id));
 if(!objects.length)return 'オブジェクトを選択';
 if(groupId)return `グループ内を個別選択 · ${objects.length===1?objectSelectionLabel(objects[0]):objects.length+'個'}`;
 const groups=new Set(objects.map(object=>object.groupId).filter(Boolean)),singles=objects.filter(object=>!object.groupId).length;
 if(groups.size)return `${groups.size}グループ${singles?' ＋ '+singles+'個':''}を選択 · 合計${objects.length}個`;
 return objects.length===1?`選択中：${objectSelectionLabel(objects[0])}`:`${objects.length}個を選択`;
}

/** Select fully enclosed visual units, independent of the drag direction.
 * Groups are selected as a whole only when their combined bounds fit inside.
 * Locked objects may be selected; the editor's transform rules keep them fixed.
 * This function does not mutate the document or selection supplied by the caller.
 */
export function marqueeSelection(doc,start,end,{initialIds=[],additive=false,groupId=null}={}){
 const found=new Set(additive?(groupId?initialIds:expandSelection(doc,initialIds)):[]);
 const left=Math.min(start.x,end.x),right=Math.max(start.x,end.x),top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
 const epsilon=1e-7;
 if(right-left>epsilon&&bottom-top>epsilon){
  const units=new Map();
  for(const object of doc.objects){
   if(groupId&&object.groupId!==groupId)continue;
   const key=!groupId&&object.groupId?`group:${object.groupId}`:`object:${object.id}`;
   if(!units.has(key))units.set(key,[]);
   units.get(key).push(object);
  }
  for(const unit of units.values()){
   const box=bounds(unit);
   if(box.x>=left-epsilon&&box.y>=top-epsilon&&box.x+box.w<=right+epsilon&&box.y+box.h<=bottom+epsilon){
    for(const object of unit)found.add(object.id);
   }
  }
 }
 return doc.objects.filter(object=>found.has(object.id)).map(object=>object.id);
}
