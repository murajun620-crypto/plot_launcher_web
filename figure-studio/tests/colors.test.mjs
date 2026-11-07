import test from 'node:test';
import assert from 'node:assert/strict';
import {createColorPickers,normalizePaletteColor,THEME_COLORS,STANDARD_COLORS} from '../colors.mjs';

function environment({stored=null,throwStorage=false}={}){
 const documentRef={activeElement:null},writes=[],changes=[],storage={getItem(){if(throwStorage)throw Error('blocked');return stored;},setItem(key,value){if(throwStorage)throw Error('blocked');writes.push([key,value]);}};
 class UIEvent{
  constructor(type,{bubbles=false}={}){this.type=type;this.bubbles=bubbles;this.defaultPrevented=false;this.stopped=false;}
  preventDefault(){this.defaultPrevented=true;}stopPropagation(){this.stopped=true;}
 }
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parent=null;this.dataset={};this.attributes=new Map();this.events=new Map();this.value='';this.disabled=false;this.hidden=false;this.open=false;this.tabIndex=0;this.style={setProperty(name,value){this[name]=value;}};const classes=new Set();this.classList={toggle(name,on){on?classes.add(name):classes.delete(name);},contains:name=>classes.has(name)};}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this.append(...children);}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  matches(selector){const parsed=/^(\w+)?(?:\[data-([\w-]+)(?:="([^"]*)")?\])?$/.exec(selector);if(!parsed)return false;const[,tag,attr,value]=parsed;if(tag&&this.tagName!==tag.toUpperCase())return false;if(attr){const key=attr.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return this.dataset[key]!==undefined&&(value===undefined||this.dataset[key]===value);}return !!tag;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  closest(selector){for(let node=this;node;node=node.parent)if(node.matches(selector))return node;return null;}
  setAttribute(name,value){this.attributes.set(name,String(value));}getAttribute(name){return this.attributes.get(name)??null;}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  dispatchEvent(event){event.target??=this;for(const fn of this.events.get(event.type)||[])fn(event);if(event.bubbles&&!event.stopped)this.parent?.dispatchEvent(event);return !event.defaultPrevented;}
  fire(type,extra={}){const event=Object.assign(new UIEvent(type,{bubbles:true}),extra);this.dispatchEvent(event);return event;}
  focus(){documentRef.activeElement=this;}
  get isConnected(){return documentRef.body?.contains(this)??false;}
 }
 documentRef.createElement=tag=>new Element(tag);documentRef.defaultView={Event:UIEvent};documentRef.body=new Element('body');const root=new Element('section');documentRef.body.append(root);
 const menus=[];
 for(const scope of ['text','shape','line']){
  const menu=new Element('details');menu.dataset={colorPicker:scope,colorScope:scope,colorProp:scope==='line'?'stroke':'fill'};
  const summary=new Element('summary'),swatch=new Element('span'),primary=new Element('input'),custom=new Element('input'),none=new Element('button');
  summary.setAttribute('aria-label',scope==='text'?'文字の色':scope==='shape'?'塗りの色':'線の色');swatch.dataset.colorSwatch='';summary.append(swatch);
  primary.dataset={colorValue:'',prop:menu.dataset.colorProp};primary.value='#4472c4';primary.type='text';primary.hidden=true;
  custom.dataset.colorCustom='';custom.type='color';custom.value='#000000';none.dataset.colorNone='';none.type='button';menu.append(summary,primary,none);
  const grids={};for(const name of ['theme','standard','recent']){const grid=new Element('div');grid.dataset.colorGrid=name;grids[name]=grid;if(name==='recent'){const section=new Element('section');section.dataset.colorRecentSection='';section.append(grid);menu.append(section);}else menu.append(grid);}
  menu.append(custom);root.append(menu);menus.push({menu,summary,swatch,primary,custom,none,grids});
  for(const type of ['input','change'])primary.addEventListener(type,()=>changes.push({type,scope,value:primary.value}));
 }
 const notifications=[],api=createColorPickers({root,documentRef,storage,onChange:value=>notifications.push(value)});
 return {api,root,menus,documentRef,changes,notifications,writes,Element,chip(menu,group,index){return menus[menu].grids[group].children[index];}};
}

test('theme, standard and recent groups render accessible native swatches without committing on startup',()=>{
 const e=environment();assert.equal(THEME_COLORS.length,60);assert.equal(STANDARD_COLORS.length,10);
 for(const {grids,primary,custom}of e.menus){assert.equal(grids.theme.children.length,60);assert.equal(grids.standard.children.length,10);assert.equal(grids.recent.hidden,true);assert.equal(custom.value,primary.value);assert.equal(grids.theme.getAttribute('role'),'group');assert.equal(grids.theme.children.filter(button=>button.tabIndex===0).length,1);assert.ok(grids.theme.children.every(button=>button.type==='button'&&button.getAttribute('aria-label').includes('#')));}
 assert.equal(e.changes.length,0);e.api.destroy();
});

test('palette choice emits one primary input/change pair and synchronizes recent colors across all menus',()=>{
 const e=environment(),{menu,primary}=e.menus[0];menu.open=true;e.chip(0,'standard',1).fire('click');
 assert.equal(primary.value,'#ff0000');assert.deepEqual(e.changes,[{type:'input',scope:'text',value:'#ff0000'},{type:'change',scope:'text',value:'#ff0000'}]);assert.equal(menu.open,false);assert.equal(e.notifications.length,1);
 for(const {grids}of e.menus)assert.equal(grids.recent.children[0].dataset.colorChip,'#ff0000');assert.deepEqual(e.api.recentColors,['#ff0000']);assert.equal(JSON.parse(e.writes.at(-1)[1])[0],'#ff0000');
});

