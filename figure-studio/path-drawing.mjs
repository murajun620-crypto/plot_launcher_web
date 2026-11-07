const TOOLS=new Set(['curve','freeform']);
const LIMITS={curve:1500,freeform:2000};
const copyPoint=point=>({x:point.x,y:point.y});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const uniqueCount=points=>new Set(points.map(point=>`${point.x},${point.y}`)).size;

/**
 * Capture world-space path vertices without changing the document or history.
 * Drafts contain fixed points and a separate previewPoint; commits never include
 * a hover point. The caller owns rendering, focus and the selected tool.
 */
export function createPathDrawing({svg,point,scale=()=>1,onDraft=()=>{},onCommit,onCancel=()=>{},onHint=()=>{}}={}){
 if(!svg?.addEventListener||typeof point!=='function'||typeof onCommit!=='function')throw new TypeError('Path drawing requires svg, point and onCommit.');
 let tool=null,points=[],previewPoint=null,interaction=null,lastDown=null,previousDown=null,limitShown=false,disposed=false;
 const active=()=>!disposed&&TOOLS.has(tool);
 const zoom=()=>{const value=Number(scale());return Number.isFinite(value)&&value>0?value:1;};
 const near=(a,b,pixels)=>!!a&&!!b&&distance(a,b)*zoom()<=pixels;
 const readPoint=(event,supplied)=>{const value=supplied??point(event);return value&&Number.isFinite(value.x)&&Number.isFinite(value.y)?copyPoint(value):null;};
 const canClose=position=>!!position&&points.length>=3&&near(position,points[0],6)&&uniqueCount(points)>=3;
 const hint=()=>onHint(active()?(tool==='curve'?'クリックで曲線の点を追加 · ダブルクリック / Enterで確定 · Escで取消':'クリックで頂点を追加 / ドラッグで手描き · ダブルクリック / Enterで確定 · Escで取消'):'');
 const consume=event=>{event?.preventDefault?.();event?.stopPropagation?.();};
 function draft(){
  onDraft(points.length?{type:tool,points:points.map(copyPoint),closed:false,previewPoint:previewPoint?copyPoint(previewPoint):null,freehand:!!interaction?.freehand,canClose:canClose(previewPoint)}:null);
 }
 function release(){
  const pointerId=interaction?.pointerId;interaction=null;
  if(pointerId!==undefined)try{if(!svg.hasPointerCapture||svg.hasPointerCapture(pointerId))svg.releasePointerCapture?.(pointerId);}catch{/* Capture may already have been released by the browser. */}
 }
 function clear(){release();points=[];previewPoint=null;lastDown=previousDown=null;limitShown=false;}
 function append(position,{sample=false}={}){
  if(points.length&&near(position,points.at(-1),sample?2:.25))return false;
  if(points.length>=LIMITS[tool]){if(!limitShown){onHint(`点は最大${LIMITS[tool]}個です。Enterで確定できます。`);limitShown=true;}return false;}
  points.push(copyPoint(position));return true;
 }
 function finish(closed=false){
  if(!active()||!points.length)return false;
  if(uniqueCount(points)<(closed?3:2)){onHint('2点以上を指定してから確定してください。');return false;}
  const result={type:tool,points:points.map(copyPoint),closed:!!closed};
  clear();draft();hint();onCommit(result);return true;
 }
 function cancel(){const hadDraft=!!points.length||!!interaction;clear();if(hadDraft){draft();onCancel();}hint();return hadDraft;}
 function pointerDown(event,supplied){
  if(!active()||event.button!==undefined&&event.button!==0||event.isPrimary===false||interaction)return false;
  const position=readPoint(event,supplied);if(!position)return false;
  consume(event);
  if(canClose(position)){finish(true);return true;}
  previousDown=lastDown;
  const added=append(position);lastDown={point:position,index:points.length-1,added};
  previewPoint=null;interaction={pointerId:event.pointerId,start:position,freehand:false};
  if(event.pointerId!==undefined)try{svg.setPointerCapture?.(event.pointerId);}catch{/* Synthetic input or a released pointer may not support capture. */}
  draft();return true;
 }
 function pointerMove(event,supplied){
  if(!active()||!points.length||interaction&&event.pointerId!==undefined&&interaction.pointerId!==event.pointerId)return false;
  const position=readPoint(event,supplied);if(!position)return false;
  consume(event);
  if(tool==='freeform'&&interaction){
   interaction.freehand ||= !near(position,interaction.start,3);
   if(interaction.freehand){append(position,{sample:true});previewPoint=null;}
  }else previewPoint=points.length<LIMITS[tool]&&!near(position,points.at(-1),.25)?position:null;
  draft();return true;
 }
 function pointerUp(event,supplied){
  if(!active()||!interaction||event.pointerId!==undefined&&interaction.pointerId!==event.pointerId)return false;
  const position=readPoint(event,supplied);consume(event);
  if(tool==='freeform'&&position)interaction.freehand ||= !near(position,interaction.start,3);
  const freehand=interaction.freehand;release();
  if(freehand){
   const closed=position&&canClose(position);
   if(closed){while(points.length>3&&near(points.at(-1),points[0],6))points.pop();}
   else if(position)append(position);
   previewPoint=null;finish(!!closed);
  }else{previewPoint=null;draft();}
  return true;
 }
 function doubleClick(event){
  if(!active()||!points.length||event.button!==undefined&&event.button!==0)return false;
  consume(event);
  // Pointerdown normally ran twice. Remove only a second click that actually
  // appended a nearby duplicate; a legitimate short preceding edge is kept.
  if(lastDown?.added&&previousDown?.added&&lastDown.index===points.length-1&&previousDown.index===lastDown.index-1&&near(lastDown.point,previousDown.point,6))points.pop();
  previewPoint=null;finish();return true;
 }
 function keydown(event){
  if(!active()||!points.length||event.defaultPrevented||event.isComposing||event.keyCode===229||event.getModifierState?.('AltGraph')||event.ctrlKey||event.metaKey||event.altKey)return;
  if(!['Enter','Escape','Backspace'].includes(event.key))return;
  consume(event);
  if(event.key==='Escape'){cancel();return;}
  if(event.key==='Enter'){finish();return;}
  release();points.pop();previewPoint=null;lastDown=previousDown=null;limitShown=false;
  if(points.length){draft();hint();}else{draft();onCancel();hint();}
 }
 function lostPointer(event){if(interaction&&event.pointerId===interaction.pointerId)cancel();}
 svg.addEventListener('keydown',keydown);svg.addEventListener('pointercancel',lostPointer);svg.addEventListener('lostpointercapture',lostPointer);
 return {
  setTool(next){if(next===tool)return active();cancel();tool=next;hint();return active();},
  pointerDown,pointerMove,pointerUp,doubleClick,finish:()=>finish(),cancel,
  get active(){return active();},get drawing(){return points.length>0;},
  close(){if(disposed)return;cancel();disposed=true;svg.removeEventListener('keydown',keydown);svg.removeEventListener('pointercancel',lostPointer);svg.removeEventListener('lostpointercapture',lostPointer);}
 };
}
