import {readPanelLabelContent,panelLabelDisplay} from './panel-label-content.mjs?v=panel-content-v0735-1';

export function createPanelLabelEditor({root,getDocument,onApply,onClose=()=>{},mathPreview}){
 const form=root.querySelector('form'),field=name=>form.elements.namedItem(name),preview=root.querySelector('[data-panel-preview]'),error=root.querySelector('[data-panel-error]');
 let session=null;
 const content=()=>({text:field('text').value,subtext:field('subtext').value,parentheses:field('parentheses').checked});
 function sync(event){
  const text=panelLabelDisplay(content());
  preview.textContent=text||'（文字なし）';
  preview.hidden=mathPreview?.show(text?{...session?.object,text,textMode:field('textMode').value,fontSize:Number(field('fontSize').value)}:null,event?.isComposing)??false;
  error.hidden=true;
 }
 function show(object){
  const document=getDocument();
  if(object.type!=='text'||!object.panelLabel||object.locked||document.objects.some(other=>object.groupId&&other.groupId===object.groupId&&other.locked))return;
  session={document,id:object.id,object};
  const saved=readPanelLabelContent(object);
  for(const key of ['text','subtext']){field(key).maxLength=Math.max(200,saved[key].length);field(key).value=saved[key];}
  field('parentheses').checked=saved.parentheses;
  field('textMode').value=object.textMode||'auto';field('fontSize').value=object.fontSize;
  sync();root.showModal();field('text').focus();field('text').select();
 }
 form.addEventListener('input',sync);form.addEventListener('change',sync);
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!session||!form.reportValidity())return;
  try{
   const document=getDocument(),object=document.objects.find(object=>object.id===session.id);
   if(document!==session.document||!object)throw Error('対象のラベルが変わりました。閉じてから選び直してください。');
   if(object.locked||document.objects.some(other=>object.groupId&&other.groupId===object.groupId&&other.locked))throw Error('固定されたラベルは編集できません。');
   onApply(object.id,{content:content(),textMode:field('textMode').value,fontSize:Number(field('fontSize').value)});
   root.close();
  }catch(cause){error.textContent=cause.message;error.hidden=false;}
 });
 root.addEventListener('keydown',event=>{
  if(event.isComposing||event.keyCode===229)return;
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key==='Enter'){event.preventDefault();event.stopPropagation();form.requestSubmit();}
 });
 for(const button of root.querySelectorAll('[data-panel-cancel]'))button.addEventListener('click',()=>root.close());
 root.addEventListener('close',()=>{session=null;mathPreview?.hide();onClose();});
 return {show};
}
