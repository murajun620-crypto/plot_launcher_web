import {PT_PER_MM,mm,toMM,uid,clone,newDocument,makeObject,bounds,objectBounds,expandSelection,align,distribute,reorder,autoLayout,History,validateDocument} from './model.mjs';
import {imageAsset,imagePhysicalSize,imageMiFiToBodySize,blobToDataURL,dataURLToBlob,download,sanitizeSVG} from './assets.mjs?v=0.3.5-1';
import {importedImageSize,replacedImageSize,replacedMiFiToImageSize,imageInsertionPoint} from './image-placement.mjs?v=0.3.5-1';
import {saveDraft,loadDraft,saveProjectFileTarget,loadProjectFileTarget} from './storage.mjs?v=0.3.6-1';
import {createDemo} from './demo.mjs';
import {createShortcutHandler} from './shortcuts.mjs';
import {openSource,SOURCE_APPS,setupSourceDiscovery,closeSourceSessions} from './integration/bridge-client.mjs?v=project-switch-v051-1';
import {createFigureSidebar} from './thumbnails.mjs?v=0.3.0-1';
import {setupTransferReceiver,getFigureWorkspace} from './integration/direct-transfer.mjs?v=project-switch-v051-1';
import {readMifitoIdentity} from './integration/mifito-sync.mjs?v=0.3.5-1';
import {planMiFiToSync} from './mifito-batch.mjs?v=0.3.4-1';
import {setupUpdateCheck} from './update-check.mjs';
import {marqueeSelection} from './selection.mjs';
import {ARROW_PROPERTIES,arrowEndpoint,arrowPropertyValue,setArrowProperty,arrowGeometry} from './arrowheads.mjs?v=0.3.0-1';

