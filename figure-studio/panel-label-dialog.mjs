import {mm} from './model.mjs?v=nested-groups-v0712-1';
import {panelLabelUnits,panelLabelText} from './panel-labels.mjs?v=panel-labels-v0722-1';

export function createPanelLabelDialog({root,getDocument,getSelection,onApply,onClose=()=>{}}){
 const form=root.querySelector('form'),field=name=>form.elements.namedItem(name),summary=root.querySelector('[data-panel-summary]'),preview=root.querySelector('[data-panel-preview]'),error=root.querySelector('[data-panel-error]'),apply=root.querySelector('[type="submit"]');
 let openedDocument=null,ids=[];
 function sync(){
  const units=panelLabelUnits(openedDocument,ids,{scope:field('scope').value});
  const groups=units.filter(({unit})=>unit.filter(object=>object.type==='image').length>1).length;
  summary.textContent=`${units.length}パネル${groups?`（複数画像のグループ ${groups}組を含む）`:''} · 左上から右、次の行の順に付けます。`;
  const start=Number(field('start').value)||1;
  preview.textContent=units.length?Array.from({length:Math.min(units.length,6)},(_,i)=>panelLabelText(start+i,field('style').value)).join('　')+(units.length>6?'　…':''):'画像または画像グループを選択してください。';
  apply.disabled=!units.length;error.hidden=true;
 }
 function show(){
  openedDocument=getDocument();ids=[...getSelection()];
  const selected=panelLabelUnits(openedDocument,ids).length;
  field('scope').querySelector('[value="selection"]').disabled=!selected;
  field('scope').value=selected?'selection':'all';
  sync();root.showModal();field('scope').focus();
 }
 form.addEventListener('input',sync);form.addEventListener('change',sync);
 form.addEventListener('submit',event=>{
  event.preventDefault();if(apply.disabled||!form.reportValidity())return;
  try{
   if(getDocument()!==openedDocument)throw Error('対象のFigureが変わりました。閉じてから選び直してください。');
   onApply(ids,{scope:field('scope').value,style:field('style').value,start:Number(field('start').value),fontSize:Number(field('fontSize').value),bold:field('bold').checked,gap:mm(Number(field('gap').value)),position:field('position').value});
   root.close();
  }catch(cause){error.textContent=cause.message;error.hidden=false;}
 });
 for(const button of root.querySelectorAll('[data-panel-cancel]'))button.addEventListener('click',()=>root.close());
 root.addEventListener('close',()=>{openedDocument=null;ids=[];onClose();});
 return {show};
}
