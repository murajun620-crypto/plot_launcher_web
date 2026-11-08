import {mm} from './model.mjs?v=image-array-v073-1';
import {inferImageArray} from './image-array.mjs?v=image-array-v073-1';

export function createImageArrayDialog({root,getDocument,getSelection,onApply,onClose=()=>{}}){
 const form=root.querySelector('form'),horizontal=root.querySelector('[name="horizontalGap"]'),vertical=root.querySelector('[name="verticalGap"]'),summary=root.querySelector('[data-array-summary]'),error=root.querySelector('[data-array-error]'),apply=root.querySelector('[type="submit"]');
 let openedDocument=null,ids=[],lastGaps={horizontal:2,vertical:2};
 function show(){
  openedDocument=getDocument();ids=[...getSelection()];
  const layout=inferImageArray(openedDocument,ids);
  summary.textContent=layout.items.length>=2?`${layout.items.length}組の画像 · ${layout.rows.length}行 × ${layout.columns.length}列（現在の並びを保持）`:'画像を複数選択してから実行してください。';
  error.textContent=layout.error||'';error.hidden=!layout.error;apply.disabled=!!layout.error;
  horizontal.value=String(lastGaps.horizontal);vertical.value=String(lastGaps.vertical);
  root.showModal();horizontal.focus();horizontal.select();
 }
 function submit(event){
  event.preventDefault();if(apply.disabled||!form.reportValidity())return;
  try{
   if(getDocument()!==openedDocument)throw Error('対象のFigureが変わりました。閉じてから画像を選び直してください。');
   const h=horizontal.valueAsNumber,v=vertical.valueAsNumber;
   if(!Number.isFinite(h)||!Number.isFinite(v)||h<0||v<0)throw Error('隙間は0以上の数値で指定してください。');
   onApply(ids,{horizontalGap:mm(h),verticalGap:mm(v)});
   lastGaps={horizontal:h,vertical:v};root.close();
  }catch(cause){error.textContent=cause.message;error.hidden=false;}
 }
 form.addEventListener('submit',submit);
 for(const button of root.querySelectorAll('[data-array-cancel]'))button.addEventListener('click',()=>root.close());
 root.addEventListener('close',()=>{openedDocument=null;ids=[];onClose();});
 return {show};
}
