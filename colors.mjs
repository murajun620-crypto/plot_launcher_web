const RECENT_KEY='figure-studio-recent-colors';
export const THEME_COLORS=Object.freeze([
 '#ffffff','#000000','#e7e6e6','#44546a','#4472c4','#ed7d31','#a5a5a5','#ffc000','#5b9bd5','#70ad47',
 '#f2f2f2','#7f7f7f','#d0cece','#d6dce4','#d9e2f3','#fbe5d6','#ededed','#fff2cc','#deebf7','#e2efd9',
 '#d9d9d9','#595959','#aeaaaa','#adb9ca','#b4c6e7','#f7cbac','#dbdbdb','#ffe699','#bdd7ee','#c5e0b3',
 '#bfbfbf','#3f3f3f','#757070','#8496b0','#8eaadb','#f4b183','#c9c9c9','#ffd966','#9dc3e6','#a9d18e',
 '#a6a6a6','#262626','#3a3838','#323e4f','#2f5496','#c55a11','#7b7b7b','#bf9000','#2e75b5','#538135',
 '#7f7f7f','#0d0d0d','#171616','#222a35','#1f3864','#833c0b','#525252','#7f6000','#1f4e78','#375623',
]);
export const STANDARD_COLORS=Object.freeze(['#c00000','#ff0000','#ffc000','#ffff00','#92d050','#00b050','#00b0f0','#0070c0','#002060','#7030a0']);
const STANDARD_NAMES=['濃い赤','赤','オレンジ','黄','黄緑','緑','水色','青','濃い青','紫'];
const GROUP_NAMES={theme:'テーマの色',standard:'標準の色',recent:'最近使った色'};
export function normalizePaletteColor(value){
 if(typeof value!=='string')return null;
 const color=value.trim().toLowerCase();
 if(color==='none'||/^#[0-9a-f]{6}$/.test(color))return color;
 if(/^#[0-9a-f]{3}$/.test(color))return '#'+[...color.slice(1)].map(part=>part+part).join('');
 return null;
}

/**
 * Each details[data-color-picker] contains a hidden primary input marked
 * data-color-value (with its existing data-prop/id), a data-color-custom native
 * color input, data-color-none, and theme/standard/recent data-color-grid hosts.
 * Choices emit one bubbling input/change pair on the primary. Optional onChange
 * is a notification receiving {input,value,scope,picker}, not another commit.
 */
export function createColorPickers({root,documentRef=globalThis.document,storage,onChange,onRecentChange,beforeChoose}={}){
 root??=documentRef;if(!root?.querySelectorAll||!documentRef?.createElement)throw new TypeError('Color pickers require a document root.');
 const view=documentRef.defaultView||globalThis,EventType=view.Event||globalThis.Event;
 if(storage===undefined)try{storage=view.localStorage;}catch{storage=null;}
 let recent=[],disposed=false;
 try{const raw=storage?.getItem(RECENT_KEY);if(typeof raw==='string'&&raw.length<8192){const values=JSON.parse(raw);if(Array.isArray(values))recent=[...new Set(values.map(normalizePaletteColor).filter(color=>color&&color!=='none'))].slice(0,10);}}catch{}
 const entries=[],listeners=[];
 const listen=(node,type,handler)=>{if(node){node.addEventListener(type,handler);listeners.push([node,type,handler]);}};
 const menus=[...(root.matches?.('[data-color-picker]')?[root]:[]),...root.querySelectorAll('[data-color-picker]')];
 function fillGrid(entry,name,colors){
  const grid=entry.grids[name];if(!grid)return;
  grid.setAttribute('role','group');grid.setAttribute('aria-label',GROUP_NAMES[name]);
  const buttons=colors.map((color,index)=>{
   const button=documentRef.createElement('button');button.type='button';button.className='color-swatch-button';button.dataset.colorChip=color;
   button.style.backgroundColor=color;button.style.setProperty('--swatch-color',color);
   const label=name==='standard'?STANDARD_NAMES[index]:`${GROUP_NAMES[name]} ${index+1}`;
   button.title=`${label} ${color.toUpperCase()}`;button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed','false');button.tabIndex=index===0?0:-1;return button;
  });
  grid.replaceChildren(...buttons);
  if(name==='recent'){grid.hidden=!colors.length;const section=entry.menu.querySelector('[data-color-recent-section]');if(section)section.hidden=!colors.length;}
 }
 function remember(color){
  if(color==='none')return;
  recent=[color,...recent.filter(value=>value!==color)].slice(0,10);
  try{storage?.setItem(RECENT_KEY,JSON.stringify(recent));}catch{}
  onRecentChange?.([...recent]);
 }
 function choose(entry,value){
  const color=normalizePaletteColor(value);if(disposed||entry.input.disabled||!color)return false;
  if(beforeChoose&&beforeChoose({input:entry.input,value:color})===false)return false;
  const previousFocus=documentRef.activeElement,hadPaletteFocus=!!previousFocus&&entry.menu.contains(previousFocus);
  remember(color);entry.input.value=color;
  entry.input.dispatchEvent(new EventType('input',{bubbles:true}));
  entry.input.dispatchEvent(new EventType('change',{bubbles:true}));
  entry.menu.open=false;update();
  onChange?.({input:entry.input,value:color,scope:entry.menu.dataset.colorScope,picker:entry.menu});
  // Keep keyboard focus useful after closing the menu, but never steal a caret
  // that the app restored to its inline text editor during change().
  if(hadPaletteFocus&&(documentRef.activeElement===previousFocus||previousFocus.isConnected===false&&documentRef.activeElement===documentRef.body))entry.summary?.focus({preventScroll:true});
  return true;
 }
 function update(){
  if(disposed)return;
  const recentKey=recent.join(',');
  for(const entry of entries){
   const {menu,input,summary,swatch,custom,none}=entry,disabled=!!input.disabled,mixed=input.dataset.mixed==='true',color=normalizePaletteColor(input.value),state=mixed?'mixed':color==='none'?'none':'color';
   menu.dataset.colorState=state;summary?.setAttribute('aria-disabled',String(disabled));
   if(disabled)menu.open=false;
   const description=mixed?'複数の色':color==='none'?'色なし':color?.toUpperCase()||'未設定';
   summary?.setAttribute('aria-label',`${entry.label}：${description}`);
   if(swatch){swatch.style.backgroundColor=mixed||!color||color==='none'?'transparent':color;swatch.style.setProperty('--swatch-color',mixed||!color||color==='none'?'transparent':color);swatch.classList.toggle('is-none',state==='none');swatch.classList.toggle('is-mixed',mixed);swatch.setAttribute('aria-hidden','true');}
   if(custom){custom.disabled=disabled;if(color&&color!=='none'&&!mixed)custom.value=color;}
   if(none){none.disabled=disabled;none.setAttribute('aria-pressed',String(!mixed&&color==='none'));}
   if(entry.recentKey!==recentKey){fillGrid(entry,'recent',recent);entry.recentKey=recentKey;}
   for(const grid of Object.values(entry.grids)){
    const buttons=[...grid.querySelectorAll('[data-color-chip]')],focused=buttons.includes(documentRef.activeElement)?documentRef.activeElement:null;
    const tabStop=focused||buttons.find(button=>!mixed&&button.dataset.colorChip===color)||buttons[0];
    for(const button of buttons){const selected=!mixed&&button.dataset.colorChip===color;button.disabled=disabled;button.tabIndex=button===tabStop?0:-1;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-selected',selected);}
   }
  }
 }
 for(const menu of menus){
  const input=menu.querySelector('input[data-color-value]');if(!input)continue;
  const summary=menu.querySelector('summary'),entry={menu,input,summary,swatch:menu.querySelector('[data-color-swatch]'),custom:menu.querySelector('[data-color-custom]'),none:menu.querySelector('[data-color-none]'),grids:{},recentKey:null,label:summary?.getAttribute('aria-label')||summary?.title||'色'};
  for(const name of Object.keys(GROUP_NAMES)){const grid=menu.querySelector(`[data-color-grid="${name}"]`);if(grid)entry.grids[name]=grid;}
  entries.push(entry);fillGrid(entry,'theme',THEME_COLORS);fillGrid(entry,'standard',STANDARD_COLORS);
  listen(menu,'click',event=>{
   const chip=event.target.closest?.('[data-color-chip]'),none=event.target.closest?.('[data-color-none]'),trigger=event.target.closest?.('summary');
   if(input.disabled){if(chip||none||trigger){event.preventDefault();event.stopPropagation();}return;}
   if(chip&&menu.contains(chip))choose(entry,chip.dataset.colorChip);else if(none&&menu.contains(none))choose(entry,'none');
  });
  listen(menu,'keydown',event=>{
   if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey)return;
   if(input.disabled&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();return;}
   const chip=event.target.closest?.('[data-color-chip]'),grid=chip?.closest?.('[data-color-grid]');if(!grid||!menu.contains(grid))return;
   const buttons=[...grid.querySelectorAll('[data-color-chip]')].filter(button=>!button.disabled),index=buttons.indexOf(chip);if(index<0)return;
   const columns=Math.min(10,buttons.length);let next=index;
   if(event.key==='ArrowLeft')next=(index-1+buttons.length)%buttons.length;
   else if(event.key==='ArrowRight')next=(index+1)%buttons.length;
   else if(event.key==='ArrowUp')next=(index-columns+buttons.length)%buttons.length;
   else if(event.key==='ArrowDown')next=(index+columns)%buttons.length;
   else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;
   event.preventDefault();event.stopPropagation();buttons.forEach(button=>{button.tabIndex=button===buttons[next]?0:-1;});buttons[next].focus({preventScroll:true});
  });
  listen(menu,'toggle',()=>{if(menu.open&&input.disabled)menu.open=false;});
  listen(entry.custom,'change',()=>choose(entry,entry.custom.value));
 }
 function replaceRecentColors(values){recent=[...new Set((Array.isArray(values)?values:[]).map(normalizePaletteColor).filter(color=>color&&color!=='none'))].slice(0,10);onRecentChange?.([...recent]);update();}
 if(view.addEventListener)listen(view,'storage',event=>{if(event.key!==RECENT_KEY)return;try{replaceRecentColors(JSON.parse(event.newValue||'[]'));}catch{}});
 update();onRecentChange?.([...recent]);
 return {update,replaceRecentColors,get recentColors(){return [...recent];},destroy(){if(disposed)return;disposed=true;for(const[node,type,handler]of listeners)node.removeEventListener(type,handler);}};
}

/** The same Studio palette for editors whose color buttons live in dialogs. */
export function createColorPanel({dialog,onChoose,isDisabled=()=>false,onRecentChange,documentRef=dialog.ownerDocument}){
 const view=documentRef.defaultView;
 dialog.classList.add('studio-color-panel');
 dialog.innerHTML='<div class="studio-color-heading"><strong id="color-panel-title">色を選ぶ</strong><button type="button" aria-label="色パネルを閉じる">×</button></div><details data-color-picker="shared" open><summary hidden aria-label="色"></summary><div class="color-palette-panel"><input type="text" data-color-value hidden><section class="color-palette-section"><h3>テーマの色</h3><div class="color-palette-grid" data-color-grid="theme"></div></section><section class="color-palette-section"><h3>標準の色</h3><div class="color-palette-grid" data-color-grid="standard"></div></section><section class="color-palette-section" data-color-recent-section><h3>最近使った色</h3><div class="color-palette-grid" data-color-grid="recent"></div></section><button type="button" class="color-none-button" data-color-none hidden>色なし</button><button type="button" class="color-none-button" data-color-auto hidden>自動</button><label class="color-custom-row"><span>その他の色</span><input type="color" data-color-custom value="#000000" aria-label="その他の色"></label></div></details>';
 const menu=dialog.querySelector('details'),proxy=menu.querySelector('[data-color-value]'),automatic=menu.querySelector('[data-color-auto]');
 let target=null,anchor=null;
 const canChoose=()=>!!target?.isConnected&&!target.matches(':disabled')&&!isDisabled();
 const close=({focus=false}={})=>{if(dialog.open)dialog.close();if(focus&&anchor?.isConnected&&!anchor.disabled)anchor.focus({preventScroll:true});};
 const palette=createColorPickers({root:menu,documentRef,onRecentChange,beforeChoose:()=>{if(canChoose())return true;close();return false;},onChange:({value})=>{close();onChoose(value);}});
 function position(){
  if(!dialog.open||!anchor?.isConnected)return;
  const rect=anchor.getBoundingClientRect(),width=documentRef.documentElement.clientWidth,height=documentRef.documentElement.clientHeight;
  dialog.style.maxHeight=`${Math.max(100,height-16)}px`;
  const box=dialog.getBoundingClientRect(),below=rect.bottom+5,above=rect.top-box.height-5;
  Object.assign(dialog.style,{position:'fixed',inset:'auto',margin:'0',left:`${Math.max(8,Math.min(rect.left,width-box.width-8))}px`,top:`${Math.max(8,Math.min(below+box.height<=height-8?below:above>=8?above:below,height-box.height-8))}px`});
 }
 dialog.querySelector('.studio-color-heading button').addEventListener('click',()=>close({focus:true}));
 automatic.addEventListener('click',()=>{if(!canChoose()){close();return;}close();onChoose('auto');});
 documentRef.addEventListener('pointerdown',event=>{if(dialog.open&&!dialog.contains(event.target)&&!anchor?.contains(event.target))close();},true);
 documentRef.addEventListener('keydown',event=>{if(dialog.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close({focus:true});}},true);
 documentRef.addEventListener('close',event=>{if(event.target!==dialog&&event.target.contains?.(dialog))close();},true);
 view.addEventListener('resize',position);
 view.addEventListener('scroll',event=>{if(dialog.open&&!dialog.contains(event.target))position();},true);
 return {
  open(input,label,{anchor:button,allowNone=false,allowAuto=false}={}){
   if(!input?.isConnected||input.matches(':disabled')||isDisabled())return false;
   close();target=input;anchor=button||input.closest('.color-control')?.querySelector('button')||input;
   const parent=input.closest('dialog[open]')||documentRef.body;
   if(dialog.parentElement!==parent)parent.append(dialog);
   dialog.querySelector('#color-panel-title').textContent=label;
   menu.querySelector('[data-color-none]').hidden=!allowNone;automatic.hidden=!allowAuto;
   automatic.setAttribute('aria-pressed',String(input.value==='auto'));
   proxy.value=input.value;proxy.disabled=false;menu.open=true;palette.update();
   dialog.show();position();
   (menu.querySelector('[data-color-chip][aria-pressed="true"]')||menu.querySelector('[data-color-chip]'))?.focus({preventScroll:true});
   return true;
  },
  close,update(){if(dialog.open&&!canChoose())close();else palette.update();},
  replaceRecentColors:palette.replaceRecentColors,get recentColors(){return palette.recentColors;},
 };
}
