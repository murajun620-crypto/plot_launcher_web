import {sourceSaveMessage} from './source-project-save.mjs?v=source-save-v0736-1';
import {fitTextBox,naturalTextLines} from './text-fit.mjs?v=nested-groups-v0712-1';
import {regroupObjects,ungroupObjects,remapGroupIds} from './groups.mjs?v=nested-groups-v0712-1';
import {PT_PER_MM,mm,toMM,uid,clone,newDocument,makeObject,bounds,objectBounds,expandSelection,align,distribute,reorder,autoLayout,History,validateDocument,rotateOrFlip} from './model.mjs?v=source-save-v0736-1';
import {isPathObject,pathData,objectFromPoints} from './paths.mjs?v=ribbon-v060-1';
import {createPathDrawing} from './path-drawing.mjs?v=ribbon-v060-1';
import {imageAsset,imagePhysicalSize,imageMiFiToBodySize,blobToDataURL,dataURLToBlob,download,sanitizeSVG} from './assets.mjs?v=source-save-v0736-1';
import {serializeOfficeSVG} from './svg-export.mjs?v=source-save-v0736-1';
import {preparePNG} from './png-export.mjs?v=source-save-v0736-1';
import {importedImageSize,replacedImageSize,replacedMiFiToImageSize,miFiToSizeCorrection,imageInsertionPoint} from './image-placement.mjs?v=source-save-v0736-1';
import {rasterResolution} from './image-resolution.mjs?v=image-quality-v066-1';
import {encodeProjectFile,readProjectFile} from './project-format.mjs?v=workspace-source-status-v0751-1';
import {saveDraft,loadDraft,saveProjectFileTarget,loadProjectFileTarget} from './storage.mjs?v=0.3.6-1';
import {createProjectWorkFolders,isProjectFolder} from './work-folder.mjs?v=workspace-source-status-v0751-1';
import {createSourcePrefetch} from './source-prefetch.mjs?v=workspace-source-status-v0751-1';
import {findProjectsInWorkFolder} from '../source-folder.mjs?v=workspace-source-status-v0751-1';
import {stageStudioUpdate,restoreStudioUpdate,isLegacyStudioUpdate,finishLegacyStudioUpdate} from './startup-session.mjs?v=source-save-v0736-1';
import {createDemo} from './demo.mjs?v=source-save-v0736-1';
import {createShortcutHandler,shortcutLabel} from './shortcuts.mjs?v=nested-groups-v0712-1';
import {installShortcutUI} from './shortcut-ui.mjs?v=source-save-v0736-1';
import {createRibbon} from './ribbon.mjs?v=source-save-v0736-1';
import {createPresentation} from './presentation.mjs?v=source-save-v0736-1';
import {installBrowserZoomGuard} from './browser-zoom.mjs?v=source-save-v0736-1';
import {imageArrayUnits,arrangeImageArray} from './image-array.mjs?v=source-save-v0736-1';
import {createImageArrayDialog} from './image-array-dialog.mjs?v=source-save-v0736-1';
import {writePanelLabelContent} from './panel-label-content.mjs?v=source-save-v0736-1';
import {createPanelLabelEditor} from './panel-label-editor.mjs?v=panel-label-tex-v0737-1';
import {applyPanelLabels} from './panel-labels.mjs?v=panel-label-tex-v0737-1';
import {plotPanelBounds} from './plot-frame.mjs?v=source-save-v0736-1';
import {createPanelLabelDialog} from './panel-label-dialog.mjs?v=tex-spacing-v0738-1';
import {createColorPickers} from './colors.mjs?v=unified-palette-1';
import {renderTextPaint} from './text-paint.mjs?v=tex-v061-1';
import {createTexRenderer} from './tex.mjs?v=panel-label-tex-v0737-1';
import {createLiveTexPreview} from './live-tex-preview.mjs?v=panel-label-tex-v0737-1';
import {openSource,SOURCE_APPS,setupSourceDiscovery,closeSourceSessions} from './integration/bridge-client.mjs?v=studio-send-v0714-1';
import {createFigureSidebar} from './thumbnails.mjs?v=live-v062-1';
import {setupTransferReceiver,getFigureWorkspace} from './integration/direct-transfer.mjs?v=studio-send-v0714-1';
import {readMifitoIdentity} from './integration/mifito-sync.mjs?v=0.3.5-1';
import {createProjectFileLinks} from '../project-file-links.mjs?v=350ab99f2d1c';
import {readPlotIdentity,openedPlotIdentity,resolvePlotImage,currentPlotImageId} from './integration/plot-sync.mjs?v=source-save-v0736-1';
import {planMiFiToSync} from './mifito-batch.mjs?v=source-save-v0736-1';
import {setupUpdateCheck} from './update-check.mjs?v=source-save-v0736-1';
import {installWorkspaceUpdater} from './workspace-update.mjs?v=workspace-source-status-v0751-1';
import {marqueeSelection,resolveObjectSelection,clickObjectSelection,selectionDescription} from './selection.mjs?v=source-save-v0736-1';
import {renderGroupLayers} from './group-layers.mjs?v=source-save-v0736-1';
import {drawSelectionFrames} from './selection-overlay.mjs?v=source-save-v0736-1';
import {ARROW_PROPERTIES,arrowEndpoint,arrowPropertyValue,setArrowProperty,arrowGeometry} from './arrowheads.mjs?v=0.3.0-1';

import {createArrowPicker} from './arrow-picker.mjs?v=0.3.0-1';
import {lineStrokeAttributes,lineStyleValue,setLineStyle,supportsLineStyle} from './line-styles.mjs?v=lines-v064-1';
import {createLineStylePicker} from './line-style-picker.mjs?v=lines-v064-1';
import {createPreviewQuality} from './preview-quality.mjs?v=source-save-v0736-1';
import {createSelectionWheelZoom,resetSelectionZoom} from './selection-zoom.mjs?v=source-save-v0736-1';
import {fontSizeForAction} from './text-format.mjs?v=annotation-input-v071-1';
import {selectionPNG,writeSelectionImage,studioPasteObjects,matchesSelectionPNG} from './image-clipboard.mjs?v=source-save-v0736-1';
import {reorderFigures} from './figure-order.mjs';
import {renumberFigureNames} from './figure-names.mjs?v=0.3.3-1';
import {deleteFigures,duplicateFigures} from './figure-commands.mjs?v=source-save-v0736-1';
import {ProjectFileSession,projectFilePickerOptions} from './project-file.mjs?v=project-switch-v051-1';
import {installWorkspacePersistence} from './workspace-session.mjs?v=workspace-source-status-v0751-1';
import {decodeWorkspaceState} from './workspace-state.mjs?v=project-switch-v051-1';
import {validateWorkspaceBinding} from './integration/bridge-host.mjs?v=workspace-source-status-v0751-1';

