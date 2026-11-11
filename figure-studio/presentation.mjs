/** A read-only viewer: navigation never changes the editor's active Figure. */
export function createPresentation({root,editorRoot,getSlides,getCurrentId,renderSlide,beforeStart=()=>true,onActiveChange=()=>{},onAfterExit=()=>{},onError=()=>{},windowRef=window,documentRef=document}){
 const stage=root.querySelector('[data-presentation-stage]'),status=root.querySelector('[data-presentation-status]'),counter=root.querySelector('[data-presentation-counter]');
 const previous=root.querySelector('[data-presentation-previous]'),next=root.querySelector('[data-presentation-next]'),close=root.querySelector('[data-presentation-close]'),fullscreen=root.querySelector('[data-presentation-fullscreen]');
 const controls=root.querySelector('[data-presentation-controls]'),cache=new Map();
 let active=false,index=0,displayed=-1,request=0,oldFocus=null,editorWasInert=false,hideTimer=null,nativeFullscreen=false,displayedSlide=null;

 function layout(){
  if(!active||!displayedSlide||!stage.firstElementChild)return;
  const {width,height}=displayedSlide,ratio=Math.min(stage.clientWidth/width,stage.clientHeight/height),svg=stage.firstElementChild;
  svg.style.width=`${width*ratio}px`;svg.style.height=`${height*ratio}px`;
 }
 function wake(){
  if(!active)return;root.dataset.idle='false';clearTimeout(hideTimer);
  hideTimer=windowRef.setTimeout(()=>{if(active&&!controls.contains(documentRef.activeElement))root.dataset.idle='true';},2800);
 }
 function syncControls(){
  const slides=getSlides(),slide=slides[index];
  counter.textContent=slide?`${index+1} / ${slides.length} · ${slide.name}`:'Figureがありません';
  previous.disabled=index<=0;next.disabled=index>=slides.length-1;
  fullscreen.hidden=!!documentRef.fullscreenElement||!root.requestFullscreen||documentRef.fullscreenEnabled===false;
 }
 async function showSlide(position){
  const slides=getSlides();if(!active||!slides.length)return;
  const target=Math.max(0,Math.min(slides.length-1,position));if(target===index&&displayed===index){wake();return;}
  index=target;const slide=slides[index],token=++request,key=`${slide.version}:${slide.id}`;
  syncControls();wake();status.textContent='Figureを準備しています…';status.hidden=false;stage.setAttribute('aria-busy','true');
  let pending=cache.get(key);
  if(!pending){pending=Promise.resolve().then(()=>renderSlide(slide));cache.set(key,pending);}else{cache.delete(key);cache.set(key,pending);}
  while(cache.size>2)cache.delete(cache.keys().next().value);
  try{
   const svg=await pending;if(!active||token!==request)return;
   svg.setAttribute('role','img');svg.setAttribute('aria-label',slide.name);stage.replaceChildren(svg);
   displayed=index;displayedSlide=slide;layout();status.hidden=true;stage.setAttribute('aria-busy','false');
  }catch(error){
   cache.delete(key);if(!active||token!==request)return;
   if(displayed>=0)index=displayed;syncControls();stage.setAttribute('aria-busy','false');status.textContent=`表示できませんでした：${error.message}`;status.hidden=false;
  }
 }
 function requestFullscreen(){
  if(!active||!root.requestFullscreen||documentRef.fullscreenElement)return;
  try{Promise.resolve(root.requestFullscreen({navigationUI:'hide'})).then(()=>{if(!active&&documentRef.fullscreenElement===root)documentRef.exitFullscreen().catch(()=>{});else{if(documentRef.fullscreenElement===root)nativeFullscreen=true;syncControls();}}).catch(()=>{if(active){syncControls();root.focus({preventScroll:true});}});}catch{syncControls();}
 }
 function start({fromCurrent=true}={}){
  if(active)return;
  if(!getSlides().length)return;
  try{if(beforeStart()===false)return;}catch(error){onError(error);return;}
  const slides=getSlides();if(!slides.length)return;
  oldFocus=documentRef.activeElement;editorWasInert=editorRoot.inert;active=true;nativeFullscreen=false;displayed=-1;displayedSlide=null;cache.clear();stage.replaceChildren();root.hidden=false;editorRoot.inert=true;
  onActiveChange(true);root.focus({preventScroll:true});
  // Request within the click/key activation, before any asynchronous rendering.
  requestFullscreen();showSlide(fromCurrent?Math.max(0,slides.findIndex(slide=>slide.id===getCurrentId())):0);
 }
 function exit({restoreFocus=true}={}){
  if(!active)return;active=false;request++;clearTimeout(hideTimer);cache.clear();stage.replaceChildren();displayedSlide=null;root.hidden=true;editorRoot.inert=editorWasInert;onActiveChange(false);
  const returnFocus=oldFocus,finished=documentRef.fullscreenElement===root?documentRef.exitFullscreen().catch(()=>{}):Promise.resolve();
  finished.then(()=>{if(active)return;onAfterExit();if(restoreFocus&&returnFocus?.isConnected&&!returnFocus.disabled&&!returnFocus.closest('[hidden],[inert]'))returnFocus.focus({preventScroll:true});});
 }
 function keydown(event){
  if(event.isComposing||event.defaultPrevented)return;
  if(!active)return;
  event.stopImmediatePropagation();wake();
  if(event.key==='Escape'){event.preventDefault();exit();return;}
  if(event.key==='Tab'){
   event.preventDefault();const buttons=[...controls.querySelectorAll('button')].filter(button=>!button.disabled&&!button.hidden),at=buttons.indexOf(documentRef.activeElement);
   buttons[at<0?(event.shiftKey?buttons.length-1:0):(at+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus({preventScroll:true});return;
  }
  if((event.key==='Enter'||event.key===' ')&&controls.contains(event.target))return;
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const direction=['ArrowRight','ArrowDown','PageDown','Enter'].includes(event.key)||event.key===' '&&!event.shiftKey?1:['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(event.key)||event.key===' '&&event.shiftKey?-1:0;
  if(direction){event.preventDefault();showSlide(index+direction);}
  else if(event.key==='Home'||event.key==='End'){event.preventDefault();showSlide(event.key==='Home'?0:getSlides().length-1);}
  else if(event.key==='f'||event.key==='F'){event.preventDefault();requestFullscreen();}
 }
 function fullscreenChanged(){
  if(!active)return;
  if(documentRef.fullscreenElement===root)nativeFullscreen=true;
  else if(nativeFullscreen){exit();return;}
  syncControls();layout();
 }
 previous.addEventListener('click',()=>showSlide(index-1));next.addEventListener('click',()=>showSlide(index+1));close.addEventListener('click',()=>exit());fullscreen.addEventListener('click',requestFullscreen);
 controls.addEventListener('click',event=>{if(active&&event.detail>0)root.focus({preventScroll:true});});
 root.addEventListener('pointermove',wake);root.addEventListener('pointerdown',wake);root.addEventListener('focusin',wake);
 windowRef.addEventListener('keydown',keydown,true);windowRef.addEventListener('resize',layout);windowRef.addEventListener('pagehide',()=>exit({restoreFocus:false}));documentRef.addEventListener('fullscreenchange',fullscreenChanged);
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(layout):null;observer?.observe(stage);
 return {start,exit,get active(){return active;}};
}
