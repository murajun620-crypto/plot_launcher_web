export const MAX_GROUP_DEPTH=50;
export const groupPath=object=>object.groupId?[...(object.groupStack??[]),object.groupId]:[];

/** Keep inner groups when adding one common outer group. */
export function regroupObjects(objects,id){
 if(objects.some(object=>groupPath(object).length>=MAX_GROUP_DEPTH))throw Error(`グループは${MAX_GROUP_DEPTH}階層までです。`);
 for(const object of objects){
  if(object.groupId)object.groupStack=[...(object.groupStack??[]),object.groupId];
  object.groupId=id;
 }
}

/** Release one outer level, or every level of the selected groups. */
export function ungroupObjects(objects,{all=false}={}){
 for(const object of objects){
  if(!object.groupId)continue;
  const stack=all?[]:[...(object.groupStack??[])];
  object.groupId=stack.pop()??null;
  if(stack.length)object.groupStack=stack;else delete object.groupStack;
 }
}

/** Copies receive independent IDs at every level, retaining shared children. */
export function remapGroupIds(objects,createId){
 const ids=new Map(),remap=id=>{if(!ids.has(id))ids.set(id,createId());return ids.get(id);};
 for(const object of objects){
  if(object.groupId)object.groupId=remap(object.groupId);
  if(object.groupStack?.length)object.groupStack=object.groupStack.map(remap);
 }
}

export function validateGroupHierarchy(objects){
 const parents=new Map(),valid=id=>typeof id==='string'&&id.length>0&&id.length<=200;
 for(const object of objects){
  const stack=object.groupStack??[];
  if(object.groupStack!==undefined&&!Array.isArray(object.groupStack)||stack.length>=MAX_GROUP_DEPTH||stack.length&&!object.groupId)throw Error('グループの階層が不正です。');
  const path=groupPath(object);
  if(path.some(id=>!valid(id))||new Set(path).size!==path.length)throw Error('グループの階層が不正です。');
  for(let i=0;i<path.length;i++){
   const id=path[i],parent=path[i+1]??null;
   if(parents.has(id)&&parents.get(id)!==parent)throw Error('子グループの所属先が一致しません。');
   parents.set(id,parent);
  }
 }
}