const STUDIO_RELEASE={version:'0.7.51',build:'workspace-source-status-v0751-1'};
installBrowserZoomGuard();
window.FigureAppRelease?.assertRunning(STUDIO_RELEASE);
if(window.FigureAppRelease&&!await window.FigureAppRelease.startup())throw Error('最新版へ切り替えています。');
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
setupSourceDiscovery();
installShortcutUI();
const ns='http://www.w3.org/2000/svg';
const el=(tag,attrs={},text)=>{
 const node=document.createElementNS(ns,tag);
 for(const [name,value] of Object.entries(attrs)){
  if(value===undefined)continue;
  if(name==='xml:space')node.setAttributeNS('http://www.w3.org/XML/1998/namespace',name,value);
  else node.setAttribute(name,value);
 }
 if(text!==undefined)node.textContent=text;
 return node;
};
let doc=newDocument(),assets=new Map(),selection=[],tool='select',scale=1.5,history=new History(),gesture=null,textBefore=null,editingId=null,dirty=false,saveTimer,revision=0,clipboard=null,formatClipboard=null,frame=0,spaceDown=false,manualSavedRevision=-1,bridge=null;
let groupScope=null;
let figures=[doc],bookId=uid(),initialDemo=false,transferQueue=Promise.resolve(),updateReloading=false;
let projectSaving=false,projectOpening=false,projectVersionChecking=false,startupRestoring=false;
let preservedWorkspace=null,textCaret=null,lastPendingPropertyInput=null;
let clipboardMarker='Figure Studio objects',clipboardGeneration=0,clipboardPNG=null;
const pendingPropertyInputs=new WeakSet();
let pathDrawing=null,pathDraft=null,pathEditId=null,pathPreviewFrame=0,pathToolTransition=false;
const projectFiles=new ProjectFileSession({host:window,fallback:(blob,name)=>download(blob,name)});
if(new URLSearchParams(location.search).get('figureWorkspace')==='1')document.documentElement.dataset.workspaceEmbedded='true';
function syncFigure(){const i=figures.findIndex(f=>f.id===doc.id);if(i>=0)figures[i]=doc;else figures.push(doc);}
function snapshot(){syncFigure();return clone({format:'figure-studio-book',version:1,id:bookId,activeId:doc.id,figures});}
function restoreBook(state){groupScope=null;pathDrawing?.cancel();pathDrawing?.setTool('select');pathEditId=null;tool='select';figures=clone(state.figures);bookId=state.id;doc=figures.find(f=>f.id===state.activeId)||figures[0];selection=[];}
function switchFigure(id){if(id===doc.id)return;pathDrawing?.cancel();pathDrawing?.setTool('select');pathEditId=null;finishText();if(gesture)endGesture(null,true);syncFigure();const next=figures.find(f=>f.id===id);if(!next)return;doc=next;selection=[];groupScope=null;tool='select';render();fit();scheduleSave();svg.focus();}
const figureSidebar=createFigureSidebar({root:$('#figureTabs'),onSelect:switchFigure,onCommand:(action,ids)=>execute(action,{figureIds:ids}),onReorder:moveFigures,renderSVG:(f,width,height)=>{
 const out=el('svg',{xmlns:ns,width,height,viewBox:`0 0 ${f.width} ${f.height}`});out.append(el('rect',{width:f.width,height:f.height,fill:'#fff'}));
 for(const o of f.objects){const g=el('g');drawContent(o,g,'thumbnail');g.removeAttribute('style');g.removeAttribute('data-id');out.append(g);}return new XMLSerializer().serializeToString(out);
}});
function renderFigureTabs(){figureSidebar.update(figures,doc.id);}
const nodes=new Map(),svg=$('#canvas'),objects=$('#objects'),overlays=$('#overlays'),viewport=$('#viewport'),paper=$('#paperWrap'),editor=$('#textEditor');
svg.setAttribute('tabindex','0');svg.setAttribute('role','application');svg.setAttribute('aria-label','Figure編集キャンバス');
const ribbon=createRibbon({onResize:()=>{renderOverlay();positionEditor();},onFocusCanvas:()=>svg.focus({preventScroll:true})});
const imageArrayDialog=createImageArrayDialog({root:$('#imageArrayDialog'),getDocument:()=>doc,getSelection:()=>selection,getSelectionOptions:()=>({individual:!!groupScope}),onApply:(ids,gaps)=>{let result;change(()=>{result=arrangeImageArray(doc,ids,gaps);});toast(`${result.rows}行 × ${result.columns}列に配列しました · Ctrl+Zで戻せます`);},onClose:()=>svg.focus({preventScroll:true})});
const colorPickers=createColorPickers();
pathDrawing=createPathDrawing({svg,point:svgPoint,scale:()=>scale,onDraft:draft=>{pathDraft=draft;if(!pathPreviewFrame)pathPreviewFrame=requestAnimationFrame(()=>{pathPreviewFrame=0;renderOverlay();});},onCommit:commitDrawnPath,onCancel:()=>{if(!pathToolTransition)setTool('select');},onHint:message=>{if(message)$('#statusText').textContent=message;}});
const measure=document.createElement('canvas').getContext('2d');
let texFrame=0,editingTexSession=false,editorComposing=false;
const texRenderer=createTexRenderer({measure:(text,object)=>{measure.font=font(object);return measure.measureText(text).width;},onReady:key=>{let resized=false;for(const figure of figures)for(const object of figure.objects)if(object.textAutoSize&&texRenderer.key(object)===key)resized=(object.panelLabel?fitPanelLabelText(object,figure):fitText(object))||resized;if(resized&&!editingId){dirty=true;revision++;scheduleSave();}figureSidebar.invalidate(figures.filter(f=>f.objects.some(o=>o.type==='text'&&texRenderer.key(o)===key)).map(f=>f.id));if(!texFrame)texFrame=requestAnimationFrame(()=>{texFrame=0;render();});},onError:(error,key)=>{if(!editingId&&!livePreview.ownsKey(key)&&doc.objects.some(o=>o.type==='text'&&texRenderer.key(o)===key))toast(error.message);}});
const livePreview=createLiveTexPreview({renderer:texRenderer,root:$('#texPreviewPanel'),svg:$('#texPreviewSvg'),status:$('#texPreviewStatus'),sourceSlot:$('#texSourceSlot'),paint:renderTextPaint,el,onPosition:placeTexSource});
function createPanelMathPreview(dialog){
 const root=dialog.querySelector('[data-panel-math-preview]');
 const preview=createLiveTexPreview({renderer:texRenderer,root,svg:root.querySelector('svg'),status:root.querySelector('[role=status]'),paint:renderTextPaint,el});
 const defaults=makeObject('text',{fill:'#000000'});
 return {show(style,composition){
  const object=style&&{...defaults,...style,textAutoSize:true};
  if(!object||!Number.isFinite(object.fontSize)||object.fontSize<1||object.fontSize>1000||!texRenderer.hasMath(object)){preview.hide();return false;}
  preview.show(object,{source:'panel-label',composition});return true;
 },hide:preview.hide};
}
const panelLabelDialog=createPanelLabelDialog({root:$('#panelLabelDialog'),mathPreview:createPanelMathPreview($('#panelLabelDialog')),getDocument:()=>doc,getSelection:()=>selection,onApply:(ids,options)=>{let result;change(()=>{result=applyPanelLabels(doc,ids,options,fitText,(text,object)=>{measure.font=font(object);return measure.measureText(text);},object=>plotPanelBounds(object,assets.get(object.assetId)));});setSelection(result.ids,{focus:false});toast(`${result.count}パネルにラベルを付けました · Ctrl+Zで戻せます`);},onClose:()=>svg.focus({preventScroll:true})});
const panelLabelEditor=createPanelLabelEditor({root:$('#panelLabelEditor'),mathPreview:createPanelMathPreview($('#panelLabelEditor')),getDocument:()=>doc,onApply:(id,options)=>{
 change(()=>{const object=doc.objects.find(object=>object.id===id);
  writePanelLabelContent(object,options.content);object.textMode=options.textMode;object.fontSize=options.fontSize;fitPanelLabelText(object);
 });
},onClose:()=>svg.focus({preventScroll:true})});
const presentationTexRenderer=createTexRenderer({measure:(text,object)=>{measure.font=font(object);return measure.measureText(text).width;}});
let presentationScroll=null;
const presentation=createPresentation({
 root:$('#studioPresentation'),editorRoot:$('.app-shell'),
 getSlides:()=>figures.map(figure=>({id:figure.id,name:figure.name,width:figure.width,height:figure.height,version:`${bookId}:${revision}`})),getCurrentId:()=>doc.id,
 beforeStart:()=>{
  if(projectSaving||projectOpening||startupRestoring||updateReloading||getFigureWorkspace(window)?.persistenceBusy){toast('保存・読み込みが完了してから開始してください');return false;}
  if(gesture){toast('ドラッグ操作を終えてから開始してください');return false;}
  if(!commitFocusedProperty())return false;
  if(pathDrawing?.drawing&&!pathDrawing.finish()){toast('作図を確定するか、Escで取り消してから開始してください');return false;}
  finishText();syncFigure();presentationScroll={left:viewport.scrollLeft,top:viewport.scrollTop};for(const menu of $$('details:not(.sidebar-text-panel)[open]'))menu.open=false;$('#contextMenu').hidden=true;$('#keyHint').hidden=true;livePreview.hide();return true;
 },
 renderSlide:async slide=>{
  const figure=figures.find(figure=>figure.id===slide.id);if(!figure)throw Error('Figureが見つかりません');
  const captured=clone(figure.objects),sourceAssets=new Map(assets);
  await presentationTexRenderer.prepare(captured);
  const urls=new Set(captured.filter(object=>object.type==='image').map(object=>sourceAssets.get(object.assetId)?.dataUrl).filter(Boolean));
  await Promise.all([...urls].map(async url=>{const image=new Image();image.src=url;await image.decode();}));
  const out=el('svg',{xmlns:ns,viewBox:`0 0 ${slide.width} ${slide.height}`,width:slide.width,height:slide.height});
  for(const object of captured){const group=el('g');drawContent(object,group,true,sourceAssets,presentationTexRenderer);group.removeAttribute('data-id');group.removeAttribute('style');out.append(group);}return out;
 },
 onActiveChange:active=>getFigureWorkspace(window)?.setPresentationMode?.(active),
 onAfterExit:()=>{const saved=presentationScroll;presentationScroll=null;if(saved)requestAnimationFrame(()=>{viewport.scrollLeft=saved.left;viewport.scrollTop=saved.top;renderOverlay();positionEditor();});},onError:error=>toast(error.message)
});
window.FigureStudioPresentation={exit:()=>presentation.exit()};
const arrowPicker=createArrowPicker({root:$('#arrowProperties'),onChange:(property,value)=>change(()=>editable().forEach(o=>setArrowProperty(o,property,value)))});
const lineStylePicker=createLineStylePicker({root:$('#lineStylePicker'),onChange:value=>change(()=>editable().forEach(o=>setLineStyle(o,value)))});
let previewErrorShown=false;
const previewQuality=createPreviewQuality({quality:'auto',onReady:(asset,url,quality)=>{
 if(quality!==previewQuality.quality||assets.get(asset.id)!==asset)return;
 refreshImagePreviews();
},onError:(error,asset,quality)=>{if(quality===previewQuality.quality&&assets.get(asset.id)===asset&&!previewErrorShown){previewErrorShown=true;toast('一部の軽量プレビューを作れないため、元の画質で表示しています');}}});
try{const raw=localStorage.getItem('figure-studio-preview-quality-v2'),saved=raw==='auto'?'auto':Number(raw);if(raw!==null&&(saved==='auto'||[1,.5,.25].includes(saved)))previewQuality.setQuality(saved);}catch{}
$('#previewQuality').value=String(previewQuality.quality);
function moveFigures(ids,beforeId){
 if(gesture)endGesture(null,true);finishText();const before=snapshot(),next=reorderFigures(figures,ids,beforeId);
 if(next.every((f,i)=>f.id===figures[i]?.id))return;figures=next;record(before);toast('Figureの順序を変更しました · Ctrl+Zで戻せます');
}
function figureIds(payload){return payload.figureIds??figureSidebar.getSelectedIds();}
function focusFigure(){const id=doc.id;$('#figureTabs').querySelector('[data-figure-id="'+id+'"]')?.focus({preventScroll:true});}
function toast(message){message=shortcutLabel(message);$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4200);$('#statusText').textContent=message;}
function selected(){const s=new Set(selection);return doc.objects.filter(o=>s.has(o.id));}
function editable(){const lockedGroups=new Set(doc.objects.filter(o=>o.locked&&o.groupId).map(o=>o.groupId));return selected().filter(o=>!o.locked&&!lockedGroups.has(o.groupId));}
function selectionOptions(){return {individual:!!groupScope};}
function setSelection(ids,{focus=true,scope=null}={}){const next=resolveObjectSelection(doc,ids,{groupId:scope});selection=next.ids;groupScope=next.groupId;if(!selection.includes(pathEditId))pathEditId=null;renderOverlay();renderInspector();renderLayers();if(tool==='select')$('#statusText').textContent=selectionDescription(doc,selection,groupScope)+(groupScope?' · Escでグループ全体へ':' · グループ選択後にもう一度クリックで個別選択');if(focus&&!editingId)svg.focus({preventScroll:true});}
function selectObject(id,options={}){const next=clickObjectSelection(doc,{ids:selection,groupId:groupScope},id,options);setSelection(next.ids,{scope:next.groupId});}
function selectWholeGroup(){if(!groupScope)return;const ids=doc.objects.filter(object=>object.groupId===groupScope).map(object=>object.id);setSelection(ids);}
function record(before){syncFigure();if(before.figures.length!==figures.length||before.figures.some((f,i)=>f.id!==figures[i]?.id))renumberFigureNames(figures);if(history.push(before,snapshot())){dirty=true;revision++;scheduleSave();render();}else{renderOverlay();renderInspector();updateToolbar();}}
function change(fn){finishText();const before=snapshot();fn();record(before);}
function scheduleSave(){clearTimeout(saveTimer);$('#saveStatus').textContent='保存待ち';saveTimer=setTimeout(async()=>{const rev=revision;try{await saveDraft(snapshot(),assets);$('#saveStatus').textContent=rev===revision?'ブラウザに保存済み':'保存待ち';}catch(e){$('#saveStatus').textContent='自動保存できません';toast('自動保存できません。Ctrl+Sでプロジェクトを保存してください。');}},650);}
function refreshImagePreviews(){for(const o of doc.objects)if(o.type==='image'){const a=assets.get(o.assetId);if(a)nodes.get(o.id)?.querySelector('image')?.setAttribute('href',previewQuality.getURL(a,{width:Math.abs(o.w*scale),height:Math.abs(o.h*scale),pixelRatio:globalThis.devicePixelRatio||1}));}}
function setScale(s){scale=Math.max(.25,Math.min(5,s));$('#zoom').value=Math.round(scale*100);$('#zoomLabel').textContent=`${Math.round(scale*100)}%`;paper.style.width=`${doc.width*scale}px`;paper.style.height=`${doc.height*scale}px`;svg.style.width=`${doc.width*scale}px`;svg.style.height=`${doc.height*scale}px`;refreshImagePreviews();renderOverlay();positionEditor();}
function fit(){resetSelectionZoom(viewport);viewport.scrollLeft=viewport.scrollTop=0;const w=viewport.clientWidth-100,h=viewport.clientHeight-85;setScale(Math.min(w/doc.width,h/doc.height));}
function svgPoint(e){const r=svg.getBoundingClientRect();return{x:(e.clientX-r.left)/scale,y:(e.clientY-r.top)/scale};}
function transform(o){return `translate(${o.x} ${o.y}) rotate(${o.rotation||0} ${o.w/2} ${o.h/2})`+(o.flipX||o.flipY?` translate(${o.w/2} ${o.h/2}) scale(${o.flipX?-1:1} ${o.flipY?-1:1}) translate(${-o.w/2} ${-o.h/2})`:'');}
function font(o){return `${o.italic?'italic ':''}${o.bold?'bold ':''}${o.fontSize}px ${o.fontFamily||'Arial'}`;}
function fitText(o){if(o?.type!=='text'||o.locked)return false;o.textAutoSize=true;const layout=texRenderer.hasMath(o)?texRenderer.getLayout(o):null;if(texRenderer.hasMath(o)&&!layout)return false;return fitTextBox(o,{layout,measure:(text,object)=>{measure.font=font(object);return measure.measureText(text);}});}
function fitPanelLabelText(object,figure=doc){
 const oldHeight=object.h;
 const panels=object.groupId?figure.objects.filter(other=>other.type==='image'&&other.groupId===object.groupId):[];
 const outside=!object.rotation&&panels.length&&object.y<Math.min(...panels.map(image=>(plotPanelBounds(image,assets.get(image.assetId))||objectBounds(image)).y));
 const changed=fitText(object);
 if(outside&&changed)object.y+=oldHeight-object.h;
 return changed;
}
function textLines(o){if(o.textAutoSize)return naturalTextLines(o.text);measure.font=font(o);const out=[];for(const paragraph of o.text.split('\n')){let line='';for(const c of paragraph){if(line&&measure.measureText(line+c).width>Math.max(1,o.w-2)){out.push(line);line=c;}else line+=c;}out.push(line);}return out;}
function drawContent(o,g,full=false,sourceAssets,textRenderer=texRenderer){
 const mathText=o.type==='text'&&textRenderer.hasMath(o);
 g.replaceChildren();g.style.visibility=!full&&editingId===o.id&&(editingTexSession||mathText||!(o.type==='text'&&o.stroke&&o.stroke!=='none'&&o.strokeWidth>0&&(o.strokeTransparency??0)<100))?'hidden':'';g.setAttribute('transform',transform(o));g.setAttribute('opacity',o.opacity??1);g.setAttribute('fill-opacity',1-(o.fillTransparency??0)/100);g.setAttribute('stroke-opacity',1-(o.strokeTransparency??0)/100);g.setAttribute('data-id',o.id);g.style.cursor=o.locked?'default':'move';
 if(o.type==='image'){const a=(sourceAssets||assets).get(o.assetId);if(a){g.append(el('image',{width:o.w,height:o.h,href:full===true?a.dataUrl:full==='thumbnail'?(a.previewUrl||a.dataUrl):previewQuality.getURL(a,{width:Math.abs(o.w*scale),height:Math.abs(o.h*scale),pixelRatio:globalThis.devicePixelRatio||1}),preserveAspectRatio:'none'}));}else{g.append(el('rect',{width:o.w,height:o.h,fill:'#f4ddd9',stroke:'#c27466'}));g.append(el('text',{x:5,y:18,'font-size':10},'画像が見つかりません'));}}
 else if(o.type==='text'){
 const layout=mathText&&(full||editingId!==o.id)?textRenderer.getLayout(o):null;g.append(...renderTextPaint(o,{el,lines:layout?undefined:textLines(o),layout,uniqueId:uid()}));
 if(!full)g.prepend(el('rect',{width:Math.max(o.w,5),height:Math.max(o.h,o.fontSize*1.2,layout?.height??0),fill:'transparent','data-hit':'true'}));
 }else if(o.type==='line'||o.type==='arrow'){
 if(!full)g.append(el('line',{x1:0,y1:0,x2:o.w,y2:o.h,stroke:'transparent','stroke-width':Math.max(12/scale,o.strokeWidth),'pointer-events':'stroke'}));
 const geometry=arrowGeometry(o);g.append(el('line',{...geometry.shaft,stroke:o.stroke,'stroke-width':o.strokeWidth,...lineStrokeAttributes(o)}));
 for(const head of geometry.heads)g.append(el(head.tag,{...head.attrs,'fill-opacity':1-(o.strokeTransparency??0)/100}));
 }else if(isPathObject(o)){
  if(o.w<=0||o.h<=0)return;const d=pathData(o);
  if(!full)g.append(el('path',{d,fill:'none',stroke:'transparent','stroke-width':Math.max(12/scale,o.strokeWidth),'pointer-events':'stroke'}));
  g.append(el('path',{d,fill:o.closed?o.fill||'none':'none',stroke:o.stroke||'#263b44','stroke-width':o.strokeWidth,...lineStrokeAttributes(o),'stroke-linejoin':'round'}));
 }else {g.append(el(o.type==='ellipse'?'ellipse':'rect',{...(o.type==='ellipse'?{cx:o.w/2,cy:o.h/2,rx:o.w/2,ry:o.h/2}:{width:o.w,height:o.h,rx:0}),fill:o.fill,stroke:o.stroke,'stroke-width':o.strokeWidth,...lineStrokeAttributes(o)}));}
}
function render(){
 const current=resolveObjectSelection(doc,selection,{groupId:groupScope});selection=current.ids;groupScope=current.groupId;
 syncFigure();renderFigureTabs();svg.setAttribute('viewBox',`0 0 ${doc.width} ${doc.height}`);$('#docName').value=doc.name;$('#pageWidth').value=toMM(doc.width).toFixed(1);$('#pageHeight').value=toMM(doc.height).toFixed(1);const figureLabel=$('#canvasFigureLabel');if(figureLabel){figureLabel.textContent=`Figure ${figures.findIndex(f=>f.id===doc.id)+1}`;figureLabel.title=doc.name;}
 const ids=new Set(doc.objects.map(o=>o.id));for(const[id,n]of nodes)if(!ids.has(id)){n.remove();nodes.delete(id);}for(const o of doc.objects){let g=nodes.get(o.id);if(!g){g=el('g');nodes.set(o.id,g);}drawContent(o,g);objects.append(g);}selection=selection.filter(id=>ids.has(id));
 setScale(scale);renderInspector();renderLayers();updateToolbar();document.title=`${doc.name} · Figure Studio`;
}
function updateToolbar(){svg.dataset.canvasTool=tool;for(const b of $$('[data-tool]')){b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));}for(const button of $$('[data-action="undo"]'))button.disabled=!history.past.length;for(const button of $$('[data-action="redo"]'))button.disabled=!history.future.length;updateProjectFileUI();}
function renderFast(){
 if(gesture?.kind==='path-point'){
  const object=doc.objects.find(item=>item.id===gesture.initial[0].id);if(object){drawContent(object,nodes.get(object.id));const handle=overlays.querySelector('[data-point-index="'+gesture.pointIndex+'"]'),p=pathWorldPoint(object,object.points[gesture.pointIndex]);if(handle){handle.setAttribute('cx',p.x);handle.setAttribute('cy',p.y);}}return;
 }
 for(const o of editable()){const g=nodes.get(o.id);if(!g)continue;if(gesture?.kind==='resize'||gesture?.kind==='endpoint'||gesture?.kind==='arc-angle')drawContent(o,g);else g.setAttribute('transform',transform(o));}renderOverlay();}
