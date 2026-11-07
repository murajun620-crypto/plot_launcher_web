import {ARROW_STYLES,arrowEndpoint,arrowGeometry} from './arrowheads.mjs?v=0.3.0-1';

const NS='http://www.w3.org/2000/svg';
const labels={none:'なし',triangle:'三角',open:'開いた矢印',stealth:'ステルス',diamond:'ひし形',oval:'円'};
function svgElement(tag,attrs={}){
 const element=document.createElementNS(NS,tag);
 for(const [name,value]of Object.entries(attrs))element.setAttribute(name,String(value));
 return element;
}
function icon(style,end){
 const image=svgElement('svg',{viewBox:'0 0 54 28','aria-hidden':'true',focusable:'false'});
 const line={type:'arrow',w:38,h:0,strokeWidth:2.4,stroke:'currentColor',arrowStartStyle:'none',arrowEndStyle:'none',arrowStartWidth:'wide',arrowEndWidth:'wide',arrowStartLength:'long',arrowEndLength:'long'};
 line[end==='start'?'arrowStartStyle':'arrowEndStyle']=style;
 const geometry=arrowGeometry(line),group=svgElement('g',{transform:'translate(8 14)'});
 group.append(svgElement('line',{...geometry.shaft,stroke:'currentColor','stroke-width':line.strokeWidth,'stroke-linecap':'round'}));
 for(const head of geometry.heads)group.append(svgElement(head.tag,head.attrs));
 image.append(group);return image;
}

/** Replace the existing textual style selectors; retain the surrounding fields. */
export function createArrowPicker({root,onChange}){
 const endpoints=[];
 for(const end of ['start','end']){
  const name=end==='start'?'始点':'終点',property=end==='start'?'arrowStartStyle':'arrowEndStyle';
  const select=root.querySelector(`select[data-prop="${property}"]`);
  if(!select)continue;
  const wrapper=document.createElement('div');wrapper.className='arrow-icon-field';
  const caption=document.createElement('span');caption.className='arrow-icon-label';caption.textContent='種類';
  const palette=document.createElement('div');palette.className='arrow-icon-palette';palette.setAttribute('role','radiogroup');palette.setAttribute('aria-label',`${name}の矢印の種類`);
  const buttons=ARROW_STYLES.map(style=>{
   const button=document.createElement('button');button.type='button';button.className='arrow-icon-option';button.dataset.arrowStyle=style;
   button.setAttribute('role','radio');button.setAttribute('aria-checked','false');button.setAttribute('aria-label',`${name}：${labels[style]}`);button.title=`${name}：${labels[style]}`;button.append(icon(style,end));
   button.addEventListener('click',()=>onChange(property,style));
   button.addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){
     event.preventDefault();event.stopPropagation();
     const index=buttons.indexOf(button),step=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-3:3;
     const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+step+buttons.length)%buttons.length;
     if(!buttons[next].disabled){buttons[next].focus();buttons[next].click();}
    }else if(event.key===' '||event.key==='Enter')event.stopPropagation();
   });
   palette.append(button);return button;
  });
  wrapper.append(caption,palette);select.closest('label').replaceWith(wrapper);
  const prefix=end==='start'?'arrowStart':'arrowEnd',width=root.querySelector(`[data-prop="${prefix}Width"]`),length=root.querySelector(`[data-prop="${prefix}Length"]`);
  endpoints.push({end,buttons,width,length});
 }
 return {update(objects,{editableIds}={}){
  const arrows=objects.filter(object=>['line','arrow'].includes(object.type));
  const allowed=editableIds?new Set(editableIds):new Set(arrows.filter(object=>!object.locked).map(object=>object.id));
  const editable=arrows.filter(object=>allowed.has(object.id));
  for(const {end,buttons,width,length}of endpoints){
   const styles=arrows.map(object=>arrowEndpoint(object,end).style),style=styles.length&&styles.every(value=>value===styles[0])?styles[0]:null;
   buttons.forEach((button,index)=>{
    const chosen=button.dataset.arrowStyle===style;button.disabled=!editable.length;button.setAttribute('aria-checked',String(chosen));button.tabIndex=chosen||(!style&&index===0)?0:-1;
   });
   const circles=editable.length>0&&editable.every(object=>arrowEndpoint(object,end).style==='oval');
   if(width){
    const caption=width.closest('label')?.querySelector('span');if(caption)caption.textContent=circles?'サイズ':'幅';
    width.setAttribute('aria-label',`${end==='start'?'始点':'終点'}の矢印の${circles?'円のサイズ':'幅'}`);
    const sizeLabels=circles?{narrow:'小さい',medium:'標準',wide:'大きい'}:{narrow:'狭い',medium:'標準',wide:'広い'};
    for(const option of width.options)if(sizeLabels[option.value])option.textContent=sizeLabels[option.value];
   }
   if(length&&circles){length.disabled=true;length.title='円の大きさは「サイズ」で変更します';}
   else if(length)length.title='';
  }
 }};
}