import {createArrowPicker} from './arrow-picker.mjs?v=0.3.0-1';
import {createPreviewQuality} from './preview-quality.mjs?v=0.3.0-1';
import {reorderFigures} from './figure-order.mjs';
import {renumberFigureNames} from './figure-names.mjs?v=0.3.3-1';
import {deleteFigures,duplicateFigures} from './figure-commands.mjs';
import {ProjectFileSession,projectFilePickerOptions} from './project-file.mjs?v=project-switch-v051-1';
import {installWorkspacePersistence} from './workspace-session.mjs?v=project-switch-v051-1';
import {decodeWorkspaceState} from './workspace-state.mjs?v=project-switch-v051-1';
import {validateWorkspaceBinding} from './integration/bridge-host.mjs?v=project-switch-v051-1';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
setupSourceDiscovery();
const ns='http://www.w3.org/2000/svg';
const el=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))if(v!==undefined)n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
let doc=newDocument(),assets=new Map(),selection=[],tool='select',scale=1.5,history=new History(),gesture=null,textBefore=null,editingId=null,dirty=false,saveTimer,revision=0,clipboard=null,formatClipboard=null,frame=0,spaceDown=false,manualSavedRevision=-1,bridge=null;
let figures=[doc],bookId=uid(),initialDemo=false,transferQueue=Promise.resolve(),updateReloading=false;
let projectSaving=false,projectOpening=false;
let preservedWorkspace=null;
const projectFiles=new ProjectFileSession({host:window,fallback:(blob,name)=>download(blob,name)});
if(new URLSearchParams(location.search).get('figureWorkspace')==='1')document.documentElement.dataset.workspaceEmbedded='true';
function syncFigure(){const i=figures.findIndex(f=>f.id===doc.id);if(i>=0)figures[i]=doc;else figures.push(doc);}
function snapshot(){syncFigure();return clone({format:'figure-studio-book',version:1,id:bookId,activeId:doc.id,figures});}
function restoreBook(state){figures=clone(state.figures);bookId=state.id;doc=figures.find(f=>f.id===state.activeId)||figures[0];selection=[];}
function switchFigure(id){if(id===doc.id)return;finishText();if(gesture)endGesture(null,true);syncFigure();const next=figures.find(f=>f.id===id);if(!next)return;doc=next;selection=[];tool='select';render();fit();scheduleSave();svg.focus();}
const figureSidebar=createFigureSidebar({root:$('#figureTabs'),onSelect:switchFigure,onCommand:(action,ids)=>execute(action,{figureIds:ids}),onReorder:moveFigures,renderSVG:(f,width,height)=>{
 const out=el('svg',{xmlns:ns,width,height,viewBox:`0 0 ${f.width} ${f.height}`});out.append(el('rect',{width:f.width,height:f.height,fill:'#fff'}));
 for(const o of f.objects){const g=el('g');drawContent(o,g,'thumbnail');g.removeAttribute('style');g.removeAttribute('data-id');out.append(g);}return new XMLSerializer().serializeToString(out);
}});
function renderFigureTabs(){figureSidebar.update(figures,doc.id);}
const nodes=new Map(),svg=$('#canvas'),objects=$('#objects'),overlays=$('#overlays'),viewport=$('#viewport'),paper=$('#paperWrap'),editor=$('#textEditor');
svg.setAttribute('tabindex','0');svg.setAttribute('role','application');svg.setAttribute('aria-label','Figure編集キャンバス');
const measure=document.createElement('canvas').getContext('2d');
const arrowPicker=createArrowPicker({root:$('#arrowProperties'),onChange:(property,value)=>change(()=>editable().forEach(o=>setArrowProperty(o,property,value)))});
let previewErrorShown=false;
const previewQuality=createPreviewQuality({onReady:(asset,url,quality)=>{
 if(quality!==previewQuality.quality||assets.get(asset.id)!==asset)return;
 for(const o of doc.objects)if(o.type==='image'&&o.assetId===asset.id)nodes.get(o.id)?.querySelector('image')?.setAttribute('href',url);
},onError:(error,asset,quality)=>{if(quality===previewQuality.quality&&assets.get(asset.id)===asset&&!previewErrorShown){previewErrorShown=true;toast('一部の軽量プレビューを作れないため、元の画質で表示しています');}}});
try{const saved=Number(localStorage.getItem('figure-studio-preview-quality'));if([1,.5,.25].includes(saved))previewQuality.setQuality(saved);}catch{}
$('#previewQuality').value=String(previewQuality.quality);
function moveFigures(ids,beforeId){
 if(gesture)endGesture(null,true);finishText();const before=snapshot(),next=reorderFigures(figures,ids,beforeId);
 if(next.every((f,i)=>f.id===figures[i]?.id))return;figures=next;record(before);toast('Figureの順序を変更しました · Ctrl+Zで戻せます');
}
function figureIds(payload){return payload.figureIds??figureSidebar.getSelectedIds();}
function focusFigure(){const id=doc.id;$('#figureTabs').querySelector('[data-figure-id="'+id+'"]')?.focus({preventScroll:true});}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4200);$('#statusText').textContent=message;}
function selected(){const s=new Set(selection);return doc.objects.filter(o=>s.has(o.id));}
function editable(){const lockedGroups=new Set(doc.objects.filter(o=>o.locked&&o.groupId).map(o=>o.groupId));return selected().filter(o=>!o.locked&&!lockedGroups.has(o.groupId));}
function setSelection(ids,{focus=true}={}){selection=expandSelection(doc,ids);renderOverlay();renderInspector();renderLayers();if(focus&&!editingId)svg.focus({preventScroll:true});}
function record(before){syncFigure();if(before.figures.length!==figures.length||before.figures.some((f,i)=>f.id!==figures[i]?.id))renumberFigureNames(figures);if(history.push(before,snapshot())){dirty=true;revision++;scheduleSave();render();}else{renderOverlay();renderInspector();updateToolbar();}}
function change(fn){finishText();const before=snapshot();fn();record(before);}
function scheduleSave(){clearTimeout(saveTimer);$('#saveStatus').textContent='保存待ち';saveTimer=setTimeout(async()=>{const rev=revision;try{await saveDraft(snapshot(),assets);$('#saveStatus').textContent=rev===revision?'ブラウザに保存済み':'保存待ち';}catch(e){$('#saveStatus').textContent='自動保存できません';toast('自動保存できません。Ctrl+Sでプロジェクトを保存してください。');}},650);}
function setScale(s){scale=Math.max(.25,Math.min(5,s));$('#zoom').value=Math.round(scale*100);$('#zoomLabel').textContent=`${Math.round(scale*100)}%`;paper.style.width=`${doc.width*scale}px`;paper.style.height=`${doc.height*scale}px`;svg.style.width=`${doc.width*scale}px`;svg.style.height=`${doc.height*scale}px`;renderOverlay();positionEditor();}
function fit(){const w=viewport.clientWidth-100,h=viewport.clientHeight-85;setScale(Math.min(w/doc.width,h/doc.height));}
function svgPoint(e){const r=svg.getBoundingClientRect();return{x:(e.clientX-r.left)/scale,y:(e.clientY-r.top)/scale};}
function transform(o){return `translate(${o.x} ${o.y}) rotate(${o.rotation||0} ${o.w/2} ${o.h/2})`;}
function font(o){return `${o.italic?'italic ':''}${o.bold?'bold ':''}${o.fontSize}px ${o.fontFamily||'Arial'}`;}
function textLines(o){measure.font=font(o);const out=[];for(const paragraph of o.text.split('\n')){let line='';for(const c of paragraph){if(line&&measure.measureText(line+c).width>Math.max(1,o.w-2)){out.push(line);line=c;}else line+=c;}out.push(line);}return out;}
function drawContent(o,g,full=false){
 g.replaceChildren();g.style.visibility=editingId===o.id?'hidden':'';g.setAttribute('transform',transform(o));g.setAttribute('opacity',o.opacity??1);g.setAttribute('data-id',o.id);g.style.cursor=o.locked?'default':'move';
 if(o.type==='image'){const a=assets.get(o.assetId);if(a){g.append(el('image',{width:o.w,height:o.h,href:full===true?a.dataUrl:full==='thumbnail'?(a.previewUrl||a.dataUrl):previewQuality.getURL(a),preserveAspectRatio:'none'}));}else{g.append(el('rect',{width:o.w,height:o.h,fill:'#f4ddd9',stroke:'#c27466'}));g.append(el('text',{x:5,y:18,'font-size':10},'画像が見つかりません'));}}
 else if(o.type==='text'){
 const anchor=o.textAlign==='center'?'middle':o.textAlign==='right'?'end':'start',x=anchor==='middle'?o.w/2:anchor==='end'?o.w:0;
 const t=el('text',{fill:o.fill||'#172f36','font-family':o.fontFamily||'Arial','font-size':o.fontSize,'font-weight':o.bold?'700':'400','font-style':o.italic?'italic':'normal','text-decoration':o.underline?'underline':'none','text-anchor':anchor,'xml:space':'preserve'});
 const lines=textLines(o);lines.forEach((line,i)=>t.append(el('tspan',{x,y:o.fontSize*(.95+i*1.25),...(o.textAlign==='justify'&&i<lines.length-1&&line.length>1?{textLength:o.w,lengthAdjust:'spacing'}:{})},line||' ')));g.append(t);
 if(!full)g.prepend(el('rect',{width:Math.max(o.w,5),height:Math.max(o.h,o.fontSize*1.2),fill:'transparent','data-hit':'true'}));
 }else if(o.type==='line'||o.type==='arrow'){
 if(!full)g.append(el('line',{x1:0,y1:0,x2:o.w,y2:o.h,stroke:'transparent','stroke-width':Math.max(12/scale,o.strokeWidth),'pointer-events':'stroke'}));
 const geometry=arrowGeometry(o);g.append(el('line',{...geometry.shaft,stroke:o.stroke,'stroke-width':o.strokeWidth,'stroke-dasharray':o.dashed?`${o.strokeWidth*4} ${o.strokeWidth*3}`:undefined,'stroke-linecap':'round'}));
 for(const head of geometry.heads)g.append(el(head.tag,head.attrs));
 }else {g.append(el(o.type==='ellipse'?'ellipse':'rect',o.type==='ellipse'?{cx:o.w/2,cy:o.h/2,rx:o.w/2,ry:o.h/2,fill:o.fill,stroke:o.stroke,'stroke-width':o.strokeWidth}:{width:o.w,height:o.h,fill:o.fill,stroke:o.stroke,'stroke-width':o.strokeWidth,rx:0}));}
}
function render(){
 syncFigure();renderFigureTabs();svg.setAttribute('viewBox',`0 0 ${doc.width} ${doc.height}`);$('#docName').value=doc.name;$('#pageWidth').value=toMM(doc.width).toFixed(1);$('#pageHeight').value=toMM(doc.height).toFixed(1);const figureLabel=$('#canvasFigureLabel');if(figureLabel){figureLabel.textContent=`Figure ${figures.findIndex(f=>f.id===doc.id)+1}`;figureLabel.title=doc.name;}
 const ids=new Set(doc.objects.map(o=>o.id));for(const[id,n]of nodes)if(!ids.has(id)){n.remove();nodes.delete(id);}for(const o of doc.objects){let g=nodes.get(o.id);if(!g){g=el('g');nodes.set(o.id,g);}drawContent(o,g);objects.append(g);}selection=selection.filter(id=>ids.has(id));
 setScale(scale);renderInspector();renderLayers();updateToolbar();document.title=`${doc.name} · Figure Studio`;
}
function updateToolbar(){for(const b of $$('[data-tool]')){b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));}const undo=$('[data-action="undo"]'),redo=$('[data-action="redo"]');if(undo)undo.disabled=!history.past.length;if(redo)redo.disabled=!history.future.length;updateProjectFileUI();}
function renderFast(){for(const o of editable()){const g=nodes.get(o.id);if(!g)continue;if(gesture?.kind==='resize'||gesture?.kind==='endpoint')drawContent(o,g);else g.setAttribute('transform',transform(o));}renderOverlay();}
function queueFast(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;renderFast();});}
function renderOverlay(){overlays.replaceChildren();const all=selected(),b=bounds(all);if(!b)return;const ink='#0c888d',u=1/scale;
 for(const o of all){const q=objectBounds(o);overlays.append(el('rect',{x:q.x,y:q.y,width:Math.max(q.w,1),height:Math.max(q.h,1),fill:'none',stroke:ink,'stroke-width':.6*u,'stroke-dasharray':`${3*u} ${3*u}`,'pointer-events':'none'}));}
 if(!editable().length)return;overlays.append(el('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'none',stroke:ink,'stroke-width':u,'pointer-events':'none'}));
 if(all.length===1&&(all[0].type==='line'||all[0].type==='arrow')){const o=all[0],r=(o.rotation||0)*Math.PI/180,cx=o.x+o.w/2,cy=o.y+o.h/2;for(const [name,x,y]of [['start',o.x,o.y],['end',o.x+o.w,o.y+o.h]]){const xx=cx+(x-cx)*Math.cos(r)-(y-cy)*Math.sin(r),yy=cy+(x-cx)*Math.sin(r)+(y-cy)*Math.cos(r);overlays.append(el('circle',{cx:xx,cy:yy,r:4*u,fill:'white',stroke:ink,'stroke-width':1.4*u,'data-handle':name}));}}
 else for(const [name,x,y]of [['nw',b.x,b.y],['ne',b.x+b.w,b.y],['se',b.x+b.w,b.y+b.h],['sw',b.x,b.y+b.h]])overlays.append(el('rect',{x:x-3.5*u,y:y-3.5*u,width:7*u,height:7*u,fill:'white',stroke:ink,'stroke-width':u,'data-handle':name,cursor:`${name}-resize`}));
 if(all.length===1){overlays.append(el('line',{x1:b.x+b.w/2,y1:b.y,x2:b.x+b.w/2,y2:b.y-18*u,stroke:ink,'stroke-width':u}));overlays.append(el('circle',{cx:b.x+b.w/2,cy:b.y-22*u,r:4*u,fill:'white',stroke:ink,'stroke-width':u,'data-handle':'rotate',cursor:'crosshair'}));}
}
function renderInspector(){const arr=selected(),o=arr[0];$('#selectionInfo').textContent=arr.length?`${arr.length} 個を選択${o.locked?' · 固定':''}`:'オブジェクトを選択';for(const input of $$('[data-prop]')){const p=input.dataset.prop;if(Object.hasOwn(ARROW_PROPERTIES,p))continue;input.disabled=!o||(o.locked&&p!=='locked')||(['fontSize','fontFamily','text','textAlign'].includes(p)&&o.type!=='text');if(!o)continue;let value=o[p];if(['x','y','w','h'].includes(p))value=toMM(value).toFixed(2);if(p==='opacity')value=Math.round((o.opacity??1)*100);if(p==='fill'&&(!value||value==='none'))value='#ffffff';if(p==='stroke'&&(!value||value==='none'))value='#263b44';if(document.activeElement!==input)input.value=value??(p==='fontSize'?12:'');}
 const showArrows=arr.length>0&&arr.every(o=>['line','arrow'].includes(o.type)),arrowEditable=showArrows?editable():[];$('#arrowProperties').hidden=!showArrows;
 for(const input of $$('#arrowProperties [data-prop]')){const p=input.dataset.prop,end=p.startsWith('arrowStart')?'start':'end';input.disabled=!arrowEditable.length||(!p.endsWith('Style')&&arrowEditable.every(o=>arrowEndpoint(o,end).style==='none'));const values=arr.map(o=>arrowPropertyValue(o,p));if(document.activeElement!==input)input.value=values.length&&values.every(v=>v===values[0])?values[0]:'';}
 arrowPicker.update(arr,{editableIds:arrowEditable.map(o=>o.id)});
 for(const a of ['bold','italic','underline']){const b=$(`[data-action="${a}"]`);if(b)b.classList.toggle('active',!!o?.[a]);}
 $('#sourceSummary').textContent=o?.source?`${o.source.app==='plot'?'PlotLauncher':'MiFiTo'} · ${o.source.name}`:'元プロジェクトを関連付けできます';if(o?.source)$('#sourceApp').value=o.source.app;
}
function renderLayers(){const root=$('#layers');root.replaceChildren();for(const o of [...doc.objects].reverse()){const b=document.createElement('button');b.type='button';b.className='layer-row'+(selection.includes(o.id)?' selected':'');b.dataset.id=o.id;b.setAttribute('aria-pressed',String(selection.includes(o.id)));const icon=document.createElement('span');icon.className='layer-kind';icon.textContent={image:'▧',text:'T',line:'╱',arrow:'↗',rect:'□',ellipse:'○'}[o.type];const label=document.createElement('span');label.className='layer-name';label.textContent=o.name||(o.type==='text'?o.text.slice(0,24):{line:'線',arrow:'矢印',rect:'長方形',ellipse:'楕円',image:'画像'}[o.type]);const lock=document.createElement('span');lock.textContent=o.locked?'固定':o.groupId?'G':'';lock.className='layer-meta';b.append(icon,label,lock);b.onclick=e=>{finishText();setSelection(e.shiftKey?[...selection,o.id]:[o.id]);};root.append(b);}}
function setTool(t){finishText();tool=t;svg.style.cursor=t==='select'?'default':'crosshair';updateToolbar();$('#statusText').textContent={select:'クリックで選択 · Shiftで複数選択 · ドラッグで移動',text:'ドラッグしてテキストボックスを作成',line:'ドラッグで線を作成 · Shiftで角度固定',arrow:'ドラッグで矢印を作成 · Shiftで角度固定',rect:'ドラッグで長方形を作成',ellipse:'ドラッグで楕円を作成'}[t];svg.focus({preventScroll:true});}
function beginText(o){if(o.locked)return;finishText();editingId=o.id;textBefore=snapshot();editor.value=o.text;editor.hidden=false;positionEditor();nodes.get(o.id).style.visibility='hidden';editor.focus();editor.select();}
function positionEditor(){if(!editingId)return;const o=doc.objects.find(o=>o.id===editingId);if(!o)return;Object.assign(editor.style,{left:`${o.x*scale}px`,top:`${o.y*scale}px`,width:`${Math.max(o.w,20)*scale}px`,height:`${Math.max(o.h,o.fontSize*2)*scale}px`,fontFamily:o.fontFamily,fontSize:`${o.fontSize*scale}px`,fontWeight:o.bold?'700':'400',fontStyle:o.italic?'italic':'normal',textDecoration:o.underline?'underline':'none',lineHeight:'1.25',textAlign:o.textAlign,color:o.fill,transform:`rotate(${o.rotation||0}deg)`,transformOrigin:'center'});}
function finishText(cancel=false){if(!editingId)return;const o=doc.objects.find(o=>o.id===editingId);if(o&&!cancel){o.text=editor.value;o.h=Math.max(o.h,textLines(o).length*o.fontSize*1.25);}if(cancel&&textBefore)restoreBook(textBefore);editingId=null;editor.hidden=true;const before=textBefore;textBefore=null;if(before)record(before);render();}
editor.addEventListener('input',()=>{const o=doc.objects.find(o=>o.id===editingId);if(o){o.text=editor.value;renderInspector();}});
editor.addEventListener('blur',()=>{if(editingId)setTimeout(()=>{if(editingId&&document.activeElement!==editor)finishText();},0);});

function captureGesture(e,target){gesture.pointerId=e.pointerId;gesture.captureTarget=target;target.setPointerCapture(e.pointerId);e.preventDefault();}
function beginMarquee(e){
 const initialSelection=[...selection];
 gesture={kind:'marquee',start:svgPoint(e),startClient:{x:e.clientX,y:e.clientY},initialSelection,additive:e.shiftKey,moved:false};
 if(!e.shiftKey)setSelection([],{focus:false});
}
function drawMarquee(){
 const g=gesture;if(g?.kind!=='marquee'||!g.end)return;
 if(g.moved)selection=marqueeSelection(doc,g.start,g.end,{initialIds:g.initialSelection,additive:g.additive});
 renderOverlay();
 if(g.moved)overlays.append(el('rect',{x:Math.min(g.start.x,g.end.x),y:Math.min(g.start.y,g.end.y),width:Math.abs(g.end.x-g.start.x),height:Math.abs(g.end.y-g.start.y),fill:'#0c888d14',stroke:'#0c888d','stroke-width':1/scale,'data-marquee':'true','pointer-events':'none'}));
}
function updateMarquee(g,e){g.end=svgPoint(e);g.moved ||= Math.hypot(e.clientX-g.startClient.x,e.clientY-g.startClient.y)>=3;}
svg.addEventListener('pointerdown',e=>{
 if(e.button!==0||e.isPrimary===false||gesture)return;$('#contextMenu').hidden=true;finishText();shortcut.reset();svg.focus({preventScroll:true});const p=svgPoint(e),handle=e.target.closest('[data-handle]')?.dataset.handle,id=e.target.closest('[data-id]')?.dataset.id;
 if(spaceDown){gesture={kind:'pan',clientX:e.clientX,clientY:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};captureGesture(e,svg);return;}
 if(handle){gesture={kind:handle==='rotate'?'rotate':['start','end'].includes(handle)?'endpoint':'resize',handle,start:p,before:snapshot(),initial:clone(editable()),box:bounds(editable())};}
 else if(tool!=='select'){
 const o=makeObject(tool,{x:p.x,y:p.y,w:0,h:0,...(tool==='text'?{w:mm(35),h:mm(12),text:'Text'}:{})});const before=snapshot();doc.objects.push(o);selection=[o.id];render();gesture={kind:'create',start:p,before,id:o.id};
 }else if(id){const o=doc.objects.find(o=>o.id===id);if(e.shiftKey){setSelection(selection.includes(id)?selection.filter(v=>!expandSelection(doc,[id]).includes(v)):[...selection,id]);}else if(!selection.includes(id))setSelection([id]);
 if(!o.locked&&selection.includes(id)&&editable().length)gesture={kind:'move',start:p,before:snapshot(),initial:clone(editable()),box:bounds(editable())};
 }else beginMarquee(e);
 if(gesture)captureGesture(e,svg);
});
viewport.addEventListener('pointerdown',e=>{
 // Native controls, the paper's children and scrollbar gutters retain their behavior.
 if(e.button!==0||e.isPrimary===false||gesture||(e.target!==viewport&&e.target!==paper)||(!spaceDown&&tool!=='select'))return;
 const r=viewport.getBoundingClientRect(),x=e.clientX-r.left-viewport.clientLeft,y=e.clientY-r.top-viewport.clientTop;
 if(x<0||y<0||x>=viewport.clientWidth||y>=viewport.clientHeight)return;
 $('#contextMenu').hidden=true;finishText();shortcut.reset();svg.focus({preventScroll:true});
 if(spaceDown)gesture={kind:'pan',clientX:e.clientX,clientY:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
 else beginMarquee(e);
 captureGesture(e,viewport);
});
viewport.addEventListener('pointermove',e=>{
 if(!gesture||e.pointerId!==gesture.pointerId)return;const p=svgPoint(e),g=gesture,dx=p.x-g.start?.x,dy=p.y-g.start?.y;
 if(g.kind==='pan'){viewport.scrollLeft=g.left-(e.clientX-g.clientX);viewport.scrollTop=g.top-(e.clientY-g.clientY);return;}
 if(g.kind==='move'){
 let x=dx,y=dy;if(e.shiftKey){if(Math.abs(x)>Math.abs(y))y=0;else x=0;}
 if(!e.altKey){const candidatesX=[0,doc.width/2,doc.width],candidatesY=[0,doc.height/2,doc.height];for(const o of doc.objects)if(!selection.includes(o.id)){const b=objectBounds(o);candidatesX.push(b.x,b.x+b.w/2,b.x+b.w);candidatesY.push(b.y,b.y+b.h/2,b.y+b.h);}
 const snap=(value,size,targets)=>{let best=4/scale,out=0;for(const t of targets)for(const q of [value,value+size/2,value+size])if(Math.abs(t-q)<best){best=Math.abs(t-q);out=t-q;}return out;};x+=snap(g.box.x+x,g.box.w,candidatesX);y+=snap(g.box.y+y,g.box.h,candidatesY);}
 for(const old of g.initial){const o=doc.objects.find(v=>v.id===old.id);o.x=old.x+x;o.y=old.y+y;}queueFast();
 }else if(g.kind==='resize'){
 const b=g.box,left=g.handle.includes('w'),top=g.handle.includes('n'),ax=left?b.x+b.w:b.x,ay=top?b.y+b.h:b.y;let sx=Math.max(.02,((left?-1:1)*(p.x-ax))/Math.max(b.w,1)),sy=Math.max(.02,((top?-1:1)*(p.y-ay))/Math.max(b.h,1));if(e.shiftKey||g.initial.every(o=>o.type==='image'))sx=sy=Math.min(sx,sy);
 for(const old of g.initial){const o=doc.objects.find(v=>v.id===old.id);o.x=ax+(old.x-ax)*sx;o.y=ay+(old.y-ay)*sy;o.w=old.w*sx;o.h=old.h*sy;}queueFast();
 }else if(g.kind==='rotate'){const o=editable()[0],b=g.box,cx=b.x+b.w/2,cy=b.y+b.h/2;let a=Math.atan2(p.y-cy,p.x-cx)*180/Math.PI+90;if(e.shiftKey)a=Math.round(a/15)*15;o.rotation=a;queueFast();}
 else if(g.kind==='endpoint'){const o=editable()[0],old=g.initial[0],r=(old.rotation||0)*Math.PI/180,cx=old.x+old.w/2,cy=old.y+old.h/2;const turn=(x,y)=>({x:cx+(x-cx)*Math.cos(r)-(y-cy)*Math.sin(r),y:cy+(x-cx)*Math.sin(r)+(y-cy)*Math.cos(r)}),a=turn(old.x,old.y),b=turn(old.x+old.w,old.y+old.h);o.rotation=0;if(g.handle==='start'){o.x=p.x;o.y=p.y;o.w=b.x-p.x;o.h=b.y-p.y;}else{o.x=a.x;o.y=a.y;o.w=p.x-a.x;o.h=p.y-a.y;}queueFast();}
 else if(g.kind==='create'){const o=doc.objects.find(v=>v.id===g.id);if(['line','arrow'].includes(o.type)){let x=dx,y=dy;if(e.shiftKey){const len=Math.hypot(x,y),a=Math.round(Math.atan2(y,x)/(Math.PI/4))*Math.PI/4;x=len*Math.cos(a);y=len*Math.sin(a);}o.w=x;o.h=y;}else{let w=Math.abs(dx),h=Math.abs(dy);if(e.shiftKey)w=h=Math.max(w,h);o.x=Math.min(p.x,g.start.x);o.y=Math.min(p.y,g.start.y);o.w=Math.max(w,2);o.h=Math.max(h,2);}drawContent(o,nodes.get(o.id));renderOverlay();}
 else if(g.kind==='marquee'){updateMarquee(g,e);if(!frame)frame=requestAnimationFrame(()=>{frame=0;drawMarquee();});}
});
function endGesture(e,cancel=false){const g=gesture;if(!g||(e&&e.pointerId!==g.pointerId))return;if(g.kind==='marquee'&&e&&!cancel)updateMarquee(g,e);gesture=null;if(frame){cancelAnimationFrame(frame);frame=0;}if(g.kind==='marquee'){
 const next=cancel?g.initialSelection:g.moved?marqueeSelection(doc,g.start,g.end,{initialIds:g.initialSelection,additive:g.additive}):g.additive?g.initialSelection:[];
 setSelection(next,{focus:!cancel});$('#statusText').textContent=cancel?'囲み選択をキャンセルしました':`${selection.length} 個を選択`;
 }
 else if(g.before){if(cancel){restoreBook(g.before);render();}else{if(g.kind==='create'){const o=doc.objects.find(v=>v.id===g.id);if(o.type==='text'&&o.w<15){o.w=mm(35);o.h=mm(12);}if(o.type!=='text'&&Math.hypot(o.w,o.h)<3){o.w=mm(30);o.h=o.type==='line'||o.type==='arrow'?0:mm(20);}}record(g.before);if(g.kind==='create'){const o=doc.objects.find(v=>v.id===g.id);setTool('select');if(o.type==='text')beginText(o);}}}if(g.captureTarget?.hasPointerCapture(g.pointerId))g.captureTarget.releasePointerCapture(g.pointerId);}
viewport.addEventListener('pointerup',e=>endGesture(e));viewport.addEventListener('pointercancel',e=>endGesture(e,true));
viewport.addEventListener('lostpointercapture',e=>{if(gesture?.pointerId===e.pointerId)endGesture(null,true);});
svg.addEventListener('dblclick',e=>{const id=e.target.closest('[data-id]')?.dataset.id||document.elementsFromPoint(e.clientX,e.clientY).map(n=>n.closest?.('[data-id]')?.dataset.id).find(Boolean),o=doc.objects.find(v=>v.id===id);if(o?.type==='text')beginText(o);else if(o?.source)editSource(o);});
viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();setScale(scale*Math.exp(-e.deltaY*.0015));}},{passive:false});
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!editingId&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){spaceDown=true;e.preventDefault();}});window.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false;});window.addEventListener('blur',()=>{spaceDown=false;shortcut.reset();if(gesture)endGesture(null,true);});