function queueFast(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;renderFast();});}
function renderOverlay(){overlays.replaceChildren();drawPathDraft();const all=selected(),{box:b,ink,u}=drawSelectionFrames({root:overlays,doc,ids:selection,groupId:groupScope,scale,editableIds:editable().map(object=>object.id),draggable:tool==='select',el});if(!b||!editable().length)return;
 if(all.length===1&&(all[0].type==='line'||all[0].type==='arrow')){const o=all[0];for(const [name,point]of [['start',{x:0,y:0}],['end',{x:1,y:1}]]){const p=pathWorldPoint(o,point);overlays.append(el('circle',{cx:p.x,cy:p.y,r:4*u,fill:'white',stroke:ink,'stroke-width':1.4*u,'data-handle':name}));}}
 else for(const [name,x,y]of [['nw',b.x,b.y],['ne',b.x+b.w,b.y],['se',b.x+b.w,b.y+b.h],['sw',b.x,b.y+b.h]])overlays.append(el('rect',{x:x-4.5*u,y:y-4.5*u,width:9*u,height:9*u,fill:ink,stroke:'#fff','stroke-width':1.5*u,'data-handle':name,cursor:`${name}-resize`}));
 if(all.length===1&&pathEditId===all[0].id&&['curve','freeform'].includes(all[0].type)){
  all[0].points.forEach((point,index)=>{const p=pathWorldPoint(all[0],point);overlays.append(el('circle',{cx:p.x,cy:p.y,r:3.5*u,fill:'#fff',stroke:'#cc8623','stroke-width':1.3*u,'data-handle':'point','data-point-index':index,cursor:'crosshair'}));});
 }
 if(all.length===1&&all[0].type==='arc')for(const end of ['start','end']){const object=all[0],angle=object[end+'Angle']*Math.PI/180,p=pathWorldPoint(object,{x:(1+Math.cos(angle))/2,y:(1+Math.sin(angle))/2});overlays.append(el('circle',{cx:p.x,cy:p.y,r:4*u,fill:'#ffc76b',stroke:'#af741c','stroke-width':u,'data-handle':'arc-'+end,cursor:'crosshair'}));}
 if(all.length===1){overlays.append(el('line',{x1:b.x+b.w/2,y1:b.y,x2:b.x+b.w/2,y2:b.y-18*u,stroke:ink,'stroke-width':u}));overlays.append(el('circle',{cx:b.x+b.w/2,cy:b.y-22*u,r:4*u,fill:'white',stroke:ink,'stroke-width':u,'data-handle':'rotate',cursor:'crosshair'}));}
}
const textProperties=new Set(['fontSize','fontFamily','text','textAlign','textMode']);
function propertyKey(input){return input.dataset.prop==='arcStartAngle'?'startAngle':input.dataset.prop==='arcEndAngle'?'endAngle':input.dataset.prop;}
function isTextPropertyInput(input){return textProperties.has(input.dataset.prop)||input.hasAttribute('data-text-only');}
function isRibbonTextControl(node){
 if(!node?.closest?.('#studioRibbon,#ribbonSelectionPane'))return false;
 if(node.closest('[data-color-picker][data-text-only],.ribbon-text-menu,#texPreviewPanel'))return true;
 const input=node.closest('[data-prop]');if(input&&isTextPropertyInput(input))return true;
 const action=node.closest('[data-action]')?.dataset.action;
 return ['bold','italic','underline','font-grow','font-shrink','font-up','font-down','text-left','text-center','text-right','text-justify'].includes(action);
}
function renderInspector(){
 const arr=selected(),o=arr[0],edits=editable(),texts=arr.filter(object=>object.type==='text'),textEdits=edits.filter(object=>object.type==='text');
 $('#selectionInfo').textContent=selectionDescription(doc,selection,groupScope)+(arr.length&&!edits.length?' · 固定':'');$('#selectionInfo').dataset.mode=groupScope?'member':arr.some(object=>object.groupId)?'group':'object';$('#selectWholeGroupButton').hidden=!groupScope;
 for(const input of $$('[data-prop]')){
  const p=propertyKey(input);if(Object.hasOwn(ARROW_PROPERTIES,p))continue;
  const textOnly=isTextPropertyInput(input),targets=textOnly?texts:arr,allowed=textOnly?textEdits:edits;
  input.disabled=!allowed.length||(p==='text'&&targets.length!==1);
  if(document.activeElement===input)continue;
  const values=targets.map(object=>object[p]??(['fillTransparency','strokeTransparency'].includes(p)?0:p==='textMode'?'auto':undefined)),same=values.length&&values.every(value=>value===values[0]);let value=same?values[0]:'';
  if(['x','y','w','h'].includes(p)&&same)value=toMM(value).toFixed(2);
  if(p==='opacity'&&same)value=Math.round((1-(value??1))*100);
  if(!input.hasAttribute('data-color-value')){
   if(p==='fill'&&(!value||value==='none'))value=textOnly?'#263638':'#ffffff';
   if(p==='stroke'&&(!value||value==='none'))value='#263b44';
  }
  input.value=value??'';input.dataset.mixed=String(targets.length>1&&!same);
  if(input.type==='number'||input.tagName==='TEXTAREA')input.placeholder=targets.length>1&&!same?'—':'';
  pendingPropertyInputs.delete(input);
 }
 colorPickers.update();
 const showArrows=arr.length>0&&arr.every(object=>['line','arrow'].includes(object.type)),arrowEditable=showArrows?edits:[];$('#arrowProperties').hidden=!showArrows;
 for(const input of $$('#arrowProperties [data-prop]')){const p=input.dataset.prop;input.disabled=!arrowEditable.length||(!p.endsWith('Style')&&arrowEditable.every(object=>arrowEndpoint(object,p.startsWith('arrowStart')?'start':'end').style==='none'));const values=arr.map(object=>arrowPropertyValue(object,p));if(document.activeElement!==input)input.value=values.length&&values.every(value=>value===values[0])?values[0]:'';}
 arrowPicker.update(arr,{editableIds:arrowEditable.map(object=>object.id)});
 lineStylePicker.update(arr,{editableIds:edits.map(object=>object.id)});
 for(const action of ['bold','italic','underline'])for(const button of $$('[data-action="'+action+'"]')){const active=texts.length>0&&texts.every(object=>object[action]);button.disabled=!textEdits.length;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':texts.some(object=>object[action])?'mixed':'false');}
 for(const button of $$('[data-action]')){
  const action=button.dataset.action;
  if(['font-grow','font-shrink','font-up','font-down'].includes(action)||/^text-(left|center|right|justify)$/.test(action))button.disabled=!textEdits.length;
  if(/^text-(left|center|right|justify)$/.test(action)){const active=texts.length>0&&texts.every(object=>(object.textAlign||'left')===action.slice(5));button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  if(action==='no-fill')button.disabled=!edits.some(object=>['rect','ellipse'].includes(object.type)||['curve','freeform'].includes(object.type)&&object.closed);
  if(['toggle-arrow-start','toggle-arrow-end'].includes(action))button.disabled=!edits.some(object=>['line','arrow'].includes(object.type));
  if(action==='edit-points'||action==='close-path'){button.disabled=arr.length!==1||!edits.length||!['curve','freeform'].includes(o.type);if(action==='close-path'&&!o?.closed&&(o?.points?.length??0)<3)button.disabled=true;button.setAttribute('aria-pressed',String(action==='edit-points'?pathEditId===o?.id:!!o?.closed));}
  if(['front','back','forward','backward','lock','duplicate','delete'].includes(action))button.disabled=!arr.length;
  if(['rotate-right','rotate-left','flip-v','flip-h'].includes(action))button.disabled=!edits.length;
  if(action==='group')button.disabled=!!groupScope||new Set(edits.map(object=>object.groupId||object.id)).size<2;
  if(action==='image-array')button.disabled=imageArrayUnits(doc,selection,selectionOptions()).length<2;
  if(action==='ungroup'||action==='ungroup-all')button.disabled=!edits.some(object=>object.groupId);
  if(action==='attach-source')button.disabled=arr.length!==1||o.type!=='image';
  if(action==='edit-source')button.disabled=arr.length!==1||!o.source;
 }
 const arrowMenu=$('#arrowProperties').closest('details');if(arrowMenu){const summary=arrowMenu.querySelector('summary');if(summary)summary.setAttribute('aria-disabled',String(!showArrows));if(!showArrows)arrowMenu.open=false;}
 $('#sourceSummary').textContent=o?.source?(o.source.app==='plot'?'PlotLauncher':'MiFiTo')+' · '+o.source.name:'元プロジェクトを関連付けできます';if(o?.source)$('#sourceApp').value=o.source.app;
 const arcPanel=$('#arcProperties');if(arcPanel)arcPanel.hidden=!arr.length||!arr.every(object=>object.type==='arc');
 const pathPanel=$('#pathProperties');if(pathPanel)pathPanel.hidden=arr.length!==1||!['curve','freeform'].includes(o.type);
 ribbon.updateSelection(arr);
 renderImageResolution(arr,edits);
 if(livePreview.visible&&livePreview.source==='ribbon'){
  if(texts.length===1&&$('#propText').closest('details')?.open&&!$('#ribbonSelectionPane').hidden)livePreview.show({...texts[0],text:$('#propText').value},{source:'ribbon'});else livePreview.hide();
 }
}

function renderLayers(){renderGroupLayers({root:$('#layers'),doc,ids:selection,groupId:groupScope,onSelect:({id,groupId,individual,additive})=>{finishText();if(id){selectObject(id,{individual,additive});return;}const members=doc.objects.filter(object=>object.groupId===groupId).map(object=>object.id),remove=additive&&members.every(id=>selection.includes(id));setSelection(additive?(remove?selection.filter(id=>!members.includes(id)):[...selection,...members]):members);}});}
function renderImageResolution(arr,edits){
 const info=$('#imageQualityInfo');if(!info)return;
 const images=arr.filter(o=>o.type==='image');info.hidden=!images.length;if(!images.length)return;
 const details=images.map(o=>({object:o,asset:assets.get(o.assetId),r:rasterResolution(assets.get(o.assetId),o)})),rasters=details.filter(d=>d.r);
 const lowest=rasters.length?Math.min(...rasters.map(d=>d.r.dpi)):null;
 $('#imageQualityLabel').textContent=images.length===1?(details[0].r?`${details[0].r.width} × ${details[0].r.height} px · 実効 ${Math.round(lowest)} dpi`:'SVG画像'):`画像 ${images.length} 枚${lowest!==null?' · 最低 '+Math.round(lowest)+' dpi':''}`;
 info.dataset.state=lowest!==null&&Math.round(lowest)<300?'low':'good';
 info.title=details.map(d=>d.r?`${d.asset.name}：元画像 ${d.r.width} × ${d.r.height} px／現在の配置で ${Math.round(d.r.dpi)} dpi。300 dpiで使える幅 ${d.r.widthAt300.toFixed(1)} mm・高さ ${d.r.heightAt300.toFixed(1)} mm。`:`${d.asset?.name||'画像'}：SVG形式。`).join('\n')+(lowest!==null&&Math.round(lowest)<300?'\n拡大配置すると粗く見えます。元の高解像度画像へ差し替えられます。':'');
 const button=$('#replaceImageButton'),target=images.length===1&&arr.length===1?images[0]:null;
 button.hidden=!target||!!target.source;button.disabled=!target||!edits.some(o=>o.id===target.id);
}
function setTool(t){finishText();pathToolTransition=true;try{pathDrawing?.setTool(t);}finally{pathToolTransition=false;}pathEditId=null;tool=t;svg.style.cursor=t==='select'?'default':'crosshair';updateToolbar();$('#statusText').textContent={select:'クリックで選択 · Shiftで複数選択 · ドラッグで移動',text:'ドラッグでテキストボックスを作成',line:'ドラッグで線を作成 · Shiftで角度固定',arrow:'ドラッグで矢印を作成 · Shiftで角度固定',rect:'ドラッグで長方形を作成',ellipse:'ドラッグで楕円を作成',curve:'クリックで点を追加 · ダブルクリック／Enterで確定 · Escで取消',freeform:'クリックで折れ線・ドラッグで手描き · Enterで確定 · 始点クリックで閉じる',arc:'ドラッグで円弧を作成 · 黄色の点またはホームで角度を変更'}[t];if(['curve','freeform'].includes(t))setSelection([],{focus:false});renderOverlay();svg.focus({preventScroll:true});}
function pathWorldPoint(object,point){const dx=(point.x-.5)*object.w*(object.flipX?-1:1),dy=(point.y-.5)*object.h*(object.flipY?-1:1),cx=object.x+object.w/2,cy=object.y+object.h/2,r=(object.rotation||0)*Math.PI/180;return {x:cx+dx*Math.cos(r)-dy*Math.sin(r),y:cy+dx*Math.sin(r)+dy*Math.cos(r)};}
function pathLocalPoint(object,point){const cx=object.x+object.w/2,cy=object.y+object.h/2,r=(object.rotation||0)*Math.PI/180,dx=point.x-cx,dy=point.y-cy;return {x:object.w/2+(dx*Math.cos(r)+dy*Math.sin(r))*(object.flipX?-1:1),y:object.h/2+(-dx*Math.sin(r)+dy*Math.cos(r))*(object.flipY?-1:1)};}
function drawPathDraft(){
 if(!pathDraft)return;const points=[...pathDraft.points];if(pathDraft.previewPoint&&(!points.length||Math.hypot(points.at(-1).x-pathDraft.previewPoint.x,points.at(-1).y-pathDraft.previewPoint.y)>.001))points.push(pathDraft.previewPoint);
 if(points.length>=2){try{const object=objectFromPoints(pathDraft.type,points),group=el('g',{transform:'translate('+object.x+' '+object.y+')','pointer-events':'none'});group.append(el('path',{d:pathData(object),fill:'none',stroke:'#147d73','stroke-width':1.5/scale,'stroke-linejoin':'round','stroke-linecap':'round'}));overlays.append(group);}catch{}}
 pathDraft.points.forEach((point,index)=>{if(pathDraft.freehand&&index>0)return;overlays.append(el('circle',{cx:point.x,cy:point.y,r:(index===0&&pathDraft.canClose?5:3)/scale,fill:index===0&&pathDraft.canClose?'#147d73':'white',stroke:'#147d73','stroke-width':1/scale,'pointer-events':'none'}));});
}
function commitDrawnPath({type,points,closed}){
 const props=objectFromPoints(type,points,{closed}),object=makeObject(type,{...props,name:type==='curve'?'曲線':'フリーフォーム'});pathDraft=null;const before=snapshot();doc.objects.push(object);selection=[object.id];record(before);setTool('select');
}
function beginText(o){if(o.panelLabel){finishText();if(o.groupId)setSelection([o.id],{scope:o.groupId,focus:false});panelLabelEditor.show(o);return;}if(o.locked||o.groupId&&doc.objects.some(object=>object.groupId===o.groupId&&object.locked))return;finishText();if(o.groupId)setSelection([o.id],{scope:o.groupId,focus:false});editingId=o.id;textBefore=snapshot();editor.value=o.text;editor.hidden=false;editingTexSession=texRenderer.hasMath(o);positionEditor();textCaret=null;editor.focus();editor.select();}
function placeTexSource(){
 const preview=$('#texPreviewPanel'),host=livePreview.source==='ribbon'&&!$('#ribbonSelectionPane').hidden?$('#sidebarPreviewSlot'):document.body;
 if(preview.parentElement!==host)host.append(preview);
 if(!editingId||!editingTexSession)return;
 const box=$('#texSourceSlot').getBoundingClientRect();
 Object.assign(editor.style,{position:'fixed',left:(box.left+8)+'px',top:(box.top+25)+'px',width:Math.max(20,box.width-16)+'px',height:Math.max(36,box.height-33)+'px',fontFamily:'Consolas, monospace',fontSize:'14px',fontWeight:'400',fontStyle:'normal',textDecoration:'none',lineHeight:'1.45',textAlign:'left',color:'#172f36',opacity:1,backgroundColor:'#fff',caretColor:'#172f36',transform:'none',zIndex:'201'});
}
function positionEditor(){
 if(!editingId)return;const o=doc.objects.find(o=>o.id===editingId);if(!o)return;fitText(o);
 const mathText=texRenderer.hasMath(o);editingTexSession=o.textMode!=='plain'&&(editingTexSession||mathText);
 if(editingTexSession){livePreview.show(o,{source:'canvas',composition:editorComposing});const g=nodes.get(o.id);if(g)drawContent(o,g);renderOverlay();return;}
 if(livePreview.source==='canvas')livePreview.hide();
 const outlined=o.stroke&&o.stroke!=='none'&&o.strokeWidth>0&&(o.strokeTransparency??0)<100;
 Object.assign(editor.style,{position:'absolute',left:`${o.x*scale}px`,top:`${o.y*scale}px`,width:`${Math.max(o.w,o.textAutoSize?2:20)*scale}px`,height:`${Math.max(o.h,o.fontSize*(o.textAutoSize?1.25:2))*scale}px`,fontFamily:o.fontFamily,fontSize:`${o.fontSize*scale}px`,fontWeight:o.bold?'700':'400',fontStyle:o.italic?'italic':'normal',textDecoration:o.underline?'underline':'none',lineHeight:'1.25',textAlign:o.textAlign,color:outlined||o.fill==='none'?'transparent':o.fill,opacity:outlined?1:(o.opacity??1)*(1-(o.fillTransparency??0)/100),backgroundColor:outlined?'transparent':'#ffffffed',caretColor:'#172f36',transform:`rotate(${o.rotation||0}deg)`+(o.flipX||o.flipY?` scale(${o.flipX?-1:1},${o.flipY?-1:1})`:''),transformOrigin:'center',zIndex:'10'});
 const g=nodes.get(o.id);if(g)drawContent(o,g);renderOverlay();
}

function finishText(cancel=false){if(!editingId)return;const o=doc.objects.find(o=>o.id===editingId);if(o&&!cancel){o.text=editor.value;fitText(o);}if(cancel&&textBefore)restoreBook(textBefore);editingId=null;editingTexSession=false;editorComposing=false;editor.hidden=true;livePreview.hide();const before=textBefore;textBefore=null;if(before)record(before);render();}
editor.addEventListener('compositionstart',()=>{editorComposing=true;});editor.addEventListener('compositionend',()=>{editorComposing=false;positionEditor();});
editor.addEventListener('input',()=>{const o=doc.objects.find(o=>o.id===editingId);if(o){o.text=editor.value;positionEditor();renderInspector();}});
function restoreTextCaret(){if(!editingId)return;editor.focus({preventScroll:true});if(textCaret)editor.setSelectionRange(Math.min(textCaret.start,editor.value.length),Math.min(textCaret.end,editor.value.length),textCaret.direction);}
editor.addEventListener('blur',()=>{textCaret={start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection||'none'};if(editingId)setTimeout(()=>{if(editingId&&document.activeElement!==editor&&!isRibbonTextControl(document.activeElement))finishText();},0);});

function captureGesture(e,target){gesture.pointerId=e.pointerId;gesture.captureTarget=target;target.setPointerCapture(e.pointerId);e.preventDefault();}
function beginMarquee(e){
 const initialSelection=[...selection];
 gesture={kind:'marquee',start:svgPoint(e),startClient:{x:e.clientX,y:e.clientY},initialSelection,groupId:groupScope,additive:e.shiftKey,moved:false};
 if(!e.shiftKey){selection=[];renderOverlay();renderInspector();renderLayers();}
}
function drawMarquee(){
 const g=gesture;if(g?.kind!=='marquee'||!g.end)return;
 if(g.moved)selection=marqueeSelection(doc,g.start,g.end,{initialIds:g.initialSelection,additive:g.additive,groupId:g.groupId});
 renderOverlay();
 if(g.moved)overlays.append(el('rect',{x:Math.min(g.start.x,g.end.x),y:Math.min(g.start.y,g.end.y),width:Math.abs(g.end.x-g.start.x),height:Math.abs(g.end.y-g.start.y),fill:'#0c888d14',stroke:'#0c888d','stroke-width':1/scale,'data-marquee':'true','pointer-events':'none'}));
}
function updateMarquee(g,e){g.end=svgPoint(e);g.moved ||= Math.hypot(e.clientX-g.startClient.x,e.clientY-g.startClient.y)>=3;}
svg.addEventListener('pointerdown',e=>{
 if(e.button!==0||e.isPrimary===false||gesture)return;$('#contextMenu').hidden=true;finishText();shortcut.reset();svg.focus({preventScroll:true});const p=svgPoint(e),handle=e.target.closest('[data-handle]')?.dataset.handle,id=e.target.closest('[data-id]')?.dataset.id;
 if(spaceDown){gesture={kind:'pan',clientX:e.clientX,clientY:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};captureGesture(e,svg);return;}
 if(pathDrawing.pointerDown(e,p))return;
 if(handle&&tool==='select'){gesture={kind:handle==='point'?'path-point':handle.startsWith('arc-')?'arc-angle':handle==='rotate'?'rotate':['start','end'].includes(handle)?'endpoint':'resize',handle,pointIndex:Number(e.target.closest('[data-point-index]')?.dataset.pointIndex),start:p,before:snapshot(),initial:clone(editable()),box:bounds(editable())};}
 else if(tool==='select'&&e.target.closest('[data-selection-drag]')&&editable().length){
 gesture={kind:'move',start:p,before:snapshot(),initial:clone(editable()),box:bounds(editable()),moved:false,selectionState:{ids:[...selection],groupId:groupScope}};
 } else if(tool!=='select'){
 const o=makeObject(tool,{x:p.x,y:p.y,w:0,h:0,...(tool==='text'?{w:mm(35),h:mm(12),text:'Text'}:{})});const before=snapshot();doc.objects.push(o);selection=[o.id];render();gesture={kind:'create',start:p,before,id:o.id};
 }else if(id){const o=doc.objects.find(object=>object.id===id);let drillId=null;
 if((e.ctrlKey||e.metaKey)&&o.groupId)selectObject(id,{individual:true,additive:e.shiftKey});
 else if(e.shiftKey)selectObject(id,{additive:true});
 else if(groupScope&&o.groupId===groupScope){if(!selection.includes(id))selectObject(id);}
 else if(!selection.includes(id)||groupScope)setSelection([id]);
 else if(o.groupId){const members=doc.objects.filter(object=>object.groupId===o.groupId);if(members.length===selection.length&&members.every(object=>selection.includes(object.id)))drillId=id;}
 if(!o.locked&&selection.includes(id)&&editable().length)gesture={kind:'move',start:p,before:snapshot(),initial:clone(editable()),box:bounds(editable()),drillId,moved:false,selectionState:{ids:[...selection],groupId:groupScope}};
 else if(drillId)gesture={kind:'select-member',drillId,start:p,moved:false};
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
 if(!gesture){pathDrawing.pointerMove(e,svgPoint(e));return;}if(e.pointerId!==gesture.pointerId)return;const p=svgPoint(e),g=gesture,dx=p.x-g.start?.x,dy=p.y-g.start?.y;
 if(g.kind==='select-member'){g.moved ||= Math.hypot(dx,dy)*scale>=3;return;}
 if(g.kind==='pan'){viewport.scrollLeft=g.left-(e.clientX-g.clientX);viewport.scrollTop=g.top-(e.clientY-g.clientY);return;}
 if(g.kind==='path-point'){
  const object=doc.objects.find(item=>item.id===g.initial[0].id),local=pathLocalPoint(object,p);object.points[g.pointIndex]={x:Math.max(0,Math.min(1,local.x/object.w)),y:Math.max(0,Math.min(1,local.y/object.h))};queueFast();
 }else if(g.kind==='arc-angle'){
  const object=doc.objects.find(item=>item.id===g.initial[0].id),local=pathLocalPoint(object,p),property=g.handle==='arc-start'?'startAngle':'endAngle',other=property==='startAngle'?'endAngle':'startAngle';
  let angle=Math.atan2((local.y-object.h/2)/(object.h/2),(local.x-object.w/2)/(object.w/2))*180/Math.PI;angle+=360*Math.round(((g.lastAngle??object[property])-angle)/360);if(e.shiftKey)angle=Math.round(angle/15)*15;angle=Math.max(-3600,Math.min(3600,angle));if(Math.abs(angle-object[other])>.1){object[property]=angle;g.lastAngle=angle;queueFast();}
 }else if(g.kind==='move'){
 g.moved ||= Math.hypot(dx,dy)*scale>=3;if(!g.moved)return;
 let x=dx,y=dy;if(e.shiftKey){if(Math.abs(x)>Math.abs(y))y=0;else x=0;}
 if(!e.altKey){const candidatesX=[0,doc.width/2,doc.width],candidatesY=[0,doc.height/2,doc.height];for(const o of doc.objects)if(!selection.includes(o.id)){const b=objectBounds(o);candidatesX.push(b.x,b.x+b.w/2,b.x+b.w);candidatesY.push(b.y,b.y+b.h/2,b.y+b.h);}
 const snap=(value,size,targets)=>{let best=4/scale,out=0;for(const t of targets)for(const q of [value,value+size/2,value+size])if(Math.abs(t-q)<best){best=Math.abs(t-q);out=t-q;}return out;};x+=snap(g.box.x+x,g.box.w,candidatesX);y+=snap(g.box.y+y,g.box.h,candidatesY);}
 for(const old of g.initial){const o=doc.objects.find(v=>v.id===old.id);o.x=old.x+x;o.y=old.y+y;}queueFast();
 }else if(g.kind==='resize'){
 const b=g.box,left=g.handle.includes('w'),top=g.handle.includes('n'),ax=left?b.x+b.w:b.x,ay=top?b.y+b.h:b.y;let sx=Math.max(.02,((left?-1:1)*(p.x-ax))/Math.max(b.w,1)),sy=Math.max(.02,((top?-1:1)*(p.y-ay))/Math.max(b.h,1));if(e.shiftKey||g.initial.every(o=>o.type==='image'))sx=sy=Math.min(sx,sy);
 for(const old of g.initial){const o=doc.objects.find(v=>v.id===old.id);o.x=ax+(old.x-ax)*sx;o.y=ay+(old.y-ay)*sy;o.w=old.w*sx;o.h=old.h*sy;if(o.type==='text')o.textAutoSize=false;}queueFast();
 }else if(g.kind==='rotate'){const o=editable()[0],b=g.box,cx=b.x+b.w/2,cy=b.y+b.h/2;let a=Math.atan2(p.y-cy,p.x-cx)*180/Math.PI+90;if(e.shiftKey)a=Math.round(a/15)*15;o.rotation=a;queueFast();}
 else if(g.kind==='endpoint'){const o=editable()[0],old=g.initial[0],a=pathWorldPoint(old,{x:0,y:0}),b=pathWorldPoint(old,{x:1,y:1});o.rotation=0;o.flipX=o.flipY=false;if(g.handle==='start'){o.x=p.x;o.y=p.y;o.w=b.x-p.x;o.h=b.y-p.y;}else{o.x=a.x;o.y=a.y;o.w=p.x-a.x;o.h=p.y-a.y;}queueFast();}
 else if(g.kind==='create'){const o=doc.objects.find(v=>v.id===g.id);if(['line','arrow'].includes(o.type)){let x=dx,y=dy;if(e.shiftKey){const len=Math.hypot(x,y),a=Math.round(Math.atan2(y,x)/(Math.PI/4))*Math.PI/4;x=len*Math.cos(a);y=len*Math.sin(a);}o.w=x;o.h=y;}else{let w=Math.abs(dx),h=Math.abs(dy);if(e.shiftKey)w=h=Math.max(w,h);o.x=Math.min(p.x,g.start.x);o.y=Math.min(p.y,g.start.y);o.w=Math.max(w,2);o.h=Math.max(h,2);}drawContent(o,nodes.get(o.id));renderOverlay();}
 else if(g.kind==='marquee'){updateMarquee(g,e);if(!frame)frame=requestAnimationFrame(()=>{frame=0;drawMarquee();});}
});
function endGesture(e,cancel=false){const g=gesture;if(!g||(e&&e.pointerId!==g.pointerId))return;if(g.kind==='marquee'&&e&&!cancel)updateMarquee(g,e);gesture=null;if(frame){cancelAnimationFrame(frame);frame=0;}if(g.kind==='marquee'){
 const next=cancel?g.initialSelection:g.moved?marqueeSelection(doc,g.start,g.end,{initialIds:g.initialSelection,additive:g.additive,groupId:g.groupId}):g.additive?g.initialSelection:[];
 setSelection(next,{focus:!cancel,scope:g.groupId});if(cancel)$('#statusText').textContent='囲み選択をキャンセルしました';
 }
 else if(g.kind==='select-member'){if(!cancel&&!g.moved)selectObject(g.drillId,{individual:true});}
 else if(g.kind==='move'&&!g.moved&&!cancel){if(g.drillId)selectObject(g.drillId,{individual:true});}
 else if(g.before){if(cancel){restoreBook(g.before);if(g.selectionState){selection=g.selectionState.ids;groupScope=g.selectionState.groupId;}render();}else{if(g.kind==='create'){const o=doc.objects.find(v=>v.id===g.id);if(o.type==='text')fitText(o);if(o.type!=='text'&&Math.hypot(o.w,o.h)<3){o.w=mm(30);o.h=o.type==='line'||o.type==='arrow'?0:mm(20);}}record(g.before);if(g.kind==='create'){const o=doc.objects.find(v=>v.id===g.id);setTool('select');if(o.type==='text')beginText(o);}}}if(g.captureTarget?.hasPointerCapture(g.pointerId))g.captureTarget.releasePointerCapture(g.pointerId);}
viewport.addEventListener('pointerup',e=>{if(pathDrawing.pointerUp(e,svgPoint(e)))return;endGesture(e);});viewport.addEventListener('pointercancel',e=>{if(pathDrawing.drawing)pathDrawing.cancel();endGesture(e,true);});
viewport.addEventListener('lostpointercapture',e=>{if(gesture?.pointerId===e.pointerId)endGesture(null,true);});
svg.addEventListener('dblclick',e=>{if(pathDrawing.doubleClick(e,svgPoint(e)))return;const id=e.target.closest('[data-id]')?.dataset.id||document.elementsFromPoint(e.clientX,e.clientY).map(n=>n.closest?.('[data-id]')?.dataset.id).find(Boolean),o=doc.objects.find(v=>v.id===id);if(o?.groupId)setSelection([o.id],{scope:o.groupId});if(o?.type==='text')beginText(o);else if(['curve','freeform'].includes(o?.type)){pathEditId=o.id;renderOverlay();renderInspector();}else if(o?.source)editSource(o);});
viewport.addEventListener('wheel',createSelectionWheelZoom({viewport,paper,getSelection:selected,getScale:()=>scale,setScale,afterCenter:positionEditor}),{passive:false});
window.addEventListener('keydown',e=>{if(!e.defaultPrevented&&e.code==='Space'&&!editingId&&(e.target===svg||e.target===viewport||e.target===document.body)){spaceDown=true;e.preventDefault();}});window.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false;});window.addEventListener('blur',()=>{spaceDown=false;shortcut.reset();if(gesture)endGesture(null,true);});

function duplicate(){const old=selected();if(!old.length)return;change(()=>{const added=old.map(o=>{const n=clone(o);n.id=uid();n.x+=mm(3);n.y+=mm(3);n.locked=false;return n;});if(!groupScope)remapGroupIds(added,uid);doc.objects.push(...added);selection=added.map(o=>o.id);});}
function applyTextStyle(property,value){if(editingId){const o=doc.objects.find(o=>o.id===editingId);o[property]=typeof value==='function'?value(o[property],o):value;if(property==='text')editor.value=o.text;positionEditor();renderInspector();return;}change(()=>editable().filter(o=>o.type==='text').forEach(o=>{o[property]=typeof value==='function'?value(o[property],o):value;if(o.textAutoSize||['text','textMode','fontSize','fontFamily','bold','italic','underline'].includes(property))fitText(o);}));}
function changeFont(action){applyTextStyle('fontSize',v=>fontSizeForAction(v,action));}
function addLabels(){finishText();panelLabelDialog.show();}
function execute(action,payload={}){
 if(startupRestoring)return;
 if(action==='present')return presentation.start({fromCurrent:true});
 if(presentation.active)return;
 if(pathDrawing?.drawing){if(action==='save'||action==='save-as'){if(!pathDrawing.finish()){toast('2点以上を指定してから保存してください');return;}}else if(['undo','redo','new','sample','new-figure','open','next-figure','previous-figure'].includes(action)){pathDrawing.cancel();if(action==='undo')return;}}
 if(action==='edit-points'){const object=editable()[0];if(selection.length===1&&['curve','freeform'].includes(object?.type)){pathEditId=pathEditId===object.id?null:object.id;renderOverlay();renderInspector();svg.focus({preventScroll:true});}return;}
 if(action==='close-path')return change(()=>editable().filter(object=>['curve','freeform'].includes(object.type)&&(object.closed||object.points.length>=3)).forEach(object=>object.closed=!object.closed));
 if(gesture&&['undo','redo','new','sample','new-figure','duplicate-figure','delete-figure','open','next-figure','previous-figure','rotate-right','rotate-left','flip-v','flip-h'].includes(action))endGesture(null,true);
 if(['select','text','line','arrow','rect','ellipse','curve','freeform','arc'].includes(action))return setTool(action);
 if(['font-grow','font-shrink','font-up','font-down'].includes(action))return changeFont(action);
 if(['bold','italic','underline'].includes(action))return applyTextStyle(action,v=>!v);
 if(action.startsWith('text-')&&['left','center','right','justify'].includes(action.slice(5)))return applyTextStyle('textAlign',action.slice(5));
 if(action==='commit-text'){finishText();svg.focus();return;}if(action==='edit-text'){const o=selected()[0];if(o?.type==='text')beginText(o);return;}
 if(action==='select-group')return selectWholeGroup();
 if(action==='select-member'){const object=doc.objects.find(object=>object.id===(payload.id||selection[0]));if(object?.groupId)selectObject(object.id,{individual:true});return;}
 if(action==='escape'){if(pathDrawing?.drawing){pathDrawing.cancel();setTool('select');return;}if(pathEditId){pathEditId=null;renderOverlay();renderInspector();return;}if(editingId)finishText(true);else if(gesture)endGesture(null,true);else if(groupScope)selectWholeGroup();else{setTool('select');setSelection([]);}$('#contextMenu').hidden=true;return;}
 if(action==='undo'||action==='redo'){const sidebarFocused=!!document.activeElement?.closest('#figureTabs');finishText();restoreBook(history[action](snapshot()));dirty=true;revision++;scheduleSave();render();if(sidebarFocused)focusFigure();return;}
 if(action==='select-all'){finishText();setSelection(doc.objects.filter(object=>!groupScope||object.groupId===groupScope).map(object=>object.id),{scope:groupScope});return;}
 if(action==='cycle-selection'){const list=doc.objects.filter(object=>!groupScope||object.groupId===groupScope);if(!list.length)return;const i=list.findIndex(o=>o.id===selection.at(-1));setSelection([list[(i+(payload.direction||1)+list.length)%list.length].id],{scope:groupScope});return;}
 if(action==='duplicate')return duplicate();
 if(action==='delete')return change(()=>{const ids=new Set(editable().map(o=>o.id));doc.objects=doc.objects.filter(o=>!ids.has(o.id));selection=[];});
 if(action==='nudge')return change(()=>editable().forEach(o=>{o.x+=payload.dx;o.y+=payload.dy;}));
 if(['rotate-right','rotate-left','flip-v','flip-h'].includes(action))return change(()=>rotateOrFlip(doc,selection,action,selectionOptions()));
 if(action.startsWith('align-'))return change(()=>align(doc,selection,action.slice(6),$('#alignTarget').value,selectionOptions()));
 if(action.startsWith('distribute-'))return change(()=>distribute(doc,selection,action.slice(-1),selectionOptions()));
 if(['front','back','forward','backward'].includes(action))return change(()=>reorder(doc,editable().map(o=>o.id),action,selectionOptions()));
 if(action==='group'&&groupScope)return;
 if(action==='group')return change(()=>{const targets=editable();if(new Set(targets.map(object=>object.groupId||object.id)).size<2)return;try{regroupObjects(targets,uid());}catch(error){toast(error.message);}});
 if(action==='ungroup'||action==='ungroup-all')return change(()=>{const targets=groupScope?doc.objects.filter(object=>object.groupId===groupScope):editable();if(targets.some(object=>object.locked))return;ungroupObjects(targets,{all:action==='ungroup-all'});groupScope=null;});
 if(action==='lock')return change(()=>{const value=!selected().every(o=>o.locked);selected().forEach(o=>o.locked=value);});
 if(action==='copy-format'){const o=selected()[0];if(o){formatClipboard={...Object.fromEntries(['fill','stroke','fillTransparency','strokeTransparency','strokeWidth','strokeAlignment','textMode','fontSize','fontFamily','bold','italic','underline','textAlign','opacity'].filter(p=>o[p]!==undefined).map(p=>[p,o[p]])),...(supportsLineStyle(o)?{dashStyle:lineStyleValue(o),dashed:lineStyleValue(o)!=='solid'}:{})};toast('書式をコピーしました');}return;}
 if(action==='paste-format'){if(formatClipboard)change(()=>editable().forEach(o=>{Object.assign(o,formatClipboard);if(o.type==='text')fitText(o);}));return;}
 if(action==='auto-grid'||action==='auto-hero')return change(()=>{let ids=selection;if(!ids.length)ids=doc.objects.filter(o=>o.type==='image'&&!o.locked).map(o=>o.id);autoLayout(doc,ids,action==='auto-grid'?'grid':'hero',selectionOptions());});
 if(action==='image-array'){finishText();return imageArrayDialog.show();}
 if(action==='no-fill')return change(()=>editable().filter(o=>['rect','ellipse'].includes(o.type)||['curve','freeform'].includes(o.type)&&o.closed).forEach(o=>o.fill='none'));
 if(action==='toggle-arrow-start'||action==='toggle-arrow-end')return change(()=>editable().filter(o=>['line','arrow'].includes(o.type)).forEach(o=>{const end=action==='toggle-arrow-start'?'start':'end';setArrowProperty(o,end==='start'?'arrowStartStyle':'arrowEndStyle',arrowEndpoint(o,end).style==='none'?'triangle':'none');}));
 if(action==='labels')return addLabels();
 if(action==='toggle-selection-pane'){const open=ribbon.toggleSelectionPane();if(!open&&livePreview.source==='ribbon')livePreview.hide();return;}
 if(action==='show-text-pane'){ribbon.toggleSelectionPane(true);const details=$('#propText').closest('details');details.open=true;requestAnimationFrame(()=>{if($('#ribbonSelectionPane').hidden)return;$('#ribbonSelectionPane .inspector-scroll').scrollTop=0;if(!$('#propText').disabled)$('#propText').focus({preventScroll:true});});return;}
 if(action==='zoom-actual'){setScale(1);return;}
 if(action==='focus-canvas'){for(const menu of $$('details:not(.sidebar-text-panel)[open]'))menu.open=false;svg.focus({preventScroll:true});return;}
 if(action==='fit')return fit();if(action==='help')return $('#helpDialog').showModal();
 if(action==='import')return $('#imageInput').click();if(action==='open')return openProject();if(action==='save'||action==='save-as'){if(!commitFocusedProperty())return;return saveProject(action==='save-as');}
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
 if(action==='new'||action==='sample'){finishText();if(dirty&&!confirm(shortcutLabel('現在のFigureを閉じます。必要な場合は先にCtrl+Sで保存してください。続けますか？')))return;const before=snapshot();if(action==='sample'){const demo=createDemo();doc=demo.doc;for(const [k,v]of demo.assets)assets.set(k,v);}else{doc=newDocument();doc.name='Fig. 1';}bookId=uid();preservedWorkspace=null;figures=[doc];selection=[];previewQuality.clear();record(before);fit();return;}
 if(action==='export-svg')return exportSVG();if(action==='export-png')return exportPNG();if(action==='export-pdf')return exportPDF();
 if(action==='choose-work-folder')return chooseProjectWorkFolder();
 if(action==='setup-work-folder')return setupProjectWorkFolder();
 if(action==='clear-work-folder')return clearProjectWorkFolder();
 if(action==='attach-source'){if(selected().length!==1||selected()[0].type!=='image'){toast('画像・グラフを1つ選択してください');return;}return pickSourceProject(selected()[0]);}
 if(action==='edit-source'){const o=selected()[0];if(o?.source)editSource(o);else toast('先に「元プロジェクトを関連付け」で .plotproject / .mifito を選択してください');return;}
}
const shortcut=createShortcutHandler({execute,isEditing:e=>e.target===editor?'canvas-text':e.target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName),isCanvasActive:()=>document.querySelector('dialog[open]')?false:document.activeElement?.closest('#studioRibbon,#ribbonSelectionPane,.app-header')?'ribbon':(document.activeElement===svg||document.activeElement===document.body||document.activeElement===editor||!!document.activeElement?.closest('#figureTabs')),onHint:text=>{$('#keyHint').textContent=text;$('#keyHint').hidden=!text;}});
window.addEventListener('keydown',shortcut);document.addEventListener('pointerdown',()=>shortcut.reset());
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;execute(action);for(const d of $$('details:not(.sidebar-text-panel)[open]'))d.open=false;if(['new-figure','duplicate-figure','delete-figure','move-figure-left','move-figure-right'].includes(action)){focusFigure();return;}if(!['labels','image-array','help','open','import','save','save-as','choose-work-folder','setup-work-folder','attach-source','edit-source','export-pdf','toggle-selection-pane','show-text-pane','present'].includes(action)&&!editingId)svg.focus({preventScroll:true});});
for(const button of $$('#studioRibbon [data-action],#ribbonSelectionPane [data-action]'))button.addEventListener('pointerdown',event=>{if(editingId&&isRibbonTextControl(button))event.preventDefault();});
$('#docName').addEventListener('input',e=>{const name=e.target.value||'Untitled Figure';change(()=>doc.name=name);});
for(const [id,key]of [['pageWidth','width'],['pageHeight','height']])$('#'+id).addEventListener('change',e=>{const v=Number(e.target.value);if(v>=10&&v<=2000){change(()=>doc[key]=mm(v));fit();}else{toast('用紙サイズは10〜2000 mmです');renderInspector();}});
$('#zoom').addEventListener('input',e=>setScale(Number(e.target.value)/100));
$('#previewQuality').addEventListener('change',e=>{previewErrorShown=false;previewQuality.setQuality(e.target.value);try{localStorage.setItem('figure-studio-preview-quality-v2',e.target.value);}catch{}render();toast('プレビュー画質 '+e.target.selectedOptions[0].textContent+' · 書き出しは元の画質');});
function commitPropertyInput(input){
 const p=propertyKey(input);if(input.disabled){pendingPropertyInputs.delete(input);return true;}
 let value=input.value;
 if(Object.hasOwn(ARROW_PROPERTIES,p)){change(()=>editable().forEach(object=>setArrowProperty(object,p,value)));pendingPropertyInputs.delete(input);return true;}
 const numeric=['x','y','w','h','rotation','fontSize','strokeWidth','opacity','fillTransparency','strokeTransparency','startAngle','endAngle'].includes(p);
 if(numeric){
  if(value.trim()===''||input.validity?.badInput||!Number.isFinite(Number(value))){toast('有効な数値を入力してから確定してください');return false;}
  value=Number(value);if(['x','y','w','h'].includes(p))value=mm(value);
  if(p==='opacity')value=1-Math.max(0,Math.min(100,value))/100;
  if(p==='fillTransparency'||p==='strokeTransparency')value=Math.max(0,Math.min(100,value));
  if((p==='w'||p==='h')&&value<=0&&!editable().every(object=>['line','arrow'].includes(object.type))){toast('幅と高さは0より大きくしてください');return false;}
  if(p==='startAngle'||p==='endAngle'){if(Math.abs(value)>3600||editable().some(object=>object.type==='arc'&&object[p==='startAngle'?'endAngle':'startAngle']===value)){toast('円弧の開始角度と終了角度は異なる値（−3600〜3600°）にしてください');return false;}}
  if(p==='fontSize')value=Math.max(1,Math.min(1000,value));if(p==='strokeWidth')value=Math.max(0,Math.min(100,value));
 }
 pendingPropertyInputs.delete(input);
 const textOnly=isTextPropertyInput(input);
 if(textOnly)applyTextStyle(p,value);
 else change(()=>editable().forEach(object=>{if((p==='w'||p==='h')&&object.type==='image'){const ratio=value/object[p];object[p==='w'?'h':'w']*=ratio;}object[p]=value;if(object.type==='text'&&(p==='w'||p==='h'))object.textAutoSize=false;}));
 if(numeric)input.value=String(['x','y','w','h'].includes(p)?Number(toMM(value).toFixed(2)):p==='opacity'?Math.round((1-value)*100):value);
 if(editingId&&textOnly&&((input.tagName==='SELECT'||input.type==='color')&&document.activeElement===input||input.hasAttribute('data-color-value')))restoreTextCaret();
 return true;
}
function commitFocusedProperty(){const focused=document.activeElement,input=focused?.matches?.('[data-prop]')&&pendingPropertyInputs.has(focused)?focused:lastPendingPropertyInput;return !input||!pendingPropertyInputs.has(input)||commitPropertyInput(input);}
for(const input of $$('[data-prop]')){
 input.addEventListener('input',()=>{pendingPropertyInputs.add(input);lastPendingPropertyInput=input;});
 input.addEventListener('change',()=>commitPropertyInput(input));
 input.addEventListener('blur',()=>{if(pendingPropertyInputs.has(input))commitPropertyInput(input);});
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&input.tagName!=='TEXTAREA'&&!event.isComposing){event.preventDefault();if(pendingPropertyInputs.has(input)&&!commitPropertyInput(input))return;if(editingId&&isTextPropertyInput(input))restoreTextCaret();else svg.focus({preventScroll:true});}});
}