test('colorless selections preserve literal none and never put it in recent or native color values',()=>{
 const e=environment(),{primary,none,swatch,custom,menu}=e.menus[1];none.fire('click');
 assert.equal(primary.value,'none');assert.equal(menu.dataset.colorState,'none');assert.equal(swatch.classList.contains('is-none'),true);assert.equal(none.getAttribute('aria-pressed'),'true');assert.match(custom.value,/^#[a-f0-9]{6}$/);assert.deepEqual(e.api.recentColors,[]);assert.equal(e.changes.length,2);
});

test('native custom color commits on change only and retains inline text editor focus restored by the app',()=>{
 const e=environment(),{primary,custom,summary}=e.menus[0],editor=new e.Element('textarea');e.documentRef.body.append(editor);
 primary.addEventListener('change',()=>editor.focus());custom.focus();custom.value='#123456';custom.fire('input');assert.equal(e.changes.length,0);
 custom.fire('change');assert.equal(primary.value,'#123456');assert.equal(e.changes.length,2);assert.equal(e.documentRef.activeElement,editor);assert.notEqual(e.documentRef.activeElement,summary);
});

test('disabled primary blocks every entry point and mixed values mark the summary without selecting a color',()=>{
 const e=environment(),m=e.menus[2];m.primary.disabled=true;m.menu.open=true;e.api.update();
 assert.equal(m.menu.open,false);assert.equal(m.summary.getAttribute('aria-disabled'),'true');assert.equal(m.custom.disabled,true);assert.equal(m.none.disabled,true);assert.ok(m.grids.theme.children.every(button=>button.disabled));
 assert.equal(m.summary.fire('click').defaultPrevented,true);e.chip(2,'standard',0).fire('click');m.none.fire('click');m.custom.value='#123456';m.custom.fire('change');assert.equal(e.changes.length,0);
 m.primary.disabled=false;m.primary.dataset.mixed='true';e.api.update();assert.equal(m.menu.dataset.colorState,'mixed');assert.equal(m.swatch.classList.contains('is-mixed'),true);assert.ok(m.grids.theme.children.every(button=>button.getAttribute('aria-pressed')==='false'));assert.match(m.summary.getAttribute('aria-label'),/複数/);
});

test('grid arrows and Home/End move only focus; Enter/Space stay native and IME is untouched',()=>{
 const e=environment(),grid=e.menus[0].grids.theme;grid.children[0].focus();
 const moved=grid.children[0].fire('keydown',{key:'ArrowDown'});assert.equal(moved.defaultPrevented,true);assert.equal(moved.stopped,true);assert.equal(e.documentRef.activeElement,grid.children[10]);assert.equal(e.changes.length,0);
 grid.children[10].fire('keydown',{key:'End'});assert.equal(e.documentRef.activeElement,grid.children.at(-1));grid.children.at(-1).fire('keydown',{key:'Home'});assert.equal(e.documentRef.activeElement,grid.children[0]);
 for(const [key,options]of [['Enter',{}],[' ',{}],['Tab',{}],['ArrowRight',{isComposing:true}],['ArrowRight',{keyCode:229}],['ArrowRight',{ctrlKey:true}]])assert.equal(grid.children[0].fire('keydown',{key,...options}).defaultPrevented,false);
 assert.equal(e.changes.length,0);grid.children[0].fire('click');assert.equal(e.documentRef.activeElement,e.menus[0].summary);
});

test('recent colors deduplicate, reorder and keep only the ten newest valid colors',()=>{
 const e=environment({stored:'["#ABC","#aabbcc","none","invalid","#112233"]'});assert.deepEqual(e.api.recentColors,['#aabbcc','#112233']);
 for(let index=0;index<12;index++){e.menus[0].custom.value='#'+index.toString(16).padStart(6,'0');e.menus[0].custom.fire('change');}
 assert.equal(e.api.recentColors.length,10);assert.equal(e.api.recentColors[0],'#00000b');assert.equal(e.api.recentColors.at(-1),'#000002');
 e.menus[0].custom.value='#000005';e.menus[0].custom.fire('change');assert.equal(e.api.recentColors[0],'#000005');assert.equal(e.api.recentColors.length,10);assert.equal(e.api.recentColors.filter(color=>color==='#000005').length,1);
});

test('malformed or unavailable storage cannot prevent choosing colors, and invalid custom colors never commit',()=>{
 for(const options of [{stored:'not JSON'},{stored:'{}'},{throwStorage:true}]){
  const e=environment(options);assert.deepEqual(e.api.recentColors,[]);e.menus[0].custom.value='url(javascript:bad)';e.menus[0].custom.fire('change');assert.equal(e.changes.length,0);e.chip(0,'standard',3).fire('click');assert.equal(e.menus[0].primary.value,'#ffff00');
 }
 assert.equal(normalizePaletteColor('#AbC'),'#aabbcc');assert.equal(normalizePaletteColor('none'),'none');assert.equal(normalizePaletteColor('red'),null);
});

test('update does not commit or reconstruct unchanged grids and destroy detaches event handlers',()=>{
 const e=environment(),first=e.chip(0,'theme',0);e.api.update();assert.equal(e.chip(0,'theme',0),first);assert.equal(e.changes.length,0);
 e.api.destroy();first.fire('click');e.menus[0].none.fire('click');e.menus[0].custom.fire('change');assert.equal(e.changes.length,0);
});