function duplicate(){const old=selected();if(!old.length)return;change(()=>{const groups=new Map();const added=old.map(o=>{const n=clone(o);n.id=uid();n.x+=mm(3);n.y+=mm(3);n.locked=false;if(n.groupId){if(!groups.has(n.groupId))groups.set(n.groupId,uid());n.groupId=groups.get(n.groupId);}return n;});doc.objects.push(...added);selection=added.map(o=>o.id);});}
function applyTextStyle(property,value){if(editingId){const o=doc.objects.find(o=>o.id===editingId);o[property]=typeof value==='function'?value(o[property],o):value;positionEditor();renderInspector();return;}change(()=>editable().filter(o=>o.type==='text').forEach(o=>o[property]=typeof value==='function'?value(o[property],o):value));}
const sizes=[6,7,8,9,10,11,12,14,16,18,20,22,24,28,32,36,40,44,48,54,60,66,72,80,88,96];
function changeFont(action){applyTextStyle('fontSize',v=>action==='font-up'?Math.min(1000,v+1):action==='font-down'?Math.max(1,v-1):action==='font-grow'?(sizes.find(n=>n>v)||Math.min(1000,v+8)):([...sizes].reverse().find(n=>n<v)||Math.max(1,v-1)));}
function addLabels(){change(()=>{const targets=editable().filter(o=>o.type==='image');const list=targets.length?targets:doc.objects.filter(o=>o.type==='image'&&!o.locked);list.forEach((o,i)=>doc.objects.push(makeObject('text',{x:o.x,y:o.y-mm(6),w:mm(9),h:mm(6),fontSize:12,bold:true,text:i<26?String.fromCharCode(65+i):String(i+1),name:'Panel label'})));});}
function execute(action,payload={}){
 if(gesture&&['undo','redo','new','sample','new-figure','duplicate-figure','delete-figure','open','next-figure','previous-figure'].includes(action))endGesture(null,true);
 if(['select','text','line','arrow','rect','ellipse'].includes(action))return setTool(action);
 if(['font-grow','font-shrink','font-up','font-down'].includes(action))return changeFont(action);
 if(['bold','italic','underline'].includes(action))return applyTextStyle(action,v=>!v);
 if(action.startsWith('text-')&&['left','center','right','justify'].includes(action.slice(5)))return applyTextStyle('textAlign',action.slice(5));
 if(action==='commit-text'){finishText();svg.focus();return;}if(action==='edit-text'){const o=selected()[0];if(o?.type==='text')beginText(o);return;}
 if(action==='escape'){if(editingId)finishText(true);else if(gesture)endGesture(null,true);else{setTool('select');setSelection([]);}$('#contextMenu').hidden=true;return;}
 if(action==='undo'||action==='redo'){const sidebarFocused=!!document.activeElement?.closest('#figureTabs');finishText();restoreBook(history[action](snapshot()));dirty=true;revision++;scheduleSave();render();if(sidebarFocused)focusFigure();return;}
 if(action==='select-all'){finishText();setSelection(doc.objects.map(o=>o.id));return;}
 if(action==='cycle-selection'){const list=doc.objects;if(!list.length)return;const i=list.findIndex(o=>o.id===selection.at(-1));setSelection([list[(i+(payload.direction||1)+list.length)%list.length].id]);return;}
 if(action==='duplicate')return duplicate();
 if(action==='delete')return change(()=>{const ids=new Set(editable().map(o=>o.id));doc.objects=doc.objects.filter(o=>!ids.has(o.id));selection=[];});
 if(action==='nudge')return change(()=>editable().forEach(o=>{o.x+=payload.dx;o.y+=payload.dy;}));
 if(action.startsWith('align-'))return change(()=>align(doc,selection,action.slice(6),$('#alignTarget').value));
 if(action.startsWith('distribute-'))return change(()=>distribute(doc,selection,action.slice(-1)));
 if(['front','back','forward','backward'].includes(action))return change(()=>reorder(doc,editable().map(o=>o.id),action));
 if(action==='group')return change(()=>{if(editable().length<2)return;const id=uid();editable().forEach(o=>o.groupId=id);});
 if(action==='ungroup')return change(()=>editable().forEach(o=>o.groupId=null));
 if(action==='lock')return change(()=>{const value=!selected().every(o=>o.locked);selected().forEach(o=>o.locked=value);});
 if(action==='copy-format'){const o=selected()[0];if(o){formatClipboard=Object.fromEntries(['fill','stroke','strokeWidth','fontSize','fontFamily','bold','italic','underline','textAlign','opacity'].filter(p=>o[p]!==undefined).map(p=>[p,o[p]]));toast('書式をコピーしました');}return;}
 if(action==='paste-format'){if(formatClipboard)change(()=>editable().forEach(o=>Object.assign(o,formatClipboard)));return;}
 if(action==='auto-grid'||action==='auto-hero')return change(()=>{let ids=selection;if(!ids.length)ids=doc.objects.filter(o=>o.type==='image'&&!o.locked).map(o=>o.id);autoLayout(doc,ids,action==='auto-grid'?'grid':'hero');});
 if(action==='no-fill')return change(()=>editable().filter(o=>['rect','ellipse'].includes(o.type)).forEach(o=>o.fill='none'));
 if(action==='toggle-dash')return change(()=>editable().filter(o=>['line','arrow'].includes(o.type)).forEach(o=>o.dashed=!o.dashed));
 if(action==='toggle-arrow-start'||action==='toggle-arrow-end')return change(()=>editable().filter(o=>['line','arrow'].includes(o.type)).forEach(o=>{const end=action==='toggle-arrow-start'?'start':'end';setArrowProperty(o,end==='start'?'arrowStartStyle':'arrowEndStyle',arrowEndpoint(o,end).style==='none'?'triangle':'none');}));
 if(action==='labels')return addLabels();
 if(action==='fit')return fit();if(action==='help')return $('#helpDialog').showModal();
 if(action==='import')return $('#imageInput').click();if(action==='open')return openProject();if(action==='save'||action==='save-as')return saveProject(action==='save-as');
 if(action==='next-figure'||action==='previous-figure'){syncFigure();const index=figures.findIndex(f=>f.id===doc.id);switchFigure(figures[(index+(action==='next-figure'?1:-1)+figures.length)%figures.length].id);return;}
 if(action==='new-figure'){
  if(figures.length>=100){toast('1プロジェクトのFigureは100枚までです');return;}finishText();const before=snapshot();const insertionIndex=figures.findIndex(f=>f.id===doc.id)+1,next=newDocument();next.name='Fig. '+(figures.length+1);figures.splice(insertionIndex,0,next);doc=next;selection=[];record(before);figureSidebar.select([doc.id],doc.id);fit();return;
 }
 if(action==='duplicate-figure'){
  const ids=figureIds(payload);if(!ids.length)return;finishText();const before=snapshot();let result;try{result=duplicateFigures(figures,ids);}catch(error){toast(error.message);return;}if(!result.ids.length)return;figures=result.figures;doc=figures.find(f=>f.id===result.ids[0]);selection=[];record(before);figureSidebar.select(result.ids,doc.id);fit();return;
 }
 if(action==='delete-figure'){
  const ids=figureIds(payload);if(!ids.length)return;finishText();const before=snapshot(),result=deleteFigures(figures,ids,doc.id);if(result.figures===figures)return;figures=result.figures;doc=figures.find(f=>f.id===result.activeId);selection=[];record(before);figureSidebar.select([doc.id],doc.id);fit();focusFigure();toast(ids.length+'枚のFigureを削除しました · Ctrl+Zで戻せます');return;
 }
 if(action==='move-figure-left'||action==='move-figure-right'){finishText();const before=snapshot(),i=figures.findIndex(f=>f.id===doc.id),j=i+(action==='move-figure-left'?-1:1);if(j>=0&&j<figures.length){[figures[i],figures[j]]=[figures[j],figures[i]];record(before);}return;}
 if(action==='new'||action==='sample'){finishText();if(dirty&&!confirm('現在のFigureを閉じます。必要な場合は先にCtrl+Sで保存してください。続けますか？'))return;const before=snapshot();if(action==='sample'){const demo=createDemo();doc=demo.doc;for(const [k,v]of demo.assets)assets.set(k,v);}else{doc=newDocument();doc.name='Fig. 1';}bookId=uid();preservedWorkspace=null;figures=[doc];selection=[];previewQuality.clear();record(before);fit();return;}
 if(action==='export-svg')return exportSVG();if(action==='export-png')return exportPNG();if(action==='export-pdf')return exportPDF();
 if(action==='attach-source'){if(selected().length!==1||selected()[0].type!=='image'){toast('画像・グラフを1つ選択してください');return;}$('#sourceInput').click();return;}
 if(action==='edit-source'){const o=selected()[0];if(o?.source)editSource(o);else toast('先に「元プロジェクトを関連付け」で .plotproject / .mifito を選択してください');return;}
}
const shortcut=createShortcutHandler({execute,isEditing:e=>e.target===editor?'canvas-text':e.target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName),isCanvasActive:()=>!document.querySelector('dialog[open]')&&(document.activeElement===svg||document.activeElement===document.body||document.activeElement===editor||!!document.activeElement?.closest('#figureTabs')),onHint:text=>{$('#keyHint').textContent=text;$('#keyHint').hidden=!text;}});
window.addEventListener('keydown',shortcut);document.addEventListener('pointerdown',()=>shortcut.reset());
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;execute(action);for(const d of $$('details[open]'))d.open=false;if(['new-figure','duplicate-figure','delete-figure','move-figure-left','move-figure-right'].includes(action)){focusFigure();return;}if(!['help','open','import','save','save-as','attach-source','edit-source','export-pdf'].includes(action)&&!editingId)svg.focus({preventScroll:true});});
for(const b of $$('[data-action="bold"],[data-action="italic"],[data-action="underline"]'))b.addEventListener('pointerdown',e=>{if(editingId)e.preventDefault();});
$('#docName').addEventListener('input',e=>{const name=e.target.value||'Untitled Figure';change(()=>doc.name=name);});
for(const [id,key]of [['pageWidth','width'],['pageHeight','height']])$('#'+id).addEventListener('change',e=>{const v=Number(e.target.value);if(v>=10&&v<=2000){change(()=>doc[key]=mm(v));fit();}else{toast('用紙サイズは10〜2000 mmです');renderInspector();}});
$('#zoom').addEventListener('input',e=>setScale(Number(e.target.value)/100));
$('#previewQuality').addEventListener('change',e=>{previewErrorShown=false;previewQuality.setQuality(Number(e.target.value));try{localStorage.setItem('figure-studio-preview-quality',e.target.value);}catch{}render();toast('プレビュー画質 '+e.target.selectedOptions[0].textContent+' · 書き出しは元の画質');});
for(const input of $$('[data-prop]'))input.addEventListener('change',()=>{const p=input.dataset.prop;let v=input.value;if(Object.hasOwn(ARROW_PROPERTIES,p)){change(()=>editable().forEach(o=>setArrowProperty(o,p,v)));return;}if(['x','y','w','h','rotation','fontSize','strokeWidth','opacity'].includes(p)){v=Number(v);if(!Number.isFinite(v))return;if(['x','y','w','h'].includes(p))v=mm(v);if(p==='opacity')v=Math.max(0,Math.min(1,v/100));if((p==='w'||p==='h')&&v<=0&&!editable().every(o=>['line','arrow'].includes(o.type)))return;if(p==='fontSize')v=Math.max(1,Math.min(1000,v));if(p==='strokeWidth')v=Math.max(0,Math.min(100,v));}change(()=>editable().forEach(o=>{if(['fontSize','fontFamily','text','textAlign'].includes(p)&&o.type!=='text')return;if((p==='w'||p==='h')&&o.type==='image'){const ratio=v/o[p];o[p==='w'?'h':'w']*=ratio;}o[p]=v;}));});