function updateRibbonPreview(composition=false){
 const o=selected().find(object=>object.type==='text'),input=$('#propText');if(!o||input.disabled){livePreview.hide();return;}
 const copy={...o,text:input.value};if(!$('#ribbonSelectionPane').hidden||texRenderer.hasMath(copy)||livePreview.visible&&livePreview.source==='ribbon')livePreview.show(copy,{source:'ribbon',composition});
}
$('#propText').addEventListener('focus',()=>updateRibbonPreview());
$('#propText').addEventListener('input',event=>{if(editingId){const o=doc.objects.find(o=>o.id===editingId);if(o){o.text=event.target.value;editor.value=o.text;positionEditor();}}else updateRibbonPreview(event.isComposing);});
$('#propText').addEventListener('compositionend',()=>updateRibbonPreview());
$('#propText').closest('details').addEventListener('toggle',event=>{if(!event.target.open&&!editingId&&livePreview.source==='ribbon')livePreview.hide();});
$('#finishTextEdit').addEventListener('click',()=>{if(editingId)finishText();else{if(!commitFocusedProperty())return;livePreview.hide();for(const menu of $$('details:not(.sidebar-text-panel)[open]'))menu.open=false;}svg.focus({preventScroll:true});});
document.addEventListener('pointerdown',event=>{if(!editingId&&livePreview.source==='ribbon'&&!event.target.closest('#texPreviewPanel,.ribbon-text-menu')&&!isRibbonTextControl(event.target))livePreview.hide();});

