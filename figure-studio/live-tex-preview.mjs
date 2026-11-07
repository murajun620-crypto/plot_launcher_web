export function createLiveTexPreview({renderer,root,svg,status,sourceSlot,paint,el,documentRef=globalThis.document,delay=120,onPosition=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let timer=null,generation=0,fingerprint=null,currentKey=null,lastGood=null,visible=false,source='canvas',composing=false;
 function label(text,state){status.textContent=text;status.title='';root.dataset.state=state;}
 function render(object,layout){
  const copy={...object,x:0,y:0,rotation:0},width=Math.max(1,object.w,layout?.width??0),height=Math.max(object.fontSize*1.5,layout?.height??object.h);
  const group=el('g',{opacity:object.opacity??1});group.append(...paint(copy,{el,layout,uniqueId:'tex-live'}));
  svg.setAttribute('viewBox',`-4 -4 ${width+8} ${height+8}`);svg.replaceChildren(group);lastGood={object:copy,layout};
 }
 async function updatePreview(object,token){
  if(token!==generation||!visible||composing)return;
  if(!renderer.hasMath(object)&&object.textMode!=='plain'&&/\$|\\[([]/.test(object.text)){
   label('入力中…最後のプレビューを表示','pending');return;
  }
  try{await renderer.prepare([object]);if(token!==generation||!visible)return;render(object,renderer.getLayout(object));label('プレビュー','ready');}
  catch(error){if(token!==generation||!visible)return;label(lastGood?'入力中…最後のプレビューを表示':'式を入力してください','incomplete');status.title=error.message;}
 }
 function show(object,{source:nextSource='canvas',composition=false}={}){
  visible=true;source=nextSource;root.hidden=false;root.dataset.source=source;sourceSlot.hidden=source!=='canvas';composing=composition;
  currentKey=renderer.key(object);const next=JSON.stringify(object);
  if(next!==fingerprint){fingerprint=next;generation++;if(timer!==null)clearTimer(timer);label('更新中…','pending');const token=generation,copy={...object};if(!composing)timer=setTimer(()=>{timer=null;updatePreview(copy,token);},delay);}
  else if(!composing&&timer===null&&root.dataset.state==='pending'){const token=generation,copy={...object};timer=setTimer(()=>{timer=null;updatePreview(copy,token);},delay);}
  onPosition();
 }
 function hide(){visible=false;generation++;fingerprint=null;currentKey=null;lastGood=null;if(timer!==null)clearTimer(timer);timer=null;root.hidden=true;svg.replaceChildren();}
 return {show,hide,ownsKey:key=>visible&&key===currentKey,get visible(){return visible;},get source(){return source;},position:onPosition,destroy:hide};
}