async function importImages(files,at){finishText();const documentId=doc.id,prepared=[];for(const f of files){try{const a=await imageAsset(f);prepared.push({a,f});}catch(e){toast(`${f.name||'画像'}: ${e.message}`);}}if(doc.id!==documentId){toast('Figureが切り替わったため画像追加を中止しました');return;}const before=snapshot(),ids=[];for(const {a,f}of prepared){assets.set(a.id,a);const size=importedImageSize(a,doc),point=at??imageInsertionPoint(doc,size,ids.length*mm(4));const o=makeObject('image',{...point,...size,assetId:a.id,name:f.name||'貼り付け画像'});doc.objects.push(o);ids.push(o.id);}selection=ids;record(before);svg.focus();}
function receiveDirectFigure(payload){
 if(updateReloading)return Promise.reject(Error('Figure Studioを更新しています。更新後にもう一度送ってください。'));
 const job=transferQueue.then(()=>importDirectFigure(payload));transferQueue=job.catch(()=>{});return job;
}
async function importDirectFigure(payload){
 const {app,project,preview,sourceName,transferId,image:sourceImage}=payload;
 if(app==='mifito'&&payload.batch)return syncMiFiToFigures(payload,{transferId});
 if(!['plot','mifito'].includes(app)||typeof transferId!=='string'||!transferId)throw Error('図の送信情報が不正です。');
 // Keep the transfer ID in the saved object, so an acknowledgement lost during
 // a reload cannot create a second copy when the sender retries.
 for(const f of figures){const existing=f.objects.find(o=>o.source?.transferId===transferId);if(existing){switchFigure(f.id);setSelection([existing.id]);return;}}
 if(project.size>280*1024*1024)throw Error('元プロジェクトは280 MB以内にしてください。');
 if(app==='mifito'&&sourceImage){const identity=await readMifitoIdentity(project),entry=identity.images.find(image=>image.imageId===sourceImage.imageId);if(identity.projectId!==sourceImage.projectId||entry?.fingerprint!==sourceImage.fingerprint)throw Error('画像とMiFiToプロジェクトの対応情報が一致しません。');}
 finishText();if(gesture)endGesture(null,true);const documentId=doc.id;
 const name=String(sourceName||`Figure${app==='mifito'?'.mifito':'.plotproject'}`).replace(/[\\/]/g,'_').slice(0,240);
 const [image,projectURL]=await Promise.all([imageAsset(preview,name.replace(/\.(plotproject|mifito)$/i,'')+(preview.type==='image/svg+xml'?'.svg':'.png')),blobToDataURL(project)]);
 if(doc.id!==documentId)throw Error('受け取り先のFigureが切り替わりました。もう一度送ってください。');
 const used=assetIds();let estimated=image.dataUrl.length+projectURL.length+JSON.stringify(snapshot()).length*3+4096;
 for(const id of used)estimated+=(assets.get(id)?.dataUrl?.length||0)+1024;
 if(estimated>400*1024*1024)throw Error('この追加でプロジェクトの400 MB上限を超えます。不要な図を減らしてください。');
 const before=snapshot(),source={id:uid(),name,mime:project.type||'application/octet-stream',dataUrl:projectURL};
 if(initialDemo&&revision===0){doc.objects=[];doc.name='Fig. 1';initialDemo=false;}
 const size=importedImageSize(image,doc,app);
 const offset=(doc.objects.filter(o=>o.type==='image').length%6)*mm(4);
 const panel=makeObject('image',{...imageInsertionPoint(doc,size,offset),...size,assetId:image.id,name:sourceImage?.name||name.replace(/\.(plotproject|mifito)$/i,''),source:{app,name,assetId:source.id,transferId,...(app==='mifito'&&sourceImage?{projectId:sourceImage.projectId,imageId:sourceImage.imageId,fingerprint:sourceImage.fingerprint}:{})}});
 assets.set(image.id,image);assets.set(source.id,source);doc.objects.push(panel);selection=[panel.id];record(before);svg.focus({preventScroll:true});
 try{const rev=revision;await saveDraft(snapshot(),assets);if(revision===rev)$('#saveStatus').textContent='ブラウザに保存済み';toast(`${SOURCE_APPS[app].name}から追加し、元プロジェクトを関連付けました`);}
 catch{toast('図と元プロジェクトを追加しました。自動保存できないためCtrl+Sで保存してください。');}
}
$('#imageInput').addEventListener('change',async e=>{await importImages([...e.target.files]);e.target.value='';});
viewport.addEventListener('dragover',e=>{e.preventDefault();viewport.classList.add('drag-over');});viewport.addEventListener('dragleave',()=>viewport.classList.remove('drag-over'));
viewport.addEventListener('drop',async e=>{e.preventDefault();viewport.classList.remove('drag-over');const files=[...e.dataTransfer.files];if(files.length===1&&/\.(figurestudio|json)$/i.test(files[0].name)){if(projectSaving||projectOpening||updateReloading)return;projectOpening=true;updateProjectFileUI();try{await readProject(files[0]);}finally{projectOpening=false;updateProjectFileUI();}}else await importImages(files,svgPoint(e));});
function clipboardActive(e){return !editingId&&!e.target.isContentEditable&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!document.querySelector('dialog[open]')&&(document.activeElement===svg||document.activeElement===document.body);}
document.addEventListener('copy',e=>{if(!clipboardActive(e)||!selection.length)return;clipboard=clone(selected());e.clipboardData.setData('application/x-figure-studio',JSON.stringify(clipboard));e.clipboardData.setData('text/plain','Figure Studio objects');e.preventDefault();toast('コピーしました');});
document.addEventListener('cut',e=>{if(!clipboardActive(e)||!selection.length)return;clipboard=clone(selected());e.clipboardData.setData('application/x-figure-studio',JSON.stringify(clipboard));e.clipboardData.setData('text/plain','Figure Studio objects');e.preventDefault();execute('delete');});
document.addEventListener('paste',async e=>{if(!clipboardActive(e))return;const files=[...e.clipboardData.files].filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();await importImages(files);return;}let copied;try{const raw=e.clipboardData.getData('application/x-figure-studio');if(raw)copied=JSON.parse(raw);}catch{}if(!copied&&e.clipboardData.getData('text/plain')==='Figure Studio objects')copied=clipboard;if(copied?.length){e.preventDefault();const temp={...doc,objects:copied};try{validateDocument(temp);}catch{return;}change(()=>{const groups=new Map();const added=copied.map(o=>{const n=clone(o);n.id=uid();n.x+=mm(3);n.y+=mm(3);if(n.groupId){if(!groups.has(n.groupId))groups.set(n.groupId,uid());n.groupId=groups.get(n.groupId);}return n;});doc.objects.push(...added);selection=added.map(o=>o.id);});}else{const text=e.clipboardData.getData('text/plain');if(text&&text.length<100000){e.preventDefault();change(()=>{const o=makeObject('text',{text});doc.objects.push(o);selection=[o.id];});}}});