async function importImages(files,at){finishText();const documentId=doc.id,prepared=[];for(const f of files){try{const a=await imageAsset(f);prepared.push({a,f});}catch(e){toast(`${f.name||'画像'}: ${e.message}`);}}if(doc.id!==documentId){toast('Figureが切り替わったため画像追加を中止しました');return;}const before=snapshot(),ids=[];for(const {a,f}of prepared){assets.set(a.id,a);const size=importedImageSize(a,doc),point=at??imageInsertionPoint(doc,size,ids.length*mm(4));const o=makeObject('image',{...point,...size,assetId:a.id,name:f.name||'貼り付け画像'});doc.objects.push(o);ids.push(o.id);}selection=ids;record(before);svg.focus();}
function receiveDirectFigure(payload){
 if(updateReloading)return Promise.reject(Error('Figure Studioを更新しています。更新後にもう一度送ってください。'));
 const job=transferQueue.then(()=>importDirectFigure(payload));transferQueue=job.catch(()=>{});return job;
}
async function importDirectFigure(payload){
 const {app,project,preview,sourceName,transferId,image:sourceImage}=payload;
 if(payload.batch||sourceImage)return syncMiFiToFigures(payload,{app,transferId});
 if(!['plot','mifito'].includes(app)||typeof transferId!=='string'||!transferId)throw Error('図の送信情報が不正です。');
 // Keep the transfer ID in the saved object, so an acknowledgement lost during
 // a reload cannot create a second copy when the sender retries.
 for(const f of figures){const existing=f.objects.find(o=>o.source?.transferId===transferId);if(existing){switchFigure(f.id);setSelection([existing.id]);return;}}
 if(project.size>280*1024*1024)throw Error('元プロジェクトは280 MB以内にしてください。');
 if(app==='mifito'&&sourceImage){const identity=await readMifitoIdentity(project),entry=identity.images.find(image=>image.imageId===sourceImage.imageId);if(identity.projectId!==sourceImage.projectId||entry?.fingerprint!==sourceImage.fingerprint)throw Error('画像とMiFiToプロジェクトの対応情報が一致しません。');}
 finishText();if(gesture)endGesture(null,true);const documentId=doc.id;
 const name=String(sourceName||`Figure${app==='mifito'?'.mifito':'.plotproject'}`).replace(/[\\/]/g,'_').slice(0,255);
 const [image,projectURL]=await Promise.all([imageAsset(preview,name.replace(/\.(plotproject|mifito)$/i,'')+(preview.type==='image/svg+xml'?'.svg':'.png')),blobToDataURL(project)]);
 if(doc.id!==documentId)throw Error('受け取り先のFigureが切り替わりました。もう一度送ってください。');
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
let replaceImageTarget=null;
$('#replaceImageButton').addEventListener('click',()=>{const o=editable()[0];if(selection.length!==1||o?.type!=='image'||o.source||projectSaving||projectOpening||updateReloading)return;replaceImageTarget={book:bookId,figure:doc.id,panel:o.id,asset:o.assetId};$('#replaceImageInput').value='';$('#replaceImageInput').click();});
async function replaceImportedImage(file,target){
 const asset=await imageAsset(file),object=doc.objects.find(o=>o.id===target.panel);
 if(bookId!==target.book||doc.id!==target.figure||!object||object.type!=='image'||object.assetId!==target.asset||object.source||object.locked||object.groupId&&doc.objects.some(o=>o.groupId===object.groupId&&o.locked))throw Error('対象の画像が変わったため、差し替えを中止しました。');
 const before=snapshot();assets.set(asset.id,asset);object.assetId=asset.id;record(before);
 toast(`元画像に差し替えました · ${asset.width} × ${asset.height} px（配置サイズは維持）`);
}
$('#replaceImageInput').addEventListener('change',async e=>{const file=e.target.files[0],target=replaceImageTarget;e.target.value='';replaceImageTarget=null;if(!file||!target)return;try{await replaceImportedImage(file,target);}catch(error){toast(error.message);}});
viewport.addEventListener('dragover',e=>{e.preventDefault();viewport.classList.add('drag-over');});viewport.addEventListener('dragleave',()=>viewport.classList.remove('drag-over'));
viewport.addEventListener('drop',async e=>{
 e.preventDefault();viewport.classList.remove('drag-over');const files=[...e.dataTransfer.files];
 if(files.length!==1||!/\.(figurestudio|json)$/i.test(files[0].name))return importImages(files,svgPoint(e));
 if(projectSaving||projectOpening||updateReloading)return;
 projectOpening=true;updateProjectFileUI();
 try{
  let handle;
  try{const dropped=await e.dataTransfer.items?.[0]?.getAsFileSystemHandle?.();if(dropped?.kind==='file')handle=dropped;}
  catch{/* File-only drop remains available when the browser cannot grant a native handle. */}
  await readProject(files[0],handle);
 }finally{projectOpening=false;updateProjectFileUI();}
});
function clipboardActive(e){return !editingId&&!e.target.isContentEditable&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!document.querySelector('dialog[open]')&&(document.activeElement===svg||document.activeElement===document.body);}
document.addEventListener('copy',e=>{
 const generation=++clipboardGeneration;if(!clipboardActive(e)||!selection.length)return;
 const captured=clone(selected()),capturedAssets=new Map(assets),marker=`Figure Studio objects:${uid()}`;clipboard=captured;clipboardMarker=marker;
 e.clipboardData.setData('application/x-figure-studio',JSON.stringify(captured));e.preventDefault();
 const writing=writeSelectionImage({marker,renderPNG:async()=>{const result=await selectionPNG({objects:captured,assets:capturedAssets,draw:(o,g,a)=>drawContent(o,g,true,a),prepare:objects=>texRenderer.prepare(objects)});if(generation!==clipboardGeneration)throw new DOMException('新しいコピー操作を優先します','AbortError');return result;}});
 clipboardPNG=writing?writing.then(result=>result.blob,()=>null):null;
 if(!writing){toast('Studio内にコピーしました。外部への画像コピーはこのブラウザでは利用できません。');return;}
 toast('画像をクリップボードへコピーしています…');writing.then(result=>{if(generation===clipboardGeneration)toast(`画像をコピーしました · ${result.width} × ${result.height} px（Studio内でも編集可能）`);},error=>{if(generation===clipboardGeneration)toast('Studio内にはコピーしました。外部への画像コピーを許可するか、PNG書き出しをお使いください。');});
});
document.addEventListener('cut',e=>{++clipboardGeneration;if(!clipboardActive(e)||!selection.length)return;clipboard=clone(selected());clipboardMarker=`Figure Studio objects:${uid()}`;clipboardPNG=null;e.clipboardData.setData('application/x-figure-studio',JSON.stringify(clipboard));e.preventDefault();execute('delete');});
document.addEventListener('paste',async e=>{
 if(!clipboardActive(e))return;let copied=studioPasteObjects(e.clipboardData,clipboard,clipboardMarker);
 const files=[...e.clipboardData.files].filter(f=>f.type.startsWith('image/')),text=e.clipboardData.getData('text/plain');
 if(!copied?.length&&files.length){
  e.preventDefault();const figure=doc.id,book=bookId,ownObjects=clipboard,ownPNG=clipboardPNG;
  if(files.length===1&&ownObjects?.length&&ownObjects.every(o=>o.type!=='image'||assets.has(o.assetId)&&(!o.source||assets.has(o.source.assetId)))&&ownPNG&&await matchesSelectionPNG(files[0],await ownPNG))copied=ownObjects;
  if(doc.id!==figure||bookId!==book){toast('Figureが切り替わりました。もう一度貼り付けてください。');return;}
  if(!copied?.length){await importImages(files);return;}
 }
 if(copied?.length){e.preventDefault();const temp={...doc,objects:copied};try{validateDocument(temp);}catch{return;}change(()=>{const added=copied.map(o=>{const n=clone(o);n.id=uid();n.x+=mm(3);n.y+=mm(3);return n;});remapGroupIds(added,uid);doc.objects.push(...added);selection=added.map(o=>o.id);});return;}
 if(text&&text.length<100000){e.preventDefault();change(()=>{const o=makeObject('text',{text});fitText(o);doc.objects.push(o);selection=[o.id];});}
});

function assetIds(){syncFigure();return new Set(figures.flatMap(f=>f.objects.flatMap(o=>[o.assetId,o.source?.assetId])).filter(Boolean));}
function packageProject(){const used={};for(const id of assetIds()){const a=assets.get(id);if(a){const {previewUrl,persisted,...rest}=a;used[id]=rest;}}return {...snapshot(),assets:used,...(preservedWorkspace?{workspace:preservedWorkspace}:{})};}
function workspacePersistence(){const api=getFigureWorkspace(window);return api?installWorkspacePersistence(api,{windowRef:window.parent,documentRef:window.parent.document}):null;}
const saveSourceOption=$('#saveSourceProjects');
try{saveSourceOption.checked=localStorage.getItem('figure-studio-save-source-projects')!=='off';}catch{}
saveSourceOption.addEventListener('change',()=>{try{localStorage.setItem('figure-studio-save-source-projects',saveSourceOption.checked?'on':'off');}catch{}});
const workFolders=createProjectWorkFolders(),workFolderListeners=new Set();
const sourcePrefetch=createSourcePrefetch({
 scan:findProjectsInWorkFolder,
 identify:{plot:async file=>openedPlotIdentity(await readPlotIdentity(file),file.name),mifito:readMifitoIdentity},
 async resolveProjectId(source){
  const identity=await sourceIdentity(assets.get(source.assetId),source.app);
  return (source.app==='plot'?await openedPlotIdentity(identity,source.name):identity).projectId;
 }
});
let workFolderBook='',workFolderFile=null,workFolderEntries=[],readableWorkFolders=[],workFolderSerial=0,workFolderChanging=false,workFolderLoad=null;
let pendingWorkFolderFile=null,prefetchRevision=-1,prefetchDirectories=null;
function currentWorkFolderFile(){
 return pendingWorkFolderFile?.bookId===bookId?pendingWorkFolderFile.handle:projectFiles.target(bookId)?.handle??null;
}
function resetSourcePrefetch(){
 prefetchRevision=-1;prefetchDirectories=null;sourcePrefetch.reset();
}
function configureSourcePrefetch(directories){
 if(prefetchRevision===revision&&prefetchDirectories===directories)return;
 prefetchRevision=revision;prefetchDirectories=directories;
 sourcePrefetch.start({bookId,directories,figures});
}
async function getCurrentWorkFolders(expectedBookId=bookId){
 if(expectedBookId!==bookId)return [];
 if(workFolderBook!==bookId||workFolderFile!==currentWorkFolderFile())loadCurrentWorkFolder();
 const projectFile=currentWorkFolderFile(),serial=workFolderSerial;
 await workFolderLoad;
 return expectedBookId===bookId&&projectFile===currentWorkFolderFile()&&serial===workFolderSerial?readableWorkFolders:[];
}
window.FigureStudioWorkFolder=Object.freeze({
 async getDirectory(owner){return (await getCurrentWorkFolders(owner))[0]??null;},
 async findSource(request,{signal,details=false}={}){
  if(signal?.aborted||typeof request?.sourceKey!=='string')return null;
  const owner=request.sourceKey.split('/')[0];
  const folders=await getCurrentWorkFolders(owner);
  if(signal?.aborted)return null;
  if(!folders.length)return details&&sourcePrefetch.wasOpened(request)?
   {name:request.name,handle:null,verified:false,sameName:false,multiple:false}:null;
  configureSourcePrefetch(folders);
  return sourcePrefetch.findSource(request,{signal,details});
 },
 subscribe(listener){
  workFolderListeners.add(listener);
  return ()=>workFolderListeners.delete(listener);
 }
});
function notifyWorkFolderListeners(){
 for(const listener of workFolderListeners){try{listener();}catch{}}
}
function workFolderPickerHost(){return getFigureWorkspace(window)?window.parent:window;}
function workFolderBusy(){return projectSaving||projectOpening||startupRestoring||updateReloading||workFolderChanging;}
function canAllowWorkFolder({handle,access}){return access==='prompt'&&typeof handle.requestPermission==='function';}
async function checkWorkFolderPermission(handle,mode){
 try{return await (handle.queryPermission?.({mode})??'granted');}
 catch{return 'denied';}
}
function setWorkFolderEntries(entries){
 workFolderEntries=entries;
 const handles=entries.filter(folder=>folder.readable).map(folder=>folder.handle);
 if(handles.length!==readableWorkFolders.length||handles.some((handle,index)=>handle!==readableWorkFolders[index]))readableWorkFolders=handles;
}
function workFolderLabel(folder){
 const {handle,access,readable}=folder;
 return handle.name+(access==='granted'?'':readable?'（書き込み許可が必要）':'（アクセス許可が必要）');
}
let previousWorkFolderRows=null,previousWorkFolderBusy=false;
function paintWorkFolderRows(busy){
 if(previousWorkFolderRows===workFolderEntries&&previousWorkFolderBusy===busy)return;
 previousWorkFolderRows=workFolderEntries;previousWorkFolderBusy=busy;
 const rows=workFolderEntries.map(folder=>{
  const row=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');
  name.textContent=workFolderLabel(folder)+(folder.followProject?'（既定）':'');name.title=name.textContent;row.append(name);
  if(canAllowWorkFolder(folder)){
   const allow=document.createElement('button');allow.type='button';allow.textContent='許可…';allow.disabled=busy;
   allow.setAttribute('aria-label',folder.handle.name+'へのアクセスを許可');
   allow.onclick=()=>allowProjectWorkFolder(folder);row.append(allow);
  }
  remove.type='button';remove.textContent='外す';remove.disabled=busy;
  remove.setAttribute('aria-label',folder.handle.name+'を作業フォルダから外す');
  remove.onclick=()=>changeProjectWorkFolders(folder);
  row.append(remove);return row;
 });
 $('#projectWorkFolderList').replaceChildren(...rows);
}
function paintProjectWorkFolder(){
 const note=$('#projectWorkFolder'),choose=$('[data-action="choose-work-folder"]'),clear=$('[data-action="clear-work-folder"]');
 const setup=$('#workFolderStatusSetup'),first=workFolderEntries[0],count=workFolderEntries.length;
 const needsPermission=workFolderEntries.find(canAllowWorkFolder);
 const supported=typeof workFolderPickerHost().showDirectoryPicker==='function';
 const busy=workFolderBusy();
 const folderLabel=!supported?'利用不可':workFolderLoad?'確認中…':!count?'未設定':count===1?workFolderLabel(first):count+'件';
 const help=!supported?'このブラウザでは作業フォルダを選べません。ChromeまたはEdgeで開いてください。'
  :!count?'このPCで元ファイルを探すフォルダを追加します。.figurestudioが入っているフォルダから指定できます。'
  :'図を開くと、利用できる作業フォルダとそのサブフォルダから元ファイルを探します。';
 note.textContent='作業フォルダ　'+folderLabel;
 $('#workFolderStatusName').textContent=folderLabel;
 $('#workFolderStatus').title=note.textContent+(count>1?'\n'+workFolderEntries.map(workFolderLabel).join('\n'):'')+'\n'+help;
 setup.hidden=!supported;
 setup.disabled=busy;
 setup.textContent=needsPermission?'許可…':count?'追加…':'選択…';
 setup.setAttribute('aria-label',needsPermission?'作業フォルダへのアクセスを許可':'このPCで作業フォルダを追加');
 setup.title=help;
 choose.textContent='作業フォルダを追加…';
 choose.disabled=busy||!supported;
 choose.title=supported?'元プロジェクトを探すフォルダの読み取りと書き込みを許可します':'このブラウザではフォルダを指定できません';
 clear.hidden=count===1&&first.followProject;
 clear.disabled=busy;
 paintWorkFolderRows(busy);
 $('#projectWorkFolderHelp').textContent=help;
}
function loadCurrentWorkFolder(){
 resetSourcePrefetch();
 workFolderBook=bookId;workFolderFile=currentWorkFolderFile();
 setWorkFolderEntries([]);
 const owner=bookId,file=workFolderFile,serial=++workFolderSerial;
 workFolderLoad=workFolders.getSelections(owner,file).then(async saved=>{
  if(owner!==bookId||serial!==workFolderSerial)return;
  const entries=await Promise.all(saved.map(async folder=>{
   const access=await checkWorkFolderPermission(folder.handle,'readwrite');
   const readable=access==='granted'||await checkWorkFolderPermission(folder.handle,'read')==='granted';
   return {...folder,access,readable};
  }));
  if(owner!==bookId||serial!==workFolderSerial)return;
  setWorkFolderEntries(entries);
 }).catch(()=>{}).finally(()=>{
  if(owner!==bookId||serial!==workFolderSerial)return;
  workFolderLoad=null;paintProjectWorkFolder();
 });
 notifyWorkFolderListeners();
}
function updateProjectWorkFolderUI(){
 if(workFolderBook!==bookId||workFolderFile!==currentWorkFolderFile())loadCurrentWorkFolder();
 paintProjectWorkFolder();
}
async function changeProjectWorkFolders(change){
 if(workFolderBusy())return;
 const owner=bookId,host=workFolderPickerHost();
 if(change==='add'&&typeof host.showDirectoryPicker!=='function')return;
 workFolderChanging=true;paintProjectWorkFolder();
 try{
  const file=currentWorkFolderFile(),current=()=>owner===bookId&&file===currentWorkFolderFile();
  let folders=null,message='作業フォルダを既定に戻しました';
  if(change==='add'){
   const startIn=workFolderEntries[0]?.handle||file;
   const handle=await host.showDirectoryPicker({id:'figure-studio-work-folder',mode:'readwrite',...(startIn?{startIn}:{})});
   if(!current())return;
   folders=await workFolders.getSelections(owner,file);
   let existing=-1;
   for(let index=0;index<folders.length;index++){
    const previous=folders[index].handle;
    try{if(previous===handle||await handle.isSameEntry?.(previous)){existing=index;break;}}
    catch{/* Keep different folders separate unless the browser confirms a match. */}
   }
   const folder={handle,followProject:await isProjectFolder(handle,file)};
   if(existing===-1)folders=[...folders,folder];
   else folders=folders.map((entry,index)=>index===existing?folder:entry);
   message='作業フォルダ「'+handle.name+(existing===-1?'」を追加しました':'」を更新しました');
  }else if(change!=='reset'){
   folders=workFolderEntries.filter(folder=>folder!==change);
   message='「'+change.handle.name+'」を作業フォルダから外しました';
  }
  if(!current())return;
  const stored=workFolders.setSelections(owner,folders);
  loadCurrentWorkFolder();
  const remembered=await stored;
  if(current())toast(message+(remembered?'':'。ブラウザの記憶を更新できませんでした'));
 }catch(error){if(error.name!=='AbortError')toast('作業フォルダを設定できませんでした。'+error.message);}
 finally{workFolderChanging=false;updateProjectWorkFolderUI();}
}
const chooseProjectWorkFolder=()=>changeProjectWorkFolders('add'),clearProjectWorkFolder=()=>changeProjectWorkFolders('reset');
function setupProjectWorkFolder(){
 const folder=workFolderEntries.find(canAllowWorkFolder);
 return folder?allowProjectWorkFolder(folder):chooseProjectWorkFolder();
}
async function allowProjectWorkFolder(folder){
 const {handle}=folder,owner=bookId;
 if(workFolderBusy()||!canAllowWorkFolder(folder))return;
 workFolderChanging=true;paintProjectWorkFolder();
 try{
  const permission=await handle.requestPermission({mode:'readwrite'});
  if(owner!==bookId||!workFolderEntries.includes(folder))return;
  setWorkFolderEntries(workFolderEntries.map(entry=>entry===folder?{...folder,access:permission,readable:permission==='granted'||folder.readable}:entry));
  if(permission==='granted'){resetSourcePrefetch();notifyWorkFolderListeners();toast('作業フォルダへのアクセスが許可されました');}
  else toast('作業フォルダへのアクセスが許可されませんでした');
 }catch(error){if(error.name!=='AbortError')toast('作業フォルダへのアクセスを許可できませんでした。'+error.message);}
 finally{workFolderChanging=false;updateProjectWorkFolderUI();}
}
function updateProjectFileUI(){
 const target=projectFiles.target(bookId),busy=projectSaving||projectOpening,button=$('[data-action="save"]');
 saveSourceOption.disabled=busy||!getFigureWorkspace(window);
 saveSourceOption.title=getFigureWorkspace(window)?'通常の保存・上書き保存で、Studio内のPlot・MiFiToタブも保存します':'Studioの3タブ画面で利用できます';
 button.disabled=busy;$('[data-action="save-as"]').disabled=busy;$('[data-action="open"]').disabled=busy;
 $('#projectSaveLabel').textContent=projectSaving?'保存中…':target?.handle?'上書き保存':'保存';
 button.title=shortcutLabel(target?.handle?`${target.name} に上書き保存 (Ctrl+S)`:'保存先を選んでプロジェクトを保存 (Ctrl+S)');
 $('#projectSaveTarget').textContent=target?.name||'保存先を選択';
 $('#projectSaveTarget').title=target?.name||'';
 updateProjectWorkFolderUI();
}
async function saveProject(saveAs=false){
 if(projectSaving||projectOpening||updateReloading)return;
 if(gesture)endGesture(null,false);finishText();
 const capturedBook=bookId;let sourcePlan=null,savedSources=[],studioWritten=false,savingSources=false,studioOnly=false;
 try{
  projectSaving=true;updateProjectFileUI();
  const name=`${safeName(figures[0].name)}${figures.length>1?`_and_${figures.length}_figures`:''}.figurestudio`;
  // The picker must be invoked while this trusted click still has activation.
  const target=await projectFiles.prepare({bookId:capturedBook,name,saveAs});
  await transferQueue;
  if(bookId!==capturedBook)throw Error('保存先を選ぶ間にプロジェクトが変わりました。もう一度保存してください。');
  if(gesture)endGesture(null,false);finishText();
  const workspace=workspacePersistence();
  if(!saveAs&&saveSourceOption.checked&&workspace){
   savingSources=true;sourcePlan=await workspace.prepareSourceProjectSaves({status:toast});
   if(bookId!==capturedBook)throw Error('保存準備中にStudioのプロジェクトが変わりました。');
   if(sourcePlan)savedSources=await sourcePlan.write();else studioOnly=true;
  }
  const capturedRevision=revision,packaged=packageProject();
  const captured=workspace?await workspace.captureWorkspace():null;
  if(bookId!==capturedBook||revision!==capturedRevision)throw Error('保存中にFigureの内容が変わりました。もう一度保存してください。');
  if(captured)packaged.workspace=captured.data;
  toast('保存データを準備しています…');
  const blob=encodeProjectFile(packaged);
  toast('プロジェクトをファイルに書き込んでいます…');
  const saved=await projectFiles.write(target,{revision:capturedRevision,blob});studioWritten=true;
  try{await saveProjectFileTarget(saved.bookId,{handle:saved.handle,name:saved.name});}catch{}
  const editorsUnchanged=captured?await workspace.markWorkspaceSaved(captured):true;
  if(bookId===saved.bookId)preservedWorkspace=packaged.workspace??null;
  if(bookId===saved.bookId&&revision===saved.revision&&!editingId&&!gesture&&editorsUnchanged){dirty=false;manualSavedRevision=saved.revision;toast(`${saved.name} に${captured?'3タブの最新状態と未反映の編集':'配置・画像・元プロジェクト'}を保存しました${savedSources.length?`。元プロジェクトも保存済み：${savedSources.map(item=>item.name).join('、')}`:studioOnly?'。元ファイルの保存は保留しました':''}`);}
  else{if(bookId===saved.bookId)dirty=true;toast(`${saved.name} を保存しました。保存開始後の編集は次の保存で反映されます`);}
 }catch(error){toast(studioWritten?`Studioのファイルは保存しましたが、保存後の処理を完了できませんでした：${error.message}`:sourceSaveMessage(error,savedSources));}
 finally{sourcePlan?.cancel();projectSaving=false;updateProjectFileUI();const shell=savingSources?document.defaultView?.parent?.document:null;if(!editingId&&!gesture&&(document.activeElement?.closest('#projectSaveControls')||savingSources&&shell&&shell.activeElement===shell.body))svg.focus();}
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
    if(app==='plot'){
     const state=decoded.editors.plot.state,identity=await readPlotIdentity(baseline);
     const currentProjectId=state?.sourceData?.figureStudioProjectId;
     const image=resolvePlotImage(identity,binding.imageId||panel.source.imageId||identity.activeImageId);
     const sameProject=currentProjectId===identity.projectId||state?.sourceData?.figureStudioLegacyProjectId===identity.projectId&&state.sourceData.figureStudioProjectFileName?.normalize('NFC')===panel.source.name?.normalize('NFC');
     if(!currentProjectId||!sameProject||!image||currentPlotImageId(state,image.sheetIndex)!==image.imageId)break;
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
  if(panel){const session=editSource(panel,{figureId:figure.id,lookupOriginal:false});if(!(await session.ready).connected)throw Error('復元した編集画面へ接続できませんでした。');}
 }
}
async function readProject(file,handle=null,{recovery=false}={}){
 let plan=null,previous=null,previousBindings=null;
 try{
  if(!recovery&&window.FigureAppRelease){
   if(projectVersionChecking)return false;projectVersionChecking=true;
   try{if(!await window.FigureAppRelease.ensureCurrent({file,handle}))return false;}
   finally{projectVersionChecking=false;}
  }
  toast('プロジェクトのデータを読み込んでいます…');
  const {project:raw,assets:assetRecords}=await readProjectFile(file);
  const next=raw.format==='figure-studio-book'?validateBook(raw):{format:'figure-studio-book',version:1,id:uid(),activeId:raw.id,figures:[validateDocument(raw)]};
  toast('プロジェクトの画像を復元しています…');
  const loaded=new Map(),imageIds=new Set(next.figures.flatMap(f=>f.objects.filter(o=>o.type==='image').map(o=>o.assetId)));
  for await(const [id,a] of assetRecords){
   if(typeof a?.dataUrl!=='string'||!a.dataUrl.startsWith('data:'))throw Error('素材データが不正です。');
   if(imageIds.has(id)){const restored=await imageAsset(dataURLToBlob(a.dataUrl),a.name);loaded.set(id,{...restored,id});}else loaded.set(id,{...a,id});
  }
  for(const o of next.figures.flatMap(f=>f.objects))if(o.assetId&&!loaded.has(o.assetId)||o.source?.assetId&&!loaded.has(o.source.assetId))throw Error('必要な素材がありません。');
  const workspace=workspacePersistence(),hasEditorChanges=workspace?await workspace.hasWorkspaceChanges():false;
  if(gesture)endGesture(null,true);finishText();
  if(!recovery&&(dirty||pathDrawing?.drawing||hasEditorChanges)&&!confirm('現在の作業内容を閉じて、選択したプロジェクトを開きますか？'))return;
  if(workspace){toast('PlotLauncher／MiFiToの作業状態を復元しています…');plan=await workspace.prepareWorkspaceRestore(raw.workspace??null);}
  else if(raw.workspace)await decodeWorkspaceState(raw.workspace);
  const bindings=plan?await savedEditorBindings(plan.decoded,next,loaded):null;
  previous={book:snapshot(),assets,selection:[...selection],groupScope,dirty,revision,manualSavedRevision,preservedWorkspace,past:history.past,future:history.future};
  if(plan){previousBindings=await savedEditorBindings({editors:plan.previousEditors},previous.book,previous.assets);await plan.apply();}
  closeSourceSessions();
  resetSourcePrefetch();
  pendingWorkFolderFile={bookId:next.id,handle};
  restoreBook(next);renumberFigureNames(figures);assets=loaded;preservedWorkspace=raw.workspace??null;previewQuality.clear();history.reset();selection=[];dirty=false;revision++;manualSavedRevision=revision;render();fit();
  if(plan){
   await plan.bind(bindings);
   await connectSavedEditors(bindings);
   await plan.complete();
  }
  projectFiles.opened(bookId,{handle,name:file.name});pendingWorkFolderFile=null;const openedBook=bookId;
  updateProjectWorkFolderUI();scheduleSave();try{await saveProjectFileTarget(openedBook,{handle,name:file.name});}catch{}
  toast(raw.workspace?'3タブの最新状態と未反映の編集を復元しました':'プロジェクトを開きました');
  return true;
 }catch(error){
  if(previous){closeSourceSessions();pendingWorkFolderFile=null;resetSourcePrefetch();}
  if(previous){restoreBook(previous.book);assets=previous.assets;selection=previous.selection;groupScope=previous.groupScope;dirty=previous.dirty;revision=previous.revision;manualSavedRevision=previous.manualSavedRevision;preservedWorkspace=previous.preservedWorkspace;history.past=previous.past;history.future=previous.future;render();}
  try{await plan?.cancel();if(previousBindings)await connectSavedEditors(previousBindings);}catch(rollbackError){toast(rollbackError.message);return;}
  if(recovery)throw error;
  toast(`開けませんでした: ${error.message}`);
 }
}

$('#projectInput').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file||projectSaving||projectOpening||updateReloading)return;projectOpening=true;updateProjectFileUI();try{await readProject(file);}finally{projectOpening=false;updateProjectFileUI();}});
async function pickSourceProject(panel){
 if(typeof window.showOpenFilePicker!=='function'){ $('#sourceInput').click();return; }
 const owner={book:bookId,figure:doc.id,panel,previousSource:panel.source};
 try{
  const startIn=projectFiles.target(bookId)?.handle;
  const [handle]=await window.showOpenFilePicker({id:'figure-studio-source',types:[{description:'PlotLauncher／MiFiToプロジェクト',accept:{'application/octet-stream':['.plotproject','.mifito']}}],...(startIn?{startIn}:{})});
  if(handle)await attachSourceProject(await handle.getFile(),owner,handle);
 }catch(error){if(error.name!=='AbortError')toast(error.message);}
}
async function attachSourceProject(file,{book,figure,panel,previousSource},handle=null){
 if(file.size>280*1024*1024)throw Error('元プロジェクトは280 MB以内です。');
 if(!/\.(?:plotproject|mifito)$/i.test(file.name))throw Error('.plotproject または .mifito を選択してください。');
 const app=/\.mifito$/i.test(file.name)?'mifito':'plot',id=uid();
 const asset={id,name:file.name,mime:'application/octet-stream',dataUrl:await blobToDataURL(file)};
 let remembered=false;
 if(handle){
  const identity=app==='plot'?await openedPlotIdentity(await readPlotIdentity(file),file.name):await readMifitoIdentity(file);
  const result=await createProjectFileLinks({app}).opened({file,projectId:identity.projectId,handle,sourceKey:sourceEditKey(book,figure,panel.id,id)});
  remembered=result.remembered;
 }
 if(bookId!==book||doc.id!==figure||!doc.objects.includes(panel)||panel.source!==previousSource)return;
 assets.set(id,asset);change(()=>panel.source={app,name:file.name,assetId:id});
 toast(remembered?'元プロジェクトを関連付け、このブラウザに保存先を記憶しました':'元プロジェクトを関連付けました');
}
$('#sourceInput').addEventListener('change',async event=>{
 const file=event.target.files[0],panel=selected()[0];event.target.value='';
 if(!file||panel?.type!=='image')return;
 try{await attachSourceProject(file,{book:bookId,figure:doc.id,panel,previousSource:panel.source});}catch(error){toast(error.message);}
});
function sourceEditKey(book,figure,panel,sourceAsset){return [book,figure,panel,sourceAsset].join('/');}
const mifitoIdentities=new Map(),plotIdentities=new Map();
function sourceIdentity(asset,app){
 if(app==='mifito')return mifitoIdentity(asset);
 if(!asset)return Promise.reject(Error('元のPlotLauncherプロジェクトがありません。'));
 if(!plotIdentities.has(asset.id))plotIdentities.set(asset.id,readPlotIdentity(dataURLToBlob(asset.dataUrl)));
 return plotIdentities.get(asset.id);
}
function mifitoIdentity(asset){
 if(!asset) return Promise.reject(Error('元のMiFiToプロジェクトがありません。'));
 if(!mifitoIdentities.has(asset.id))mifitoIdentities.set(asset.id,readMifitoIdentity(dataURLToBlob(asset.dataUrl)));
 return mifitoIdentities.get(asset.id);
}
function syncSummary(summary){return summary.updated||summary.added?`${summary.updated}枚を更新、${summary.added}枚を追加、${summary.unchanged}枚は変更なし`:`変更はありません（${summary.unchanged}枚をスキップ）`;}
async function syncMiFiToFigures(result,{app='mifito',guard,anchorPanelId,targetFigureId=doc.id,transferId}={}){
 if(updateReloading)throw Error('Figure Studioの更新後にもう一度反映してください。');
 const expectedBook=bookId,check=()=>{if(bookId!==expectedBook||!figures.some(f=>f.id===targetFigureId))throw Error('受け取り先のFigureが変わりました。対象の図を開き直してください。');guard?.();};
 check();const anchor=guard?.(),identity=await (app==='plot'?readPlotIdentity(result.project):readMifitoIdentity(result.project));
 let incoming=result.batch||{projectId:result.image?.projectId,images:[{...result.image,preview:result.preview}]};
 if(app==='plot')incoming={...incoming,images:incoming.images.map(image=>({...image,imageId:resolvePlotImage(identity,image.imageId)?.imageId||image.imageId}))};
 if(incoming.projectId!==identity.projectId)throw Error('画像と元プロジェクトの対応情報が一致しません。');
 const definitions=new Map(identity.images.map(image=>[image.imageId,image]));
 for(const image of incoming.images){const defined=definitions.get(image.imageId);if(!defined||defined.fingerprint!==image.fingerprint)throw Error('画像と元アプリの編集設定が一致しません。もう一度反映してください。');}
 // Retrying an addition after a lost receipt must not place another copy.
 if(result.intent==='add'&&transferId){syncFigure();const existing=figures.flatMap(f=>f.objects).filter(o=>o.source?.app===app&&o.source.transferId===transferId);if(existing.length){const summary={updated:0,added:0,unchanged:new Set(existing.map(o=>o.source.imageId)).size};return {summary,message:'この図はすでにStudioへ追加されています。'};}}
 if(anchor){const origin=await sourceIdentity(assets.get(anchor.source.assetId),app);if(origin.projectId!==identity.projectId&&!(app==='plot'&&origin.projectId===identity.legacyProjectId&&anchor.source.name?.normalize('NFC')===identity.projectFileName?.normalize('NFC')))throw Error('別の元プロジェクトが開いています。元のプロジェクトを開き直してください。');}
 check();syncFigure();const identityByAsset=new Map();
 const legacyIds=new Set(figures.flatMap(f=>f.objects.filter(o=>o.source?.app===app&&(!o.source.projectId||!o.source.imageId||app==='plot'&&/^plot-sheet-\d{6}$/.test(o.source.imageId))).map(o=>o.source.assetId)));
 for(const id of legacyIds){try{identityByAsset.set(id,await sourceIdentity(assets.get(id),app));}catch{/* Unrelated old attachments remain untouched. */}}
 check();let plan=planMiFiToSync(figures,incoming,identityByAsset,{anchorPanelId,app,addOnly:result.intent==='add',legacyProjectId:identity.legacyProjectId,projectFileName:identity.projectFileName});
 const prepared=new Map(),needed=new Set([...plan.matches.filter(m=>m.changed).map(m=>m.imageId),...plan.additions.map(m=>m.imageId)]);
 for(const image of incoming.images)if(needed.has(image.imageId))prepared.set(image.imageId,await imageAsset(image.preview,image.name));
 check();if(gesture)endGesture(null,true);finishText();syncFigure();
 // Re-plan after decoding so deleted/relinked images are never overwritten and
 // changes made to placement during decoding are kept.
 plan=planMiFiToSync(figures,incoming,identityByAsset,{anchorPanelId,app,addOnly:result.intent==='add',legacyProjectId:identity.legacyProjectId,projectFileName:identity.projectFileName});
 for(const id of [...plan.matches.filter(m=>m.changed).map(m=>m.imageId),...plan.additions.map(m=>m.imageId)])if(!prepared.has(id))throw Error('反映中に画像の対応が変わりました。もう一度反映してください。');
 const previousSizes=new Map(),sizeCorrections=new Map();
 for(const match of plan.matches.filter(m=>m.changed||app==='mifito'&&m.image.fingerprint===m.fingerprint)){
  const panel=figures.find(f=>f.id===match.figureId)?.objects.find(o=>o.id===match.panelId);
  if(panel&&!previousSizes.has(panel.assetId)){
   const asset=assets.get(panel.assetId),[physical,body]=await Promise.all([imagePhysicalSize(asset),imageMiFiToBodySize(asset)]);
   previousSizes.set(panel.assetId,{physical,body});
  }
  if(panel&&app==='mifito'&&!match.changed){const previous=previousSizes.get(panel.assetId),correction=miFiToSizeCorrection(panel,previous.physical,previous.body);if(correction)sizeCorrections.set(panel.id,correction);}
 }
 check();
 const needsIdentity=plan.linked.some(link=>{const panel=figures.find(f=>f.id===link.figureId)?.objects.find(o=>o.id===link.panelId);return !panel?.source?.projectId||!panel.source.imageId||!panel.source.fingerprint||panel.source.projectId!==link.projectId||panel.source.imageId!==link.imageId;});
 const response=()=>{
  const panel=figures.find(f=>f.id===targetFigureId)?.objects.find(o=>o.id===anchorPanelId),link=plan.linked.find(m=>m.panelId===anchorPanelId);
  const anchorImageId=panel?.source?.imageId||link?.imageId;
  const updated=new Set(plan.matches.filter(match=>match.changed||sizeCorrections.has(match.panelId)).map(match=>match.imageId)),summary={...plan.summary,updated:updated.size,unchanged:new Set(plan.matches.map(match=>match.imageId)).size-updated.size};
  return {summary,message:syncSummary(summary),anchorSourceAssetId:panel?.source?.assetId,anchorImageId,detached:!!anchorImageId&&!definitions.has(anchorImageId)};
 };
 if(!plan.summary.updated&&!plan.summary.added&&!needsIdentity&&!sizeCorrections.size){const done=response();toast(done.message);return done;}
 const name=String(result.sourceName||(app==='plot'?'figure.plotproject':'figure.mifito')).replace(/[\\/]/g,'_').slice(0,255);
 const project={id:uid(),name,mime:result.project.type||'application/octet-stream',dataUrl:await blobToDataURL(result.project)};
 check();syncFigure();
 // Source associations must still be the ones used to prepare this atomic edit.
 for(const link of plan.linked){const panel=figures.find(f=>f.id===link.figureId)?.objects.find(o=>o.id===link.panelId);if(panel?.source?.assetId!==link.sourceAssetId)throw Error('反映中に元プロジェクトの関連付けが変わりました。もう一度反映してください。');}
 plan=planMiFiToSync(figures,incoming,identityByAsset,{anchorPanelId,app,addOnly:result.intent==='add',legacyProjectId:identity.legacyProjectId,projectFileName:identity.projectFileName});
 for(const id of [...plan.matches.filter(m=>m.changed).map(m=>m.imageId),...plan.additions.map(m=>m.imageId)])if(!prepared.has(id))throw Error('反映中に画像の対応が変わりました。もう一度反映してください。');
 const incomingById=new Map(incoming.images.map(image=>[image.imageId,image]));
 const linked=new Map(plan.linked.filter(link=>{const image=incomingById.get(link.imageId);return definitions.has(link.imageId)&&!(image?.unchanged===true&&image.fingerprint!==link.fingerprint);}).map(link=>[link.panelId,link]));
 const changed=new Map(plan.matches.filter(m=>m.changed).map(m=>[m.panelId,m]));
 const next=figures.map(f=>({...f,objects:f.objects.map(o=>{
  const link=linked.get(o.id);if(!link)return o;const update=changed.get(o.id);
  let replacement=sizeCorrections.get(o.id)||{};
  if(update){
   const asset=prepared.get(update.imageId),previous=previousSizes.get(o.assetId);
   if(!previous)throw Error('反映中に画像が置き換わりました。もう一度反映してください。');
   replacement={assetId:asset.id,...(app==='plot'?replacedImageSize('plot',o,previous.physical,asset.physicalSize):replacedMiFiToImageSize(o,previous.physical,asset.physicalSize,previous.body,asset.mifitoBodySize))};
  }
  return {...o,...replacement,source:{...o.source,app,name,assetId:project.id,projectId:identity.projectId,imageId:link.imageId,fingerprint:update?update.image.fingerprint:link.fingerprint}};
 })}));
 const destination=next.find(f=>f.id===targetFigureId),added=[];
 if(initialDemo&&revision===0&&!guard){destination.objects=[];destination.name='Fig. 1';}
 for(const image of plan.additions){const asset=prepared.get(image.imageId),size=importedImageSize(asset,destination,app),offset=(destination.objects.filter(o=>o.type==='image').length%6)*mm(4);
  const panel=makeObject('image',{...imageInsertionPoint(destination,size,offset),...size,assetId:asset.id,name:image.name,source:{app,name,assetId:project.id,projectId:identity.projectId,imageId:image.imageId,fingerprint:image.fingerprint,...(transferId?{transferId}: {})}});
  destination.objects.push(panel);added.push(panel.id);
 }
 const newAssets=new Map([...prepared.values()].map(a=>[a.id,a]));newAssets.set(project.id,project);
 check();const before=snapshot(),activeId=doc.id;for(const[id,asset]of newAssets)assets.set(id,asset);
 figures=next;doc=figures.find(f=>f.id===activeId);if(initialDemo&&revision===0&&!guard)initialDemo=false;
 if(doc.id===targetFigureId&&added.length)selection=added;record(before);(app==='plot'?plotIdentities:mifitoIdentities).set(project.id,Promise.resolve(identity));
 const done=response();
 try{const rev=revision;await saveDraft(snapshot(),assets);if(revision===rev)$('#saveStatus').textContent='ブラウザに保存済み';toast(done.message);}
 catch{toast(done.message+'。自動保存できないためCtrl+Sで保存してください。');}
 return done;
}
function editSource(o,{figureId=doc.id,lookupOriginal=true}={}){
 const documentId=figureId,editingBook=bookId,panelId=o.id,app=o.source?.app;
 let expectedSourceAsset=o.source?.assetId;
 const asset=assets.get(expectedSourceAsset);if(!asset){toast('元プロジェクトを関連付けてください');return;}
 const editKey=sourceEditKey(editingBook,documentId,panelId,expectedSourceAsset);
 if(lookupOriginal)sourcePrefetch.openSource(editKey,o.source);
 const locate=()=>{
  if(bookId!==editingBook)throw Error('別のプロジェクトが開いています。元のFigureプロジェクトへ戻ってから編集を開き直してください。');
  syncFigure();const figure=figures.find(f=>f.id===documentId),target=figure?.objects.find(v=>v.id===panelId);
  if(!target)throw Error('編集対象のパネルがありません。');
  if(target.source?.assetId!==expectedSourceAsset||target.source?.app!==app)throw Error('元プロジェクトの関連付けが変更されています。対象の図を開き直してください。');
  return target;
 };
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 bridge=openSource({app,project:dataURLToBlob(asset.dataUrl),sourceName:o.source.name,panelId,imageId:o.source.imageId,
  editKey,
  url:local?new URL(new URL(SOURCE_APPS[app].url).pathname,location.href).href:undefined,
  onStatus:({state,message,downloadProject,openInNewTab})=>{toast(message);if(['unavailable','blocked','error'].includes(state)){const box=$('#sourceSummary');box.textContent=message;if(downloadProject){const b=document.createElement('button');b.type='button';b.textContent='元プロジェクトを保存';b.onclick=downloadProject;box.append(b);}if(openInNewTab){const b=document.createElement('button');b.type='button';b.textContent='新しい編集タブで開く';b.onclick=()=>{bridge=openInNewTab();};box.append(b);}}},
  onResult:async result=>{
   try{
    if((result.batch||result.image)){
     const done=await syncMiFiToFigures(result,{app,guard:locate,anchorPanelId:panelId,targetFigureId:documentId});
     expectedSourceAsset=done.anchorSourceAssetId||expectedSourceAsset;
     return {editKey:sourceEditKey(editingBook,documentId,panelId,expectedSourceAsset)+(done.detached?'/detached':''),imageId:done.anchorImageId,message:done.message,summary:done.summary};
    }
    const original=locate(),previousSize=app==='plot'?await imagePhysicalSize(assets.get(original.assetId)):null,image=await imageAsset(result.preview,original.name),project={id:uid(),name:result.sourceName,mime:'application/octet-stream',dataUrl:await blobToDataURL(result.project)};
    locate();if(gesture)endGesture(null,true);finishText();const target=locate(),before=snapshot();
    Object.assign(target,app==='mifito'?replacedMiFiToImageSize(target,null,image.physicalSize,null,image.mifitoBodySize):replacedImageSize(app,target,previousSize,image.physicalSize));
    assets.set(image.id,image);assets.set(project.id,project);target.assetId=image.id;target.source={...target.source,app:result.app,name:result.sourceName,assetId:project.id};
    expectedSourceAsset=project.id;record(before);toast('元アプリの編集結果を反映しました');
    return {editKey:sourceEditKey(editingBook,documentId,panelId,expectedSourceAsset)};
   }catch(error){toast('反映できませんでした: '+error.message);throw error;}
  }
 });
 return bridge;
}

