import {LINE_STYLES,lineStyleValue,lineStrokeAttributes,supportsLineStyle} from './line-styles.mjs?v=lines-v064-1';
const NS='http://www.w3.org/2000/svg';
export function createLineStylePicker({root,onChange,documentRef=globalThis.document}={}){
 const summary=root.querySelector('summary'),panel=root.querySelector('.dropdown-panel');
 summary.setAttribute('aria-haspopup','menu');
 let available=false;
 function sample(styleValue){
  const svg=documentRef.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 120 18');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  const line=documentRef.createElementNS(NS,'line');
  for(const [key,value]of Object.entries({x1:5,y1:9,x2:115,y2:9,stroke:'currentColor','stroke-width':2,...lineStrokeAttributes({dashStyle:styleValue,strokeWidth:2})}))if(value!==undefined)line.setAttribute(key,String(value));
  svg.append(line);return svg;
 }
 panel.setAttribute('role','menu');panel.setAttribute('aria-label','線種');
 const buttons=LINE_STYLES.map(style=>{
  const button=documentRef.createElement('button');button.type='button';button.className='line-style-option';button.dataset.lineStyle=style.value;
  button.setAttribute('role','menuitemradio');button.setAttribute('aria-label',style.label);button.setAttribute('aria-checked','false');
  const label=documentRef.createElement('span');label.textContent=style.label;button.append(sample(style.value),label);
  button.addEventListener('click',()=>{if(!available||button.disabled)return;onChange(style.value);root.open=false;summary.focus({preventScroll:true});});
  button.addEventListener('keydown',event=>{
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();event.stopPropagation();const index=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next].focus();
   }else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();root.open=false;summary.focus({preventScroll:true});}
   else if(event.key===' '||event.key==='Enter')event.stopPropagation();
  });
  panel.append(button);return button;
 });
 summary.addEventListener('click',event=>{if(!available)event.preventDefault();});
 summary.addEventListener('keydown',event=>{
  if(!available){if(['Enter',' ','ArrowDown','ArrowUp'].includes(event.key))event.preventDefault();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();event.stopPropagation();root.open=true;
   (buttons.find(button=>button.getAttribute('aria-checked')==='true')||buttons[event.key==='ArrowUp'?buttons.length-1:0]).focus();
  }
 });
 return {update(objects,{editableIds}={}){
  const shapes=objects.filter(supportsLineStyle),allowed=new Set(editableIds??shapes.filter(o=>!o.locked).map(o=>o.id));
  available=shapes.some(o=>allowed.has(o.id));summary.setAttribute('aria-disabled',String(!available));
  if(!available)root.open=false;
  const values=shapes.map(lineStyleValue),style=values.length&&values.every(value=>value===values[0])?values[0]:null;
  root.dataset.mixed=String(values.length>1&&!style);
  summary.title=values.length?'線種：'+(style?LINE_STYLES.find(s=>s.value===style).label:'複数の線種'):'線種';
  summary.setAttribute('aria-label',summary.title);
  for(const button of buttons){button.disabled=!available;const checked=button.dataset.lineStyle===style;button.setAttribute('aria-checked',String(checked));button.tabIndex=checked||!style&&button===buttons[0]?0:-1;}
 }};
}
