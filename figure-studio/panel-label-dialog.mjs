import {panelLabelDisplay,readPanelLabelContent} from './panel-label-content.mjs?v=panel-content-v0735-1';
import {hasTexMath} from './tex.mjs?v=panel-label-tex-v0737-1';
import {mm} from './model.mjs?v=panel-content-v0735-1';
import {panelLabelUnits,panelLabelText} from './panel-labels.mjs?v=panel-label-tex-v0737-1';

export function createPanelLabelDialog({root,getDocument,getSelection,onApply,onClose=()=>{},mathPreview}){
 const form=root.querySelector('form'),field=name=>form.elements.namedItem(name),summary=root.querySelector('[data-panel-summary]'),preview=root.querySelector('[data-panel-preview]'),error=root.querySelector('[data-panel-error]'),apply=root.querySelector('[type="submit"]');
 let openedDocument=null,ids=[];
 function numbering(){return {start:Number(field('start').value)||1,parent:field('parent').value,mode:field('mode').value,startLetter:field('startLetter').value,prefix:field('prefix').value,separator:field('separator').value,uppercase:field('uppercase').checked,parentheses:field('parentheses').checked};}
 function sync(event){
  const units=panelLabelUnits(openedDocument,ids,{scope:field('scope').value});
  const groups=units.filter(({unit})=>unit.filter(object=>object.type==='image').length>1).length;
  summary.textContent=`${units.length}パネル${groups?`（複数画像のグループ ${groups}組を含む）`:''} · 左上から右、次の行の順に付けます。`;
  const style=field('style').value;root.querySelector('[data-panel-branch]').hidden=!style.startsWith('branch-');root.querySelector('[data-panel-custom]').hidden=style!=='custom';preview.style.fontWeight=field('bold').checked?'700':'400';
  const samples=style==='none'?[]:units.slice(0,6).map(({unit},index)=>{
   const text=panelLabelText(index+1,style,numbering()),previous=unit.find(object=>object.panelLabel&&object.type==='text');
   const subtext=field('subtext').value.trim()||(previous?readPanelLabelContent(previous).subtext:'');
   return panelLabelDisplay({text,subtext,parentheses:text.startsWith('(')&&text.endsWith(')')});
  });
  const fontSize=Number(field('fontSize').value),textMode=field('textMode').value,bold=field('bold').checked;
  const mathSample=samples.find(text=>hasTexMath({type:'text',text,textMode}));
  preview.hidden=mathPreview?.show(mathSample===undefined?null:{text:mathSample,textMode,bold,fontSize},event?.isComposing)??false;
  preview.textContent=style==='none'?'パネルラベルを取り除きます。':samples.length?samples.join('　')+(units.length>6?'　…':''):'画像または画像グループを選択してください。';
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
   onApply(ids,{scope:field('scope').value,style:field('style').value,start:Number(field('start').value),numbering:numbering(),subtext:field('subtext').value.trim()||undefined,textMode:field('textMode').value,fontSize:Number(field('fontSize').value),bold:field('bold').checked,gap:mm(Number(field('gap').value)),position:field('position').value});
   root.close();
  }catch(cause){error.textContent=cause.message;error.hidden=false;}
 });
 for(const button of root.querySelectorAll('[data-panel-cancel]'))button.addEventListener('click',()=>root.close());
 root.addEventListener('close',()=>{openedDocument=null;ids=[];mathPreview?.hide();onClose();});
 return {show};
}
