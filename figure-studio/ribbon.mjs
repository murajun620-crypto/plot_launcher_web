const PANE_PREFERENCE='figure-studio-right-sidebar';

/** Small, native-control ribbon. Editing commands remain owned by the app. */
export function createRibbon({root,documentRef=globalThis.document,storage,onResize=()=>{},onFocusCanvas}={}){
 root??=documentRef?.getElementById('studioRibbon');
 if(!root)throw Error('Figure Studioのリボンが見つかりません。');
 const view=documentRef.defaultView||globalThis;
 if(storage===undefined)try{storage=view.localStorage;}catch{storage=null;}
 const tabs=[...root.querySelectorAll('[data-ribbon-tab]')],panels=new Map([...root.querySelectorAll('[data-ribbon-panel]')].map(panel=>[panel.dataset.ribbonPanel,panel]));
 const pane=documentRef.getElementById('ribbonSelectionPane')||documentRef.getElementById('selectionPane');
 const paneButtons=[...documentRef.querySelectorAll('[data-action="toggle-selection-pane"]')];
 let activeTab=null,paneOpen=!!pane,previousFocus=null,frame=null,disposed=false;
 const details=()=>[...root.querySelectorAll('details[open]')];
 const tabFor=key=>tabs.find(tab=>tab.dataset.ribbonTab===key);
 const requestFrame=typeof view.requestAnimationFrame==='function'?callback=>view.requestAnimationFrame(callback):callback=>{callback();return null;};

 function positionMenus(){
  const width=view.innerWidth||documentRef.documentElement.clientWidth,height=view.innerHeight||documentRef.documentElement.clientHeight;
  if(!width||!height)return;
  for(const menu of details()){
   const summary=menu.querySelector('summary'),panel=menu.querySelector('.dropdown-panel');
   if(!summary||!panel)continue;
   panel.style.position='fixed';panel.style.maxWidth=`${Math.max(0,width-16)}px`;panel.style.maxHeight=`${Math.max(0,height-16)}px`;panel.style.overflowY='auto';
   const anchor=summary.getBoundingClientRect(),box=panel.getBoundingClientRect();
   const panelWidth=Math.min(box.width,width-16),panelHeight=Math.min(box.height,height-16);
   const left=Math.max(8,Math.min(anchor.left,width-panelWidth-8));
   const below=anchor.bottom+5,above=anchor.top-panelHeight-5;
   const top=Math.max(8,Math.min(below+panelHeight<=height-8?below:above>=8?above:below,height-panelHeight-8));
   panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.right='auto';panel.style.bottom='auto';
  }
 }
 function scheduleLayout(){
  if(disposed||frame!==null)return;
  frame=requestFrame(()=>{frame=null;if(!disposed){positionMenus();onResize();}});
 }
 function closeMenus(except=null){for(const menu of details())if(menu!==except)menu.open=false;}
 function show(key,{focus=false}={}){
  const tab=tabFor(key),panel=panels.get(key);
  if(disposed||!tab||!panel||tab.disabled||tab.hidden)return false;
  const previousPanel=panels.get(activeTab),movingFocus=!!previousPanel&&previousPanel!==panel&&previousPanel.contains(documentRef.activeElement);
  const changed=activeTab!==key;activeTab=key;
  closeMenus();
  for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;}
  for(const[name,item]of panels){const selected=name===key;item.hidden=!selected;item.inert=!selected;}
  if(focus||movingFocus)tab.focus({preventScroll:true});
  if(changed)scheduleLayout();
  return true;
 }
 function updateSelection(objects=[]){
  const format=tabFor('format');if(!format||disposed)return;
  const enabled=Array.isArray(objects)&&objects.length>0;
  const focused=format===documentRef.activeElement||panels.get('format')?.contains(documentRef.activeElement);
  format.disabled=!enabled;format.setAttribute('aria-disabled',String(!enabled));
  if(!enabled&&activeTab==='format')show('home',{focus:!!focused});
  else if(!enabled&&focused)tabFor(activeTab)?.focus({preventScroll:true});
 }
 function syncPane(){
  if(pane){pane.hidden=!paneOpen;pane.inert=!paneOpen;}
  documentRef.documentElement.dataset.selectionPane=paneOpen?'open':'closed';
  for(const button of paneButtons){button.setAttribute('aria-expanded',String(paneOpen));if(pane)button.setAttribute('aria-controls',pane.id);}
 }
 function returnFromPane(){
  if(typeof onFocusCanvas==='function'){onFocusCanvas();return;}
  if(previousFocus?.isConnected!==false&&!previousFocus?.disabled&&!previousFocus?.closest?.('[hidden],[inert]')&&typeof previousFocus?.focus==='function')previousFocus.focus({preventScroll:true});
  else tabFor(activeTab)?.focus({preventScroll:true});
 }
 function toggleSelectionPane(force){
  if(disposed||!pane)return false;
  const next=typeof force==='boolean'?force:!paneOpen;if(next===paneOpen)return paneOpen;
  if(next&&!pane.contains(documentRef.activeElement))previousFocus=documentRef.activeElement;
  paneOpen=next;syncPane();
  try{storage?.setItem(PANE_PREFERENCE,paneOpen?'open':'closed');}catch{}
  if(!paneOpen)returnFromPane();
  scheduleLayout();return paneOpen;
 }
 function click(event){
  const tab=event.target.closest?.('[data-ribbon-tab]');
  if(tabs.includes(tab)&&!tab.disabled)show(tab.dataset.ribbonTab);
 }
 function keydown(event){
  if(event.defaultPrevented||event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){
   const menu=event.target.closest?.('details[open]')||details().at(-1);
   if(menu&&root.contains(menu)){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary')?.focus({preventScroll:true});}
   return;
  }
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  const tab=event.target.closest?.('[data-ribbon-tab]');if(!tabs.includes(tab))return;
  const available=tabs.filter(item=>!item.disabled&&!item.hidden);let index=available.indexOf(tab);
  if(index<0)return;
  if(event.key==='ArrowRight')index=(index+1)%available.length;
  else if(event.key==='ArrowLeft')index=(index+available.length-1)%available.length;
  else if(event.key==='Home')index=0;
  else if(event.key==='End')index=available.length-1;
  else return; // Enter and Space retain native button activation.
  event.preventDefault();event.stopPropagation();show(available[index].dataset.ribbonTab,{focus:true});
 }
 function toggled(event){if(event.target.tagName==='DETAILS'&&event.target.open){closeMenus(event.target);scheduleLayout();}}
 for(const tab of tabs){
  const key=tab.dataset.ribbonTab,panel=panels.get(key);tab.setAttribute('role','tab');
  if(!tab.id)tab.id=`ribbon-tab-${key}`;
  if(panel){if(!panel.id)panel.id=`ribbon-panel-${key}`;tab.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);}
 }
 try{paneOpen=!!pane&&storage?.getItem(PANE_PREFERENCE)!=='closed';}catch{}
 syncPane();updateSelection([]);show('home');
 root.addEventListener('click',click);root.addEventListener('keydown',keydown);root.addEventListener('toggle',toggled,true);root.addEventListener('scroll',scheduleLayout,true);view.addEventListener?.('resize',scheduleLayout);
 return {show,updateSelection,toggleSelectionPane,get activeTab(){return activeTab;},get selectionPaneOpen(){return paneOpen;},
  destroy(){if(disposed)return;disposed=true;if(frame!==null)view.cancelAnimationFrame?.(frame);root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);root.removeEventListener('toggle',toggled,true);root.removeEventListener('scroll',scheduleLayout,true);view.removeEventListener?.('resize',scheduleLayout);}
 };
}