function assetIds(){syncFigure();return new Set(figures.flatMap(f=>f.objects.flatMap(o=>[o.assetId,o.source?.assetId])).filter(Boolean));}
function packageProject(){const used={};for(const id of assetIds()){const a=assets.get(id);if(a){const {previewUrl,persisted,...rest}=a;used[id]=rest;}}return {...snapshot(),assets:used,...(preservedWorkspace?{workspace:preservedWorkspace}:{})};}
function workspacePersistence(){const api=getFigureWorkspace(window);return api?installWorkspacePersistence(api,{windowRef:window.parent,documentRef:window.parent.document}):null;}
function updateProjectFileUI(){
 const target=projectFiles.target(bookId),busy=projectSaving||projectOpening,button=$('[data-action="save"]');
 button.disabled=busy;$('[data-action="save-as"]').disabled=busy;$('[data-action="open"]').disabled=busy;
 $('#projectSaveLabel').textContent=projectSaving?'保存中…':target?.handle?'上書き保存':'保存';
 button.title=target?.handle?`${target.name} に上書き保存 (Ctrl+S)`:'保存先を選んでプロジェクトを保存 (Ctrl+S)';
 $('#projectSaveTarget').textContent=target?.name||'保存先を選択';
 $('#projectSaveTarget').title=target?.name||'';
}
async function saveProject(saveAs=false){
 if(projectSaving||projectOpening||updateReloading)return;
 if(gesture)endGesture(null,false);finishText();
 const capturedBook=bookId;
 try{
  projectSaving=true;updateProjectFileUI();
  const name=`${safeName(figures[0].name)}${figures.length>1?`_and_${figures.length}_figures`:''}.figurestudio`;
  // The picker must be invoked while this trusted click still has activation.
  const target=await projectFiles.prepare({bookId:capturedBook,name,saveAs});
  await transferQueue;
  if(bookId!==capturedBook)throw Error('保存先を選ぶ間にプロジェクトが変わりました。もう一度保存してください。');
  if(gesture)endGesture(null,false);finishText();
  const capturedRevision=revision,packaged=packageProject(),workspace=workspacePersistence();
  const captured=workspace?await workspace.captureWorkspace():null;
  if(bookId!==capturedBook||revision!==capturedRevision)throw Error('保存中にFigureの内容が変わりました。もう一度保存してください。');
  if(captured)packaged.workspace=captured.data;
  const blob=new Blob([JSON.stringify(packaged)],{type:'application/json'});
  if(blob.size>400*1024*1024)throw Error('全体の保存サイズが400 MBを超えています。不要なFigureや画像を減らしてください。');
  const saved=await projectFiles.write(target,{revision:capturedRevision,blob});
  try{await saveProjectFileTarget(saved.bookId,{handle:saved.handle,name:saved.name});}catch{}
  const editorsUnchanged=captured?await workspace.markWorkspaceSaved(captured):true;
  if(bookId===saved.bookId)preservedWorkspace=packaged.workspace??null;
  if(bookId===saved.bookId&&revision===saved.revision&&!editingId&&!gesture&&editorsUnchanged){dirty=false;manualSavedRevision=saved.revision;toast(`${saved.name} に${captured?'3タブの最新状態と未反映の編集':'配置・画像・元プロジェクト'}を保存しました`);}
  else{if(bookId===saved.bookId)dirty=true;toast(`${saved.name} を保存しました。保存開始後の編集は次の保存で反映されます`);}
 }catch(error){toast(error.name==='AbortError'?'保存をキャンセルしました':`保存できませんでした: ${error.message}`);}
 finally{projectSaving=false;updateProjectFileUI();if(!editingId&&!gesture&&document.activeElement?.closest('#projectSaveControls'))svg.focus();}
}

