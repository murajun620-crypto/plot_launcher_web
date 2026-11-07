import {orderedFigureIds,selectFigureIds,reorderFigures} from './figure-order.mjs';

// Small, cached previews. Rendering never runs on the pointer-move path.
export function createFigureSidebar({root,onSelect,onCommand,onReorder,onSelectionChange=()=>{},renderSVG}) {
  const cards=new Map();
  let activeId=null,timer=0,busy=false,order=[],selectedIds=[],anchorId=null,focusedId=null;
  let pointer=null,scrollFrame=0,ignoreClickId=null,ignoreClickUntil=0;
  root.setAttribute('role','listbox');root.setAttribute('aria-multiselectable','true');root.tabIndex=-1;
  const marker=document.createElement('div'),badge=document.createElement('div');
  marker.className='figure-drop-marker';badge.className='figure-drag-badge';
  marker.hidden=badge.hidden=true;marker.setAttribute('aria-hidden','true');badge.setAttribute('aria-hidden','true');
  document.body.append(marker,badge);
  function paintSelection(){
    for(const [id,c]of cards){
      const selected=selectedIds.includes(id),active=id===activeId;
      c.button.classList.toggle('active',active);c.button.classList.toggle('selected',selected);
      c.button.setAttribute('aria-current',active?'page':'false');c.button.setAttribute('aria-selected',String(selected));
      c.button.tabIndex=id===(focusedId||activeId)?0:-1;
    }
  }
  function setSelection(ids){
    const next=orderedFigureIds(order,ids),changed=next.join('\0')!==selectedIds.join('\0');
    selectedIds=next;paintSelection();if(changed)onSelectionChange([...selectedIds]);
  }
  function focusCard(id,scroll=true){
    focusedId=id;paintSelection();cards.get(id)?.button.focus({preventScroll:!scroll});
  }
  function choose(id,{toggle=false,range=false}={}){
    setSelection(selectFigureIds(order,selectedIds,id,{toggle,range,anchor:anchorId||activeId}));
    if(!range)anchorId=id;
    if(selectedIds.includes(id))onSelect(id);
    else if(id===activeId&&selectedIds.length)onSelect(selectedIds.at(-1));
    focusCard(id,false);
  }
  function clearDrag(){
    if(scrollFrame)cancelAnimationFrame(scrollFrame);scrollFrame=0;
    marker.hidden=badge.hidden=true;delete root.dataset.dragging;
    for(const c of cards.values())c.button.classList.remove('dragging');
  }
  function updateDrop(){
    if(!pointer?.dragging)return;
    const rect=root.getBoundingClientRect();
    pointer.valid=pointer.x>=rect.left&&pointer.x<=rect.right&&pointer.y>=rect.top&&pointer.y<=rect.bottom;
    marker.hidden=!pointer.valid;badge.hidden=false;
    badge.textContent=`${pointer.ids.length} Figureを移動`;
    badge.style.left=`${Math.min(window.innerWidth-130,pointer.x+14)}px`;badge.style.top=`${pointer.y+12}px`;
    if(!pointer.valid)return;
    const remaining=order.filter(id=>!pointer.ids.includes(id));
    const target=remaining.find(id=>{const box=cards.get(id).button.getBoundingClientRect();return pointer.y<box.top+box.height/2;});
    pointer.beforeId=target??null;
    const targetRect=target?cards.get(target).button.getBoundingClientRect():remaining.length?cards.get(remaining.at(-1)).button.getBoundingClientRect():null;
    const y=targetRect?(target?targetRect.top-4:targetRect.bottom+4):rect.top+10;
    marker.style.left=`${rect.left+7}px`;marker.style.width=`${Math.max(0,rect.width-14)}px`;
    marker.style.top=`${Math.min(rect.bottom-4,Math.max(rect.top+3,y))}px`;
  }
  function autoScroll(){
    scrollFrame=0;if(!pointer?.dragging)return;
    const rect=root.getBoundingClientRect();
    if(pointer.x>=rect.left&&pointer.x<=rect.right){
      const edge=35,up=pointer.y-(rect.top+edge),down=pointer.y-(rect.bottom-edge);
      if(up<0)root.scrollTop+=Math.max(-16,up*.35);else if(down>0)root.scrollTop+=Math.min(16,down*.35);
      updateDrop();
    }
    scrollFrame=requestAnimationFrame(autoScroll);
  }
  function endPointer(commit){
    if(!pointer)return;
    const done=pointer;pointer=null;clearDrag();
    try{if(root.hasPointerCapture(done.pointerId))root.releasePointerCapture(done.pointerId);}catch{}
    ignoreClickId=done.id;ignoreClickUntil=performance.now()+500;
    if(done.dragging){
      if(commit&&done.valid){
        const reordered=reorderFigures(order.map(id=>({id})),done.ids,done.beforeId);
        if(reordered.some((f,i)=>f.id!==order[i]))onReorder?.([...done.ids],done.beforeId);
      }
      focusCard(cards.has(done.id)?done.id:activeId,false);
    }else if(commit&&done.collapse){choose(done.id);}
  }
  root.addEventListener('pointermove',e=>{
    if(!pointer||e.pointerId!==pointer.pointerId)return;
    pointer.x=e.clientX;pointer.y=e.clientY;
    if(!pointer.dragging&&Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>=5){
      pointer.dragging=true;pointer.ids=selectedIds.includes(pointer.id)?[...selectedIds]:[pointer.id];
      setSelection(pointer.ids);root.dataset.dragging='true';
      for(const id of pointer.ids)cards.get(id)?.button.classList.add('dragging');
      scrollFrame=requestAnimationFrame(autoScroll);
    }
    if(pointer.dragging){e.preventDefault();updateDrop();}
  });
  root.addEventListener('pointerup',e=>{if(pointer&&e.pointerId===pointer.pointerId){pointer.x=e.clientX;pointer.y=e.clientY;updateDrop();endPointer(true);}});
  root.addEventListener('pointercancel',()=>endPointer(false));
  root.addEventListener('lostpointercapture',()=>{if(pointer)endPointer(false);});
  window.addEventListener('blur',()=>endPointer(false));
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&pointer){e.preventDefault();e.stopPropagation();endPointer(false);}},{capture:true});
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){const card=cards.get(entry.target.dataset.figureId);if(card)card.visible=entry.isIntersecting;}
    schedule();
  },{root,rootMargin:'160px'});
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>{
    if('requestIdleCallback' in window)requestIdleCallback(flush,{timeout:800});else flush();
  },120);}
  async function flush(){
    if(busy)return;
    const card=[...cards.values()].find(c=>c.dirty&&c.visible);
    if(!card)return;
    card.dirty=false;
    const f=card.figure,signature=JSON.stringify([f.width,f.height,f.objects]);
    if(signature===card.signature){schedule();return;}
    busy=true;
    let url;
    try{
      const version=card.version,max=320,ratio=f.width/f.height;
      const width=Math.max(1,Math.round(ratio>=1?max:max*ratio));
      const height=Math.max(1,Math.round(ratio>=1?max/ratio:max));
      url=URL.createObjectURL(new Blob([renderSVG(f,width,height)],{type:'image/svg+xml'}));
      const image=new Image();image.src=url;await image.decode();
      if(cards.get(f.id)!==card||version!==card.version)return;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(image,0,0,width,height);
      card.image.src=canvas.toDataURL('image/png');
      card.image.hidden=false;card.preview.classList.remove('loading');
      card.signature=signature;canvas.width=canvas.height=1;
    }catch{
      card.preview.classList.remove('loading');
      card.preview.setAttribute('data-preview-error','true');
    }finally{
      if(url)URL.revokeObjectURL(url);
      busy=false;schedule();
    }
  }
  function create(f){
    const button=document.createElement('button');button.type='button';button.className='figure-tab';button.dataset.figureId=f.id;button.setAttribute('role','option');
    const preview=document.createElement('span');preview.className='figure-thumb loading';preview.setAttribute('aria-hidden','true');
    const image=document.createElement('img');image.alt='';image.draggable=false;image.hidden=true;preview.append(image);
    const caption=document.createElement('span');caption.className='figure-caption';
    const number=document.createElement('span');number.className='figure-number';
    const name=document.createElement('span');name.className='figure-name';
    const count=document.createElement('small');count.className='figure-count';
    caption.append(number,name,count);button.append(preview,caption);
    button.onpointerdown=e=>{
      if(e.button!==0||pointer)return;
      const toggle=e.ctrlKey||e.metaKey,range=e.shiftKey,alreadySelected=selectedIds.includes(f.id);
      if(toggle||range||!alreadySelected)choose(f.id,{toggle,range});else focusCard(f.id,false);
      pointer={id:f.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,dragging:false,ids:[],beforeId:null,valid:false,collapse:!toggle&&!range&&alreadySelected};
      root.setPointerCapture(e.pointerId);
    };
    button.ondragstart=e=>e.preventDefault();
    button.onclick=e=>{
      if(e.detail!==0&&ignoreClickId===f.id&&performance.now()<ignoreClickUntil)return;
      choose(f.id,{toggle:e.ctrlKey||e.metaKey,range:e.shiftKey});
    };
    button.onfocus=()=>{focusedId=f.id;paintSelection();};
    button.onkeydown=e=>{
      if(e.key==='Tab'){e.stopPropagation();return;}
      const mod=e.ctrlKey||e.metaKey;
      if(mod&&e.key.toLowerCase()==='a'){
        e.preventDefault();e.stopPropagation();setSelection(order);return;
      }
      if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey){
        e.preventDefault();e.stopPropagation();if(e.repeat)return;
        choose(f.id);onCommand('new-figure',[f.id]);focusCard(activeId,false);return;
      }
      if(mod&&e.key.toLowerCase()==='d'||!mod&&!e.altKey&&(e.key==='Delete'||e.key==='Backspace')){
        e.preventDefault();e.stopPropagation();
        if(selectedIds.length)onCommand(mod?'duplicate-figure':'delete-figure',[...selectedIds]);
        focusCard(activeId,false);return;
      }
      if(e.key===' '){e.preventDefault();e.stopPropagation();choose(f.id,{toggle:mod,range:e.shiftKey});return;}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setSelection([activeId]);anchorId=activeId;focusCard(activeId,false);return;}
      const index=order.indexOf(f.id);
      const next=e.key==='ArrowDown'?Math.min(order.length-1,index+1):e.key==='ArrowUp'?Math.max(0,index-1):e.key==='Home'?0:e.key==='End'?order.length-1:null;
      if(next!==null){e.preventDefault();e.stopPropagation();if(mod&&!e.shiftKey)focusCard(order[next]);else{choose(order[next],{toggle:mod,range:e.shiftKey});focusCard(order[next]);}}
    };
    const card={button,preview,image,number,name,count,figure:f,signature:null,version:0,dirty:true,visible:false};
    cards.set(f.id,card);root.append(button);observer.observe(button);return card;
  }
  return {getSelectedIds:()=>[...selectedIds],select(ids,nextActive){
    if(nextActive&&order.includes(nextActive)){activeId=nextActive;focusedId=nextActive;anchorId=nextActive;}
    setSelection(ids);
  },update(figures,nextActive){
    order=figures.map(f=>f.id);
    const previousActive=activeId,hadSelection=selectedIds.length>0;
    selectedIds=orderedFigureIds(order,selectedIds);
    if((nextActive!==activeId&&!selectedIds.includes(nextActive))||(hadSelection&&!selectedIds.length))selectedIds=order.includes(nextActive)?[nextActive]:[];
    if(!order.includes(anchorId))anchorId=nextActive;
    if(!order.includes(focusedId)||previousActive!==nextActive)focusedId=nextActive;
    activeId=nextActive;
    const ids=new Set(figures.map(f=>f.id));
    for(const[id,c]of cards)if(!ids.has(id)){observer.unobserve(c.button);c.button.remove();cards.delete(id);}
    figures.forEach((f,index)=>{
      const c=cards.get(f.id)||create(f);
      if(c.figure!==f||f.id===nextActive){c.version++;c.dirty=true;}
      c.figure=f;
      c.button.setAttribute('aria-label',`${index+1} · ${f.name}`);c.button.title=`${f.name} · ${f.objects.length} オブジェクト\nCtrl / ⌘クリックで複数選択 · Shiftで範囲選択 · ドラッグで並べ替え`;
      c.number.textContent=String(index+1).padStart(2,'0');c.name.textContent=f.name;c.count.textContent=f.objects.length;
      if(root.children[index]!==c.button)root.insertBefore(c.button,root.children[index]||null);
    });
    if(previousActive!==nextActive&&!pointer?.dragging)cards.get(nextActive)?.button.scrollIntoView({block:'nearest',inline:'nearest'});
    paintSelection();schedule();
  }};
}
