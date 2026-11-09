import {mm} from './model.mjs?v=nested-groups-v0712-1';
import {inferImageArray} from './image-array.mjs?v=nested-groups-v0712-1';

export function createImageArrayDialog({root,getDocument,getSelection,getSelectionOptions=()=>({}),onApply,onClose=()=>{}}){
 const form=root.querySelector('form'),horizontal=root.querySelector('[name="horizontalGap"]'),vertical=root.querySelector('[name="verticalGap"]'),separate=root.querySelector('[name="separateGaps"]'),verticalField=root.querySelector('[data-array-vertical-field]'),horizontalLabel=root.querySelector('[data-array-horizontal-label]'),summary=root.querySelector('[data-array-summary]'),note=root.querySelector('[data-array-note]'),error=root.querySelector('[data-array-error]'),apply=root.querySelector('[type="submit"]');
 let openedDocument=null,ids=[],selectionOptions={},lastGaps={horizontal:1,vertical:1,separate:false};
 function syncGaps(){
  const split=separate.checked;verticalField.hidden=!split;vertical.disabled=!split;
  horizontalLabel.textContent=split?'横の隙間':'縦横の隙間';horizontal.setAttribute('aria-label',split?'横の隙間 mm':'縦横の隙間 mm');
  if(!split)vertical.value=horizontal.value;
 }
 function show(){
  openedDocument=getDocument();ids=[...getSelection()];selectionOptions={...getSelectionOptions()};
  const layout=inferImageArray(openedDocument,ids,selectionOptions);
  const target=layout.withinGroup?`グループ内の画像 ${layout.items.length}枚`:layout.mixed?`個別画像 ${layout.imageUnitCount}枚 ＋ グループ ${layout.groupUnitCount}組`:layout.groupCount?`グループ単位 ${layout.items.length}組`:`画像 ${layout.items.length}枚`;
  summary.textContent=layout.items.length>=2?`${target} · ${layout.rows.length}行 × ${layout.columns.length}列（現在の並びを保持）`:'画像を複数選択してから実行してください。';
  note.textContent=(layout.withinGroup?'グループ化を保ち、画像を個別に動かします。文字・図形の位置は保持します。':layout.mixed?'個別画像とグループをそれぞれ1つの単位として並べます。グループ内の配置は保持します。':layout.groupCount?'グループ内の配置を保って移動します。':'')+'元画像・グラフの範囲を基準に行・列と隙間を決めます。はみ出した文字・図形は隙間に含めません。画像サイズは変えず、各列・行の最大サイズで左上揃えにします。';
  error.textContent=layout.error||'';error.hidden=!layout.error;apply.disabled=!!layout.error;
  horizontal.value=String(lastGaps.horizontal);vertical.value=String(lastGaps.vertical);separate.checked=lastGaps.separate;syncGaps();
  root.showModal();horizontal.focus();horizontal.select();
 }
 function submit(event){
  event.preventDefault();if(apply.disabled||!form.reportValidity())return;
  try{
   if(getDocument()!==openedDocument)throw Error('対象のFigureが変わりました。閉じてから画像を選び直してください。');
   const h=horizontal.valueAsNumber,v=separate.checked?vertical.valueAsNumber:h;
   if(!Number.isFinite(h)||!Number.isFinite(v)||h<0||v<0)throw Error('隙間は0以上の数値で指定してください。');
   onApply(ids,{horizontalGap:mm(h),verticalGap:mm(v),...selectionOptions});
   lastGaps={horizontal:h,vertical:v,separate:separate.checked};root.close();
  }catch(cause){error.textContent=cause.message;error.hidden=false;}
 }
 form.addEventListener('submit',submit);
 separate.addEventListener('change',syncGaps);horizontal.addEventListener('input',()=>{if(!separate.checked)vertical.value=horizontal.value;});
 for(const button of root.querySelectorAll('[data-array-cancel]'))button.addEventListener('click',()=>root.close());
 root.addEventListener('close',()=>{openedDocument=null;ids=[];onClose();});
 return {show};
}