async function openProject(){
 if(projectSaving||projectOpening||updateReloading)return;
 if(typeof window.showOpenFilePicker!=='function'){return $('#projectInput').click();}
 projectOpening=true;updateProjectFileUI();
 try{const [handle]=await window.showOpenFilePicker(projectFilePickerOptions({open:true,startIn:projectFiles.target(bookId)?.handle}));if(handle)await readProject(await handle.getFile(),handle);}
 catch(error){if(error.name!=='AbortError')toast(`開けませんでした: ${error.message}`);}
 finally{projectOpening=false;updateProjectFileUI();}
}
async function savedEditorBindings(decoded,next,loaded){
 const bindings={plot:null,mifito:null};
 if(!decoded)return bindings;
 const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
 for(const app of ['plot','mifito']){
  const binding=validateWorkspaceBinding(decoded.editors[app]?.binding??null);if(!binding)continue;
  if(binding.app!==app)throw Error('保存された編集アプリの関連付けが正しくありません。');
  for(const figure of next.figures){
   const panel=figure.objects.find(o=>o.id===binding.panelId&&o.source?.app===app&&sourceEditKey(next.id,figure.id,o.id,o.source.assetId)===binding.editKey);
   if(!panel)continue;const asset=loaded.get(panel.source.assetId);if(!asset)continue;
   const baseline=dataURLToBlob(asset.dataUrl);
   if(baseline.size===binding.baselineProject.size&&await digest(baseline)===await digest(binding.baselineProject)){
    // Older workspaces could retain A's bridge after the editor opened B.
    // Preserve those local edits while detaching only the stale association.
    if(app==='mifito'){
     const currentProjectId=decoded.editors.mifito.state?.ui?.figureStudioProjectId;
     if(!currentProjectId||currentProjectId!==(await readMifitoIdentity(baseline)).projectId)break;
    }
    bindings[app]={...binding,baselineProject:baseline,sourceName:panel.source.name};
   }
   break;
  }
 }
 return bindings;
}
async function connectSavedEditors(bindings){
 for(const app of ['plot','mifito'])if(bindings[app]){
  const figure=figures.find(f=>f.objects.some(o=>o.id===bindings[app].panelId&&o.source?.app===app&&sourceEditKey(bookId,f.id,o.id,o.source.assetId)===bindings[app].editKey));
  const panel=figure?.objects.find(o=>o.id===bindings[app].panelId);
  if(panel){const session=editSource(panel,{figureId:figure.id});if(!(await session.ready).connected)throw Error('復元した編集画面へ接続できませんでした。');}
 }
}
async function readProject(file,handle=null){
 let plan=null,previous=null,previousBindings=null;
 try{
  if(file.size>400*1024*1024)throw Error('プロジェクトは400 MB以内で開いてください。');
  const raw=JSON.parse(await file.text()),next=raw.format==='figure-studio-book'?validateBook(raw):{format:'figure-studio-book',version:1,id:uid(),activeId:raw.id,figures:[validateDocument(raw)]};
  const loaded=new Map(),imageIds=new Set(next.figures.flatMap(f=>f.objects.filter(o=>o.type==='image').map(o=>o.assetId)));
  for(const[id,a]of Object.entries(raw.assets||{})){
   if(typeof a.dataUrl!=='string'||!a.dataUrl.startsWith('data:'))throw Error('素材データが不正です。');
   if(imageIds.has(id)){const restored=await imageAsset(dataURLToBlob(a.dataUrl),a.name);loaded.set(id,{...restored,id});}else loaded.set(id,{...a,id});
  }
  for(const o of next.figures.flatMap(f=>f.objects))if(o.assetId&&!loaded.has(o.assetId)||o.source?.assetId&&!loaded.has(o.source.assetId))throw Error('必要な素材がありません。');
  const workspace=workspacePersistence(),hasEditorChanges=workspace?await workspace.hasWorkspaceChanges():false;
  if(gesture)endGesture(null,true);finishText();
  if((dirty||hasEditorChanges)&&!confirm('現在の作業内容を閉じて、選択したプロジェクトを開きますか？'))return;
  if(workspace)plan=await workspace.prepareWorkspaceRestore(raw.workspace??null);
  else if(raw.workspace)await decodeWorkspaceState(raw.workspace);
  const bindings=plan?await savedEditorBindings(plan.decoded,next,loaded):null;
  previous={book:snapshot(),assets,selection:[...selection],dirty,revision,manualSavedRevision,preservedWorkspace,past:history.past,future:history.future};
  if(plan){previousBindings=await savedEditorBindings({editors:plan.previousEditors},previous.book,previous.assets);await plan.apply();}
  closeSourceSessions();
  restoreBook(next);renumberFigureNames(figures);assets=loaded;preservedWorkspace=raw.workspace??null;previewQuality.clear();history.reset();selection=[];dirty=false;revision++;manualSavedRevision=revision;render();fit();
  if(plan){
   await plan.bind(bindings);
   await connectSavedEditors(bindings);
   await plan.complete();
  }
  projectFiles.opened(bookId,{handle,name:file.name});const openedBook=bookId;
  scheduleSave();try{await saveProjectFileTarget(openedBook,{handle,name:file.name});}catch{}
  toast(raw.workspace?'3タブの最新状態と未反映の編集を復元しました':'プロジェクトを開きました');
 }catch(error){
  if(previous)closeSourceSessions();
  if(previous){restoreBook(previous.book);assets=previous.assets;selection=previous.selection;dirty=previous.dirty;revision=previous.revision;manualSavedRevision=previous.manualSavedRevision;preservedWorkspace=previous.preservedWorkspace;history.past=previous.past;history.future=previous.future;render();}
  try{await plan?.cancel();if(previousBindings)await connectSavedEditors(previousBindings);}catch(rollbackError){toast(rollbackError.message);return;}
  toast(`開けませんでした: ${error.message}`);
 }
}

