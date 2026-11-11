import {MATRIX_DEFAULTS,validateMatrixOptions,matrixColorbarVisible} from './matrix-model.mjs?v=d94b6f0be905';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createMatrixEditor({root,request,getMetadata,getConfig,onApply,enhanceColors,showDialog,getColorbarVisibility=(index,fallback)=>fallback}){
 let info=null,openedMetadata=null,visibilityOnly=false,colorbarDefault=true;
 const form=root.querySelector('form'),field=name=>form.elements.namedItem(name),error=root.querySelector('[data-matrix-error]'),sheets=root.querySelector('[data-matrix-sheets]'),styles=root.querySelector('[data-matrix-styles]');
 function selected(){return [...sheets.querySelectorAll('input:checked')].map(input=>Number(input.value));}
 function sync(){
  const histogram=field('kind').value==='Surface Histogram';
  for(const node of root.querySelectorAll('[data-matrix-map]'))node.hidden=histogram;
  for(const node of root.querySelectorAll('[data-matrix-hist]'))node.hidden=!histogram;
  const perSheet=!histogram||field('histSheetMode').value==='separate';
  root.querySelector('[data-matrix-active]').hidden=!perSheet;
  const ids=selected(),active=field('activeSheet');
  for(const option of active.options)option.disabled=!ids.includes(Number(option.value));
  if(active.value===''||!ids.includes(Number(active.value)))active.value=String(ids[0]??'');
  const checks=[...root.querySelectorAll('[data-matrix-colorbar-sheet]')];
  for(const input of checks)input.closest('label').hidden=!ids.includes(Number(input.dataset.matrixColorbarSheet));
  const targets=checks.filter(input=>ids.includes(Number(input.dataset.matrixColorbarSheet))),shown=targets.filter(input=>input.checked).length;
  field('colorbar').checked=targets.length>0&&shown===targets.length;field('colorbar').indeterminate=shown>0&&shown<targets.length;field('colorbar').disabled=!targets.length;
  root.querySelector('[data-matrix-colorbar-summary]').textContent=`${shown} / ${targets.length} シートで表示`;
  field('cdfInterpolation').disabled=!field('cumulative').checked;
  root.querySelector('[data-matrix-summary]').textContent=`${ids.length}シートを選択。指定したセル範囲の数値だけを使用し、空欄を除外します。`;
  for(const row of styles.children)row.hidden=!ids.includes(Number(row.dataset.matrixStyleSheet));
  root.querySelector('[type=submit]').disabled=!ids.length;error.hidden=true;
 }
 async function show(kind){
  error.hidden=true;openedMetadata=getMetadata();if(!openedMetadata)throw Error('先にExcelファイルを開いてください。');
  const result=await request('matrix-info',{});if(getMetadata()!==openedMetadata)throw Error('読み込み中に対象のファイルが変わりました。もう一度開いてください。');info=result;
  const config=getConfig(),saved=config.options?.matrix,options=saved?validateMatrixOptions(saved):structuredClone(MATRIX_DEFAULTS);
  if(!saved){const detected=info.sheets.find(s=>s.index===openedMetadata.sheetIndex&&s.count)||info.sheets.find(s=>s.count);options.range=detected?.range||options.range;options.sheets=info.sheets.filter(s=>s.count).map(s=>s.index).slice(0,32);}
  field('kind').value=kind||(config.plotType==='Surface Histogram'?'Surface Histogram':'Surface Map');
  if(kind)field('kind').value=kind;
  for(const [key,value]of Object.entries(options)){const input=field(key);if(!input)continue;if(input.type==='checkbox')input.checked=value;else input.value=String(value);}
  colorbarDefault=options.colorbar;
  root.querySelector('[data-matrix-colorbars]').innerHTML=info.sheets.filter(s=>s.count).map(s=>`<label><input type="checkbox" data-matrix-colorbar-sheet="${s.index}" ${getColorbarVisibility(s.index,matrixColorbarVisible(options,s.index))?'checked':''}><span>${escape(s.name)}</span></label>`).join('');
  sheets.innerHTML=info.sheets.map(s=>`<label><input type="checkbox" value="${s.index}" ${options.sheets.includes(s.index)?'checked':''} ${!s.count?'disabled':''}><span>${escape(s.name)}<small>${s.count?`${s.count}点 · 検出 ${s.range}`:'2次元の数値範囲なし'}</small></span></label>`).join('');
  field('activeSheet').innerHTML=info.sheets.filter(s=>s.count).map(s=>`<option value="${s.index}">${escape(s.name)}</option>`).join('');field('activeSheet').value=String(openedMetadata.sheetIndex);
  const oldBySheet=new Map((saved?.sheets||[]).map((id,i)=>[id,config.series[i]]));
  styles.innerHTML=info.sheets.filter(s=>s.count).map((s,i)=>{const series=oldBySheet.get(s.index),color=series?.color||['#1F8FE0','#D4291E','#2BA84D','#D77207','#7D3EDD','#787878'][i%6];return `<div data-matrix-style-sheet="${s.index}"><label>表示名<input data-matrix-name value="${escape(series?.name||s.name)}" maxlength="200"></label><label>棒・線の色<input type="color" data-matrix-color value="${color}"></label><label>累積線の色<input data-matrix-cdf-color type="color" value="${options.cumulativeColors[s.index]&&options.cumulativeColors[s.index]!=='auto'?options.cumulativeColors[s.index]:color}"></label></div>`;}).join('');
  sync();enhanceColors();visibilityOnly=true;showDialog(root);field('range').focus();
 }
 function editVisibility(event){
  if(event.target===field('colorbar')){colorbarDefault=event.target.checked;const ids=selected();for(const input of root.querySelectorAll('[data-matrix-colorbar-sheet]'))if(ids.includes(Number(input.dataset.matrixColorbarSheet)))input.checked=colorbarDefault;}
  else if(!event.target.matches('[data-matrix-colorbar-sheet]'))visibilityOnly=false;
  sync();
 }
 form.addEventListener('input',editVisibility);form.addEventListener('change',editVisibility);
 root.querySelector('[data-matrix-all]').addEventListener('click',()=>{visibilityOnly=false;for(const input of sheets.querySelectorAll('input:not(:disabled)'))input.checked=true;sync();});
 root.querySelector('[data-matrix-none]').addEventListener('click',()=>{visibilityOnly=false;for(const input of sheets.querySelectorAll('input'))input.checked=false;sync();});
 for(const button of root.querySelectorAll('[data-matrix-close]'))button.addEventListener('click',()=>root.close());
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  try{
   if(openedMetadata!==getMetadata())throw Error('対象のデータが変わりました。閉じてから開き直してください。');
   const value={...structuredClone(MATRIX_DEFAULTS),sheets:selected()};
   for(const key of Object.keys(value)){const input=field(key);if(!input)continue;value[key]=input.type==='checkbox'?input.checked:['number','range'].includes(input.type)?input.value===''?'':Number(input.value):input.value;}
   value.colorbar=colorbarDefault;value.colorbarVisibility={...(getConfig().options?.matrix?.colorbarVisibility||{})};
   for(const input of root.querySelectorAll('[data-matrix-colorbar-sheet]'))if(value.sheets.includes(Number(input.dataset.matrixColorbarSheet)))value.colorbarVisibility[input.dataset.matrixColorbarSheet]=input.checked;
   const series=value.sheets.map(id=>{const row=styles.querySelector(`[data-matrix-style-sheet="${id}"]`);value.cumulativeColors[id]=row.querySelector('[data-matrix-cdf-color]').value;return {name:row.querySelector('[data-matrix-name]').value,color:row.querySelector('[data-matrix-color]').value};});
   const options=validateMatrixOptions(value),kind=field('kind').value,active=Number(field('activeSheet').value);
   if((kind==='Surface Map'||options.histSheetMode==='separate')&&!options.sheets.includes(active))throw Error('表示するシートを比較対象にも選択してください。');
   root.querySelector('[type=submit]').disabled=true;await onApply({kind,options,series,activeSheet:active,visibilityOnly:visibilityOnly&&kind==='Surface Map'&&getConfig().plotType===kind});root.close();
  }catch(cause){error.textContent=cause.message;error.hidden=false;}finally{root.querySelector('[type=submit]').disabled=!selected().length;}
 });
 return {show};
}