function buildExport({office=false}={}){finishText();const out=el('svg',{xmlns:ns,width:`${toMM(doc.width)}mm`,height:`${toMM(doc.height)}mm`,viewBox:`0 0 ${doc.width} ${doc.height}`});for(const o of doc.objects){const g=el('g');drawContent(o,g,true);g.removeAttribute('data-id');g.removeAttribute('style');out.append(g);}return office?serializeOfficeSVG(out):new XMLSerializer().serializeToString(out);}
function validateBook(raw){if(raw.format!=='figure-studio-book'||raw.version!==1||!Array.isArray(raw.figures)||!raw.figures.length||raw.figures.length>100)throw Error('Figureの構成が不正です（最大100枚）。');const ids=new Set();const figs=raw.figures.map(f=>{const d=validateDocument(f);if(typeof d.id!=='string'||ids.has(d.id))throw Error('Figure IDが不正です。');ids.add(d.id);return d;});return {format:'figure-studio-book',version:1,id:typeof raw.id==='string'?raw.id:uid(),activeId:ids.has(raw.activeId)?raw.activeId:figs[0].id,figures:figs};}
function safeName(s){return s.replace(/[\\/:*?"<>|]/g,'_').slice(0,120)||'Figure';}
async function prepareFigureExport(){finishText();const figureId=doc.id;for(let attempt=0;attempt<3;attempt++){const keys=doc.objects.filter(o=>o.type==='text').map(o=>texRenderer.key(o)).join('\n');await texRenderer.prepare(doc.objects);if(doc.id!==figureId)throw Error('Figureが切り替わりました。書き出すFigureでもう一度実行してください。');if(keys===doc.objects.filter(o=>o.type==='text').map(o=>texRenderer.key(o)).join('\n'))return;}throw Error('文字の編集中です。確定してからもう一度書き出してください。');}
async function exportSVG(){try{await prepareFigureExport();download(new Blob([buildExport({office:true})],{type:'image/svg+xml'}),`${safeName(doc.name)}.svg`);toast('SVGを保存しました（透明背景・PowerPoint対応・ベクター）');}catch(error){toast(error.message);}}
function withPNGResolution(blob,dpi){return preparePNG(blob,dpi);}
async function exportPNG(){
 let canvas,url;
 try{
  await prepareFigureExport();
  const dpi=Number($('#exportDpi').value),w=Math.round(doc.width/72*dpi),h=Math.round(doc.height/72*dpi),name=safeName(doc.name);
  if(w*h>100000000||w>16384||h>16384)throw Error('出力が大きすぎます。DPIまたは用紙サイズを下げてください。');
  toast('PNGを書き出しています…');
  url=URL.createObjectURL(new Blob([buildExport()],{type:'image/svg+xml'}));
  const img=new Image();img.src=url;await img.decode();
  canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNGの生成に失敗しました');
  canvas.width=canvas.height=1;
  toast('PNGを圧縮しています（画質維持）…');
  const output=await withPNGResolution(blob,dpi);
  download(output,`${name}_${dpi}dpi.png`);
  toast(`${w} × ${h} px・${dpi} dpi・透明背景・${(output.size/1000000).toFixed(1)} MBで保存しました`);
 }catch(error){toast(error.message);}
 finally{if(canvas)canvas.width=canvas.height=1;if(url)URL.revokeObjectURL(url);}
}
async function exportPDF(){const win=window.open('','figure-studio-print');if(!win){toast('PDF保存用の別タブを許可してください');return;}try{await prepareFigureExport();const s=buildExport();win.document.open();win.document.write(`<!doctype html><html><head><title>Figure PDF</title><style>@page{size:${toMM(doc.width)}mm ${toMM(doc.height)}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${toMM(doc.width)}mm;height:${toMM(doc.height)}mm}@media screen{body{background:#ddd;padding:20px}svg{background:white}}</style></head><body>${s}</body></html>`);win.document.close();Promise.all([win.document.fonts.ready,...[...win.document.querySelectorAll('svg image')].map(i=>{const image=new win.Image();image.src=i.getAttribute('href');return image.decode();})]).then(()=>win.print()).catch(()=>toast('画像の読み込みが完了しませんでした。SVG保存をお使いください'));toast('印刷画面で「PDFに保存」、倍率100%、余白なしを選んでください');}catch(error){win.close();toast(error.message);}}

svg.addEventListener('contextmenu',e=>{e.preventDefault();finishText();const id=e.target.closest('[data-id]')?.dataset.id;if(id&&!selection.includes(id)){const target=doc.objects.find(object=>object.id===id);setSelection([id],{scope:target?.groupId===groupScope?groupScope:null});}const menu=$('#contextMenu');menu.replaceChildren();for(const[label,action,key]of [...(doc.objects.find(object=>object.id===id)?.groupId?[['グループ内を個別選択','select-member','Ctrl / ⌘＋クリック']]:[]),...(groupScope?[['グループ全体へ戻る','select-group','Esc']]:[]),['複製','duplicate','Ctrl+D'],['最前面へ','front','Alt → 3'],['最背面へ','back','Alt → 4'],['一段前へ','forward',''],['一段後ろへ','backward',''],['左揃え','align-left','Alt → 5 → L'],['グループ化','group','Ctrl+G'],['グループ解除（1階層）','ungroup','Ctrl+Shift+G'],['全グループ解除','ungroup-all','Ctrl+Shift+A → G'],['固定 / 解除','lock',''],['元アプリで編集','edit-source',''],['削除','delete','Delete']]){const b=document.createElement('button');b.type='button';b.textContent=label;const k=document.createElement('kbd');k.textContent=shortcutLabel(key);b.append(k);b.onclick=()=>{menu.hidden=true;execute(action,{id});svg.focus();};menu.append(b);}menu.hidden=false;menu.style.left=`${Math.min(e.clientX,innerWidth-250)}px`;menu.style.top=`${Math.min(e.clientY,innerHeight-450)}px`;});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#contextMenu'))$('#contextMenu').hidden=true;for(const d of $$('details:not(.sidebar-text-panel)[open]'))if(!d.contains(e.target))d.open=false;});
window.addEventListener('beforeunload',e=>{if(!updateReloading&&(projectSaving||dirty||pathDrawing?.drawing||(editingId&&textBefore&&JSON.stringify(snapshot())!==JSON.stringify(textBefore)))){e.preventDefault();e.returnValue='';}});
window.addEventListener('resize',()=>{if(!gesture)renderOverlay();});
// Ordinary launches/reloads start empty; explicit update sessions restore below.
doc.name='Fig. 1';$('#saveStatus').textContent='新規プロジェクト';
if(isLegacyStudioUpdate(STUDIO_RELEASE.build))try{
 const restored=await loadDraft();if(!restored)throw Error('一時保存が見つかりません。');
 if(restored){if(restored.doc.format==='figure-studio-book')restoreBook(validateBook(restored.doc));else{doc=validateDocument(restored.doc);figures=[doc];}assets=restored.assets;dirty=true;$('#saveStatus').textContent='更新前の作業を復元';}
 finishLegacyStudioUpdate();
}catch(error){toast('更新前の作業を復元できませんでした。再読み込みで再試行できます。'+error.message);}
try{const target=await loadProjectFileTarget(bookId);if(target)projectFiles.opened(bookId,target);}catch{}
renumberFigureNames(figures);render();fit();setTool('select');
const workspaceReceiver=setupTransferReceiver({onImport:receiveDirectFigure,allowAdd:true,onStatus:({state,message})=>{if(state==='error')toast(message);}});
window.FigureStudioWorkspaceReceiverId=workspaceReceiver.receiverId;
window.FigureStudioWorkspaceUpdate={
 release:STUDIO_RELEASE,
 setUpdateReloading(value){updateReloading=!!value;},
 async capture(){
  if(updateReloading||projectSaving||projectOpening&&!projectVersionChecking)throw Error('Studioの保存・読み込みが完了してから更新してください。');
  if(pathDrawing?.drawing&&!pathDrawing.finish())throw Error('作図中の線を確定するか、Escで取り消してください。');
  if(!commitFocusedProperty())throw Error('入力中の数値を確定してください。');
  updateReloading=true;
  try{
   await transferQueue;if(gesture)endGesture(null,false);finishText();
   const capturedRevision=revision,capturedBook=bookId,project=packageProject(),workspace=workspacePersistence(),captured=workspace?await workspace.captureWorkspace():null;
   if(captured)project.workspace=captured.data;
   // Undo may refer to deleted images, so recovery also retains those assets.
   for(const[id,asset]of assets){const {previewUrl,persisted,...saved}=asset;project.assets[id]=saved;}
   if(bookId!==capturedBook||revision!==capturedRevision)throw Error('保存中にFigureの内容が変わりました。もう一度更新してください。');
   const projectFile=encodeProjectFile(project);
   return {projectFile,active:project.workspace?.active||'studio',name:projectFiles.target(bookId)?.name||`${safeName(figures[0].name)}.figurestudio`,local:{dirty,revision,manualSavedRevision,selection:[...selection],groupScope,past:clone(history.past),future:clone(history.future),scale,scroll:{left:viewport.scrollLeft,top:viewport.scrollTop},target:projectFiles.target(bookId)||null}};
  }catch(error){updateReloading=false;throw error;}
 },
 async restore(saved){
  const local=saved?.local;if((!saved?.projectFile&&!saved?.project)||!local||typeof local.dirty!=='boolean'||!Number.isSafeInteger(local.revision)||local.revision<0||!Number.isSafeInteger(local.manualSavedRevision)||!Array.isArray(local.selection)||!Array.isArray(local.past)||!Array.isArray(local.future))throw Error('Studioの更新前の状態が正しくありません。');
  const past=local.past.map(validateBook),future=local.future.map(validateBook);
  const blob=saved.projectFile??encodeProjectFile(saved.project);
  const file=new File([blob],saved.name||'recovered.figurestudio',{type:blob.type});
  if(!await readProject(file,local.target?.handle||null,{recovery:true}))throw Error('Studioのプロジェクトを復元できませんでした。');
  history.past=past;history.future=future;dirty=local.dirty;revision=local.revision;manualSavedRevision=local.manualSavedRevision;
  selection=local.selection.filter(id=>doc.objects.some(o=>o.id===id));groupScope=doc.objects.some(o=>o.groupId===local.groupScope)?local.groupScope:null;
  if(Number.isFinite(local.scale)&&local.scale>0&&local.scale<=30)scale=local.scale;
  render();viewport.scrollLeft=Number(local.scroll?.left)||0;viewport.scrollTop=Number(local.scroll?.top)||0;updateProjectFileUI();
 },
 cancel(){updateReloading=false;}
};
const integratedWorkspace=getFigureWorkspace(window);
let standaloneUpdater=null;
if(integratedWorkspace)installWorkspaceUpdater(integratedWorkspace,{windowRef:window.parent,documentRef:window.parent.document});
else standaloneUpdater=setupUpdateCheck({onStatus:toast,beforeReload:async()=>{
 try{const saved=await window.FigureStudioWorkspaceUpdate.capture();return {resumeToken:await stageStudioUpdate(saved)};}
 catch(error){window.FigureStudioWorkspaceUpdate.cancel();throw error;}
}});
window.FigureStudioWorkspaceSave=async()=>{
 if(pathDrawing?.drawing&&!pathDrawing.finish())throw Error('作図中の線を確定するか、Escで取り消してください。');
 if(!commitFocusedProperty())throw Error('入力中の数値を確定してください。');
 if(projectSaving||projectOpening)throw Error('プロジェクトの保存・読み込みが完了してから更新してください。');
 await transferQueue;
 if(projectSaving||projectOpening)throw Error('プロジェクトの保存・読み込みが完了してから更新してください。');
 if(gesture)endGesture(null,false);finishText();syncFigure();
 const saved={bookId,revision};clearTimeout(saveTimer);
 await saveDraft(snapshot(),assets);
 if(bookId!==saved.bookId||revision!==saved.revision||projectSaving||projectOpening||editingId||gesture)throw Error('保存中に変更がありました。もう一度「更新する」を押してください。');
 return true;
};

window.FigureAppRelease?.configure({
 ready:()=>!projectSaving&&!projectOpening&&!startupRestoring,
 update:(target,pendingToken)=>standaloneUpdater?.forceUpdate(target,pendingToken),
 open:record=>readProject(record.file,record.handle,record.options),
 error:error=>toast(error.message)
});
if(!integratedWorkspace){
 const resumeRoot=$('.app-shell'),wasInert=resumeRoot.inert;startupRestoring=new URL(location.href).searchParams.has('_studioResume');if(startupRestoring)resumeRoot.inert=true;
 try{await restoreStudioUpdate({restore:saved=>window.FigureStudioWorkspaceUpdate.restore(saved)});}catch(error){toast('更新前の作業を復元できませんでした。再読み込みで再試行できます。'+error.message);}
 finally{startupRestoring=false;resumeRoot.inert=wasInert;}
 void window.FigureAppRelease?.resumePending().catch(error=>toast(error.message));
}