$('#projectInput').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file||projectSaving||projectOpening||updateReloading)return;projectOpening=true;updateProjectFileUI();try{await readProject(file);}finally{projectOpening=false;updateProjectFileUI();}});
$('#sourceInput').addEventListener('change',async e=>{const f=e.target.files[0],o=selected()[0];e.target.value='';if(!f||!o)return;const documentId=doc.id,panelId=o.id;try{if(f.size>280*1024*1024)throw Error('元プロジェクトは280 MB以内です。');const app=/\.mifito$/i.test(f.name)?'mifito':'plot',a={id:uid(),name:f.name,mime:'application/octet-stream',dataUrl:await blobToDataURL(f)};if(doc.id!==documentId)return;const target=doc.objects.find(n=>n.id===panelId);if(!target)return;assets.set(a.id,a);change(()=>target.source={app,name:f.name,assetId:a.id});toast('元プロジェクトを関連付けました');}catch(error){toast(error.message);}});
function sourceEditKey(book,figure,panel,sourceAsset){return [book,figure,panel,sourceAsset].join('/');}
const mifitoIdentities=new Map();
function mifitoIdentity(asset){
 if(!asset) return Promise.reject(Error('元のMiFiToプロジェクトがありません。'));
 if(!mifitoIdentities.has(asset.id))mifitoIdentities.set(asset.id,readMifitoIdentity(dataURLToBlob(asset.dataUrl)));
 return mifitoIdentities.get(asset.id);
}
function syncSummary(summary){return summary.updated||summary.added?`${summary.updated}枚を更新、${summary.added}枚を追加、${summary.unchanged}枚は変更なし`:`変更はありません（${summary.unchanged}枚をスキップ）`;}
async function syncMiFiToFigures(result,{guard,anchorPanelId,targetFigureId=doc.id,transferId}={}){
 if(updateReloading)throw Error('Figure Studioの更新後にもう一度反映してください。');
 const expectedBook=bookId,check=()=>{if(bookId!==expectedBook||!figures.some(f=>f.id===targetFigureId))throw Error('受け取り先のFigureが変わりました。対象の図を開き直してください。');guard?.();};
 check();const anchor=guard?.(),identity=await readMifitoIdentity(result.project);
 const incoming=result.batch||{projectId:result.image?.projectId,images:[{...result.image,preview:result.preview}]};
 if(incoming.projectId!==identity.projectId)throw Error('画像とMiFiToプロジェクトの対応情報が一致しません。');
 const definitions=new Map(identity.images.map(image=>[image.imageId,image]));
 for(const image of incoming.images){const defined=definitions.get(image.imageId);if(!defined||defined.fingerprint!==image.fingerprint)throw Error('画像とMiFiToの編集設定が一致しません。もう一度反映してください。');}
 if(anchor){const origin=await mifitoIdentity(assets.get(anchor.source.assetId));if(origin.projectId!==identity.projectId)throw Error('別のMiFiToプロジェクトが開いています。元のプロジェクトを開き直してください。');}
 check();syncFigure();const identityByAsset=new Map();
 const legacyIds=new Set(figures.flatMap(f=>f.objects.filter(o=>o.source?.app==='mifito'&&(!o.source.projectId||!o.source.imageId)).map(o=>o.source.assetId)));
 for(const id of legacyIds){try{identityByAsset.set(id,await mifitoIdentity(assets.get(id)));}catch{/* Unrelated old attachments remain untouched. */}}
 check();let plan=planMiFiToSync(figures,incoming,identityByAsset,{anchorPanelId});
 const prepared=new Map(),needed=new Set([...plan.matches.filter(m=>m.changed).map(m=>m.imageId),...plan.additions.map(m=>m.imageId)]);
 for(const image of incoming.images)if(needed.has(image.imageId))prepared.set(image.imageId,await imageAsset(image.preview,image.name));
 check();if(gesture)endGesture(null,true);finishText();syncFigure();
 // Re-plan after decoding so deleted/relinked images are never overwritten and
 // changes made to placement during decoding are kept.
 plan=planMiFiToSync(figures,incoming,identityByAsset,{anchorPanelId});
 for(const id of [...plan.matches.filter(m=>m.changed).map(m=>m.imageId),...plan.additions.map(m=>m.imageId)])if(!prepared.has(id))throw Error('反映中に画像の対応が変わりました。もう一度反映してください。');
 const previousSizes=new Map();
 for(const match of plan.matches.filter(m=>m.changed)){
  const panel=figures.find(f=>f.id===match.figureId)?.objects.find(o=>o.id===match.panelId);
  if(panel&&!previousSizes.has(panel.assetId)){
   const asset=assets.get(panel.assetId),[physical,body]=await Promise.all([imagePhysicalSize(asset),imageMiFiToBodySize(asset)]);
   previousSizes.set(panel.assetId,{physical,body});
  }
 }
 check();
 const needsIdentity=plan.linked.some(link=>{const panel=figures.find(f=>f.id===link.figureId)?.objects.find(o=>o.id===link.panelId);return !panel?.source?.projectId||!panel.source.imageId||!panel.source.fingerprint;});
 const response=()=>{
  const panel=figures.find(f=>f.id===targetFigureId)?.objects.find(o=>o.id===anchorPanelId),link=plan.linked.find(m=>m.panelId===anchorPanelId);
  const anchorImageId=panel?.source?.imageId||link?.imageId;
  return {summary:plan.summary,message:syncSummary(plan.summary),anchorSourceAssetId:panel?.source?.assetId,anchorImageId,detached:!!anchorImageId&&!definitions.has(anchorImageId)};
 };
 if(!plan.summary.updated&&!plan.summary.added&&!needsIdentity){const done=response();toast(done.message);return done;}
 const name=String(result.sourceName||'figure.mifito').replace(/[\\/]/g,'_').slice(0,240);
 const project={id:uid(),name,mime:result.project.type||'application/octet-stream',dataUrl:await blobToDataURL(result.project)};
 check();syncFigure();
 // Source associations must still be the ones used to prepare this atomic edit.
 for(const link of plan.linked){const panel=figures.find(f=>f.id===link.figureId)?.objects.find(o=>o.id===link.panelId);if(panel?.source?.assetId!==link.sourceAssetId)throw Error('反映中に元プロジェクトの関連付けが変わりました。もう一度反映してください。');}
 plan=planMiFiToSync(figures,incoming,identityByAsset,{anchorPanelId});
 for(const id of [...plan.matches.filter(m=>m.changed).map(m=>m.imageId),...plan.additions.map(m=>m.imageId)])if(!prepared.has(id))throw Error('反映中に画像の対応が変わりました。もう一度反映してください。');
 const incomingById=new Map(incoming.images.map(image=>[image.imageId,image]));
 const linked=new Map(plan.linked.filter(link=>{const image=incomingById.get(link.imageId);return definitions.has(link.imageId)&&!(image?.unchanged===true&&image.fingerprint!==link.fingerprint);}).map(link=>[link.panelId,link]));
 const changed=new Map(plan.matches.filter(m=>m.changed).map(m=>[m.panelId,m]));
 const next=figures.map(f=>({...f,objects:f.objects.map(o=>{
  const link=linked.get(o.id);if(!link)return o;const update=changed.get(o.id);
  let replacement={};
  if(update){
   const asset=prepared.get(update.imageId),previous=previousSizes.get(o.assetId);
   if(!previous)throw Error('反映中に画像が置き換わりました。もう一度反映してください。');
   replacement={assetId:asset.id,...replacedMiFiToImageSize(o,previous.physical,asset.physicalSize,previous.body,asset.mifitoBodySize)};
  }
  return {...o,...replacement,source:{...o.source,app:'mifito',name,assetId:project.id,projectId:identity.projectId,imageId:link.imageId,fingerprint:update?update.image.fingerprint:link.fingerprint}};
 })}));
 const destination=next.find(f=>f.id===targetFigureId),added=[];
 if(initialDemo&&revision===0&&!guard){destination.objects=[];destination.name='Fig. 1';}
 for(const image of plan.additions){const asset=prepared.get(image.imageId),size=importedImageSize(asset,destination,'mifito'),offset=(destination.objects.filter(o=>o.type==='image').length%6)*mm(4);
  const panel=makeObject('image',{...imageInsertionPoint(destination,size,offset),...size,assetId:asset.id,name:image.name,source:{app:'mifito',name,assetId:project.id,projectId:identity.projectId,imageId:image.imageId,fingerprint:image.fingerprint,...(transferId?{transferId}: {})}});
  destination.objects.push(panel);added.push(panel.id);
 }
 const newAssets=new Map([...prepared.values()].map(a=>[a.id,a]));newAssets.set(project.id,project);
 const used=new Set(next.flatMap(f=>f.objects.flatMap(o=>[o.assetId,o.source?.assetId])).filter(Boolean));let estimated=JSON.stringify(next).length*3+4096;
 for(const id of used)estimated+=(newAssets.get(id)||assets.get(id))?.dataUrl?.length||0;
 if(estimated>400*1024*1024)throw Error('この反映でプロジェクトの400 MB上限を超えます。不要な図を減らしてください。');
 check();const before=snapshot(),activeId=doc.id;for(const[id,asset]of newAssets)assets.set(id,asset);
 figures=next;doc=figures.find(f=>f.id===activeId);if(initialDemo&&revision===0&&!guard)initialDemo=false;
 if(doc.id===targetFigureId&&added.length)selection=added;record(before);mifitoIdentities.set(project.id,Promise.resolve(identity));
 const done=response();
 try{const rev=revision;await saveDraft(snapshot(),assets);if(revision===rev)$('#saveStatus').textContent='ブラウザに保存済み';toast(done.message);}
 catch{toast(done.message+'。自動保存できないためCtrl+Sで保存してください。');}
 return done;
}
function editSource(o,{figureId=doc.id}={}){
 const documentId=figureId,editingBook=bookId,panelId=o.id,app=o.source?.app;
 let expectedSourceAsset=o.source?.assetId;
 const asset=assets.get(expectedSourceAsset);if(!asset){toast('元プロジェクトを関連付けてください');return;}
 const locate=()=>{
  if(bookId!==editingBook)throw Error('別のプロジェクトが開いています。元のFigureプロジェクトへ戻ってから編集を開き直してください。');
  syncFigure();const figure=figures.find(f=>f.id===documentId),target=figure?.objects.find(v=>v.id===panelId);
  if(!target)throw Error('編集対象のパネルがありません。');
  if(target.source?.assetId!==expectedSourceAsset||target.source?.app!==app)throw Error('元プロジェクトの関連付けが変更されています。対象の図を開き直してください。');
  return target;
 };
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 bridge=openSource({app,project:dataURLToBlob(asset.dataUrl),sourceName:o.source.name,panelId,imageId:o.source.imageId,
  editKey:sourceEditKey(editingBook,documentId,panelId,expectedSourceAsset),
  url:local?new URL(new URL(SOURCE_APPS[app].url).pathname,location.href).href:undefined,
  onStatus:({state,message,downloadProject,openInNewTab})=>{toast(message);if(['unavailable','blocked','error'].includes(state)){const box=$('#sourceSummary');box.textContent=message;if(downloadProject){const b=document.createElement('button');b.type='button';b.textContent='元プロジェクトを保存';b.onclick=downloadProject;box.append(b);}if(openInNewTab){const b=document.createElement('button');b.type='button';b.textContent='新しい編集タブで開く';b.onclick=()=>{bridge=openInNewTab();};box.append(b);}}},
  onResult:async result=>{
   try{
    if(app==='mifito'&&(result.batch||result.image)){
     const done=await syncMiFiToFigures(result,{guard:locate,anchorPanelId:panelId,targetFigureId:documentId});
     expectedSourceAsset=done.anchorSourceAssetId||expectedSourceAsset;
     return {editKey:sourceEditKey(editingBook,documentId,panelId,expectedSourceAsset)+(done.detached?'/detached':''),imageId:done.anchorImageId,message:done.message,summary:done.summary};
    }
    const original=locate(),previousSize=app==='plot'?await imagePhysicalSize(assets.get(original.assetId)):null,image=await imageAsset(result.preview,original.name),project={id:uid(),name:result.sourceName,mime:'application/octet-stream',dataUrl:await blobToDataURL(result.project)};
    locate();if(gesture)endGesture(null,true);finishText();const target=locate(),before=snapshot();
    Object.assign(target,replacedImageSize(app,target,previousSize,image.physicalSize));
    assets.set(image.id,image);assets.set(project.id,project);target.assetId=image.id;target.source={...target.source,app:result.app,name:result.sourceName,assetId:project.id};
    expectedSourceAsset=project.id;record(before);toast('元アプリの編集結果を反映しました');
    return {editKey:sourceEditKey(editingBook,documentId,panelId,expectedSourceAsset)};
   }catch(error){toast('反映できませんでした: '+error.message);throw error;}
  }
 });
 return bridge;
}

