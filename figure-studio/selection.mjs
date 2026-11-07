import {bounds,expandSelection} from './model.mjs';

/** Select fully enclosed visual units, independent of the drag direction.
 * Groups are selected as a whole only when their combined bounds fit inside.
 * Locked objects may be selected; the editor's transform rules keep them fixed.
 * This function does not mutate the document or selection supplied by the caller.
 */
export function marqueeSelection(doc,start,end,{initialIds=[],additive=false}={}){
 const found=new Set(additive?expandSelection(doc,initialIds):[]);
 const left=Math.min(start.x,end.x),right=Math.max(start.x,end.x),top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
 const epsilon=1e-7;
 if(right-left>epsilon&&bottom-top>epsilon){
  const units=new Map();
  for(const object of doc.objects){
   const key=object.groupId?`group:${object.groupId}`:`object:${object.id}`;
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
