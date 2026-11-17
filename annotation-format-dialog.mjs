import {formatTargets,formatFieldApplies,annotationFormatValue} from './annotation-format.mjs?v=9f854dcf3d6f';

export function createAnnotationFormatDialog({root,button,getAnnotations,getSelected,getContext,getIdentity,getFonts,isBusy,onApply,onOpen=()=>{},onShow=()=>{},onClose=()=>{}}){
 const form=root.querySelector('form'),fields=[...root.querySelectorAll('[data-format-field]')],summary=root.querySelector('[data-format-summary]'),error=root.querySelector('[data-format-error]'),submit=root.querySelector('[type=submit]');
 let session=null,patch={};
 function sync(){const count=formatTargets(getAnnotations(),getSelected()).length;button.disabled=isBusy()||!count;button.textContent=count>1?`注釈の一括設定（${count}）`:'注釈の設定';}
 function show(){
  if(isBusy())return;onOpen();
  const targets=formatTargets(getAnnotations(),getSelected());if(!targets.length)return;
  session={annotations:getAnnotations(),ids:targets.map(item=>item.id),identity:getIdentity(),context:getContext()};patch={};error.hidden=true;submit.disabled=true;
  const counts=type=>targets.filter(item=>item.type===type).length;
  summary.textContent=`対象 ${targets.length}個：文字 ${counts('text')}・線 ${counts('segment')}・矢印 ${counts('arrow')}。変更した項目だけを適用します。`;
  for(const group of root.querySelectorAll('[data-format-kind]'))group.hidden=!targets.some(item=>group.dataset.formatKind==='line'?item.type!=='text':item.type===group.dataset.formatKind);
  const fonts=fields.find(field=>field.dataset.formatField==='font_family');
  fonts.replaceChildren(...[...new Set([...getFonts(),...targets.filter(item=>item.type==='text').map(item=>item.font_family)].filter(Boolean))].map(name=>new Option(name,name)));
  for(const field of fields){
   const key=field.dataset.formatField,items=targets.filter(item=>formatFieldApplies(item,key));field.disabled=!items.length;
   field.querySelector?.('[data-mixed-option]')?.remove();
   if(!items.length)continue;
   const values=items.map(item=>annotationFormatValue(item,key,session.context)),first=values[0],mixed=values.some(value=>value!==first);
   field.dataset.mixed=String(mixed);field.dataset.edited='false';
   if(field.type==='checkbox'){field.checked=!!first;field.indeterminate=mixed;}
   else if(field.tagName==='SELECT'){
    if(mixed){const option=new Option('混在（変更しない）','');option.disabled=true;option.dataset.mixedOption='true';field.add(option,0);}field.value=mixed?'':String(first);
   }else{field.value=mixed&&!['color','range'].includes(field.type)?'':String(first);field.placeholder=mixed?'混在（変更しない）':'';}
  }
  const opacity=fields.find(field=>field.dataset.formatField==='opacity'),output=root.querySelector('[data-format-opacity]');
  output.textContent=opacity.dataset.mixed==='true'?'混在':`${Math.round(Number(opacity.value)*100)}%`;
  root.showModal();onShow();
 }
 function input(event){
  const field=event.target.closest('[data-format-field]');if(!field||!session||field.disabled)return;
  const key=field.dataset.formatField;
  field.dataset.edited='true';
  if(field.value===''||!field.checkValidity()){delete patch[key];}
  else{patch[key]=field.type==='checkbox'?field.checked:['number','range'].includes(field.type)?Number(field.value):field.value;field.dataset.mixed='false';}
  if(key==='opacity')root.querySelector('[data-format-opacity]').textContent=`${Math.round(Number(field.value)*100)}%`;
  error.hidden=true;submit.disabled=!Object.keys(patch).length;
 }
 form.addEventListener('input',input);form.addEventListener('change',input);
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!session||submit.disabled)return;
  const invalid=fields.find(field=>!field.disabled&&field.dataset.edited==='true'&&field.value!==''&&!field.checkValidity());
  if(invalid){invalid.reportValidity();return;}
  try{
   const identity=getIdentity();
   if(getAnnotations()!==session.annotations||identity.source!==session.identity.source||identity.sheet!==session.identity.sheet)throw Error('対象のグラフが変わりました。閉じてから選び直してください。');
   onApply(session.ids,{...patch},session.context);root.close();
  }catch(cause){error.textContent=cause.message;error.hidden=false;}
 });
 for(const close of root.querySelectorAll('[data-format-close]'))close.addEventListener('click',()=>root.close());
 root.addEventListener('close',()=>{session=null;patch={};sync();onClose();});
 button.addEventListener('click',show);
 return {show,sync,get dirty(){return !!session&&Object.keys(patch).length>0;}};
}