function buildExport(){finishText();const out=el('svg',{xmlns:ns,width:`${toMM(doc.width)}mm`,height:`${toMM(doc.height)}mm`,viewBox:`0 0 ${doc.width} ${doc.height}`});out.append(el('rect',{width:doc.width,height:doc.height,fill:'#ffffff'}));for(const o of doc.objects){const g=el('g');drawContent(o,g,true);g.removeAttribute('data-id');g.removeAttribute('style');out.append(g);}return new XMLSerializer().serializeToString(out);}
function validateBook(raw){if(raw.format!=='figure-studio-book'||raw.version!==1||!Array.isArray(raw.figures)||!raw.figures.length||raw.figures.length>100)throw Error('Figureの構成が不正です（最大100枚）。');const ids=new Set();const figs=raw.figures.map(f=>{const d=validateDocument(f);if(typeof d.id!=='string'||ids.has(d.id))throw Error('Figure IDが不正です。');ids.add(d.id);return d;});return {format:'figure-studio-book',version:1,id:typeof raw.id==='string'?raw.id:uid(),activeId:ids.has(raw.activeId)?raw.activeId:figs[0].id,figures:figs};}
function safeName(s){return s.replace(/[\\/:*?"<>|]/g,'_').slice(0,120)||'Figure';}
function exportSVG(){download(new Blob([buildExport()],{type:'image/svg+xml'}),`${safeName(doc.name)}.svg`);toast('SVGを保存しました（文字・線はベクター）');}
function withPNGResolution(blob,dpi){return blob.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer),pp=Math.round(dpi/0.0254),chunk=new Uint8Array(21);new DataView(chunk.buffer).setUint32(0,9);chunk.set([112,72,89,115],4);new DataView(chunk.buffer).setUint32(8,pp);new DataView(chunk.buffer).setUint32(12,pp);chunk[16]=1;let crc=0xffffffff;for(const b of chunk.slice(4,17)){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}new DataView(chunk.buffer).setUint32(17,(crc^0xffffffff)>>>0);return new Blob([bytes.slice(0,33),chunk,bytes.slice(33)],{type:'image/png'});});}
async function exportPNG(){try{const dpi=Number($('#exportDpi').value),w=Math.round(doc.width/72*dpi),h=Math.round(doc.height/72*dpi);if(w*h>100000000||w>16384||h>16384)throw Error('出力が大きすぎます。DPIまたは用紙サイズを下げてください。');toast('PNGを書き出しています…');const s=buildExport(),url=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('PNGの生成に失敗しました');download(await withPNGResolution(blob,dpi),`${safeName(doc.name)}_${dpi}dpi.png`);c.width=c.height=1;toast(`${w} × ${h} px・${dpi} dpiで保存しました`);}finally{URL.revokeObjectURL(url);}}catch(e){toast(e.message);}}
function exportPDF(){const s=buildExport(),win=window.open('','figure-studio-print');if(!win){toast('PDF保存用の別タブを許可してください');return;}win.document.open();win.document.write(`<!doctype html><html><head><title>Figure PDF</title><style>@page{size:${toMM(doc.width)}mm ${toMM(doc.height)}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${toMM(doc.width)}mm;height:${toMM(doc.height)}mm}@media screen{body{background:#ddd;padding:20px}svg{background:white}}</style></head><body>${s}</body></html>`);win.document.close();Promise.all([win.document.fonts.ready,...[...win.document.querySelectorAll('svg image')].map(i=>{const image=new win.Image();image.src=i.getAttribute('href');return image.decode();})]).then(()=>win.print()).catch(()=>toast('画像の読み込みが完了しませんでした。SVG保存をお使いください'));toast('印刷画面で「PDFに保存」、倍率100%、余白なしを選んでください');}

svg.addEventListener('contextmenu',e=>{e.preventDefault();finishText();const id=e.target.closest('[data-id]')?.dataset.id;if(id&&!selection.includes(id))setSelection([id]);const menu=$('#contextMenu');menu.replaceChildren();for(const[label,action,key]of [['複製','duplicate','Ctrl+D'],['最前面へ','front','Alt → 3'],['最背面へ','back','Alt → 4'],['一段前へ','forward',''],['一段後ろへ','backward',''],['左揃え','align-left','Alt → 5 → L'],['グループ化','group','Ctrl+G'],['グループ解除','ungroup','Ctrl+Shift+G'],['固定 / 解除','lock',''],['元アプリで編集','edit-source',''],['削除','delete','Delete']]){const b=document.createElement('button');b.type='button';b.textContent=label;const k=document.createElement('kbd');k.textContent=key;b.append(k);b.onclick=()=>{menu.hidden=true;execute(action);svg.focus();};menu.append(b);}menu.hidden=false;menu.style.left=`${Math.min(e.clientX,innerWidth-250)}px`;menu.style.top=`${Math.min(e.clientY,innerHeight-450)}px`;});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#contextMenu'))$('#contextMenu').hidden=true;for(const d of $$('details[open]'))if(!d.contains(e.target))d.open=false;});
window.addEventListener('beforeunload',e=>{if(projectSaving||dirty||(editingId&&textBefore&&JSON.stringify(snapshot())!==JSON.stringify(textBefore))){e.preventDefault();e.returnValue='';}});
window.addEventListener('resize',()=>{if(!gesture)renderOverlay();});
try{const restored=await loadDraft();if(restored){if(restored.doc.format==='figure-studio-book')restoreBook(validateBook(restored.doc));else{doc=validateDocument(restored.doc);figures=[doc];}assets=restored.assets;$('#saveStatus').textContent='ブラウザから復元';}else{const demo=createDemo();doc=demo.doc;figures=[doc];assets=demo.assets;initialDemo=true;$('#saveStatus').textContent='デモ · 模擬データ';}}catch{const demo=createDemo();doc=demo.doc;figures=[doc];assets=demo.assets;initialDemo=true;$('#saveStatus').textContent='自動保存を利用できません';}
try{const target=await loadProjectFileTarget(bookId);if(target)projectFiles.opened(bookId,target);}catch{}
renumberFigureNames(figures);render();fit();setTool('select');
const workspaceReceiver=setupTransferReceiver({onImport:receiveDirectFigure,onStatus:({state,message})=>{if(state==='error')toast(message);}});
window.FigureStudioWorkspaceReceiverId=workspaceReceiver.receiverId;
setupUpdateCheck({onStatus:toast,beforeReload:async()=>{
 if(projectSaving||projectOpening)throw Error('プロジェクトの保存・読み込みが完了してから更新してください。');
 updateReloading=true;
 try{await transferQueue;if(gesture)endGesture(null,true);finishText();const rev=revision;clearTimeout(saveTimer);await saveDraft(snapshot(),assets);if(rev!==revision)throw Error('保存中に変更がありました。もう一度「更新する」を押してください。');dirty=false;return true;}
 catch(error){updateReloading=false;throw error;}
}});
window.FigureStudioWorkspaceSave=async()=>{
 if(projectSaving||projectOpening)throw Error('プロジェクトの保存・読み込みが完了してから更新してください。');
 await transferQueue;
 if(projectSaving||projectOpening)throw Error('プロジェクトの保存・読み込みが完了してから更新してください。');
 if(gesture)endGesture(null,false);finishText();syncFigure();
 const saved={bookId,revision};clearTimeout(saveTimer);
 await saveDraft(snapshot(),assets);
 if(bookId!==saved.bookId||revision!==saved.revision||projectSaving||projectOpening||editingId||gesture)throw Error('保存中に変更がありました。もう一度「更新する」を押してください。');
 return true;
};
