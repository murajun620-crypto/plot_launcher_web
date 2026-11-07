// Small, cached previews. Rendering never runs on the pointer-move path.
export function createFigureSidebar({root,onSelect,onCommand,renderSVG}) {
  const cards=new Map();
  let activeId=null,timer=0,busy=false;
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
    const button=document.createElement('button');button.type='button';button.className='figure-tab';button.dataset.figureId=f.id;
    const preview=document.createElement('span');preview.className='figure-thumb loading';preview.setAttribute('aria-hidden','true');
    const image=document.createElement('img');image.alt='';image.draggable=false;image.hidden=true;preview.append(image);
    const caption=document.createElement('span');caption.className='figure-caption';
    const number=document.createElement('span');number.className='figure-number';
    const name=document.createElement('span');name.className='figure-name';
    const count=document.createElement('small');count.className='figure-count';
    caption.append(number,name,count);button.append(preview,caption);
    button.onclick=()=>{onSelect(f.id);cards.get(f.id)?.button.focus({preventScroll:true});};
    button.onkeydown=e=>{
      if(e.key==='Tab'){e.stopPropagation();return;}
      if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey){
        e.preventDefault();e.stopPropagation();if(e.repeat)return;
        onSelect(f.id);onCommand('new-figure');
        cards.get(activeId)?.button.focus({preventScroll:true});return;
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'||e.key==='Delete'){
        e.preventDefault();e.stopPropagation();onCommand(e.key==='Delete'?'delete-figure':'duplicate-figure');return;
      }
      const order=[...root.children],index=order.indexOf(button);
      const next=e.key==='ArrowDown'?Math.min(order.length-1,index+1):e.key==='ArrowUp'?Math.max(0,index-1):e.key==='Home'?0:e.key==='End'?order.length-1:null;
      if(next!==null){e.preventDefault();e.stopPropagation();onSelect(order[next].dataset.figureId);order[next].focus();}
    };
    const card={button,preview,image,number,name,count,figure:f,signature:null,version:0,dirty:true,visible:false};
    cards.set(f.id,card);root.append(button);observer.observe(button);return card;
  }
  return {update(figures,nextActive){
    const ids=new Set(figures.map(f=>f.id));
    for(const[id,c]of cards)if(!ids.has(id)){observer.unobserve(c.button);c.button.remove();cards.delete(id);}
    figures.forEach((f,index)=>{
      const c=cards.get(f.id)||create(f),selected=f.id===nextActive;
      if(c.figure!==f||selected){c.version++;c.dirty=true;}
      c.figure=f;c.button.classList.toggle('active',selected);c.button.setAttribute('aria-current',selected?'page':'false');c.button.setAttribute('aria-pressed',String(selected));
      c.button.setAttribute('aria-label',`${index+1} · ${f.name}`);c.button.title=`${f.name} · ${f.objects.length} オブジェクト`;
      c.number.textContent=String(index+1).padStart(2,'0');c.name.textContent=f.name;c.count.textContent=f.objects.length;
      if(root.children[index]!==c.button)root.insertBefore(c.button,root.children[index]||null);
    });
    if(activeId!==nextActive){cards.get(nextActive)?.button.scrollIntoView({block:'nearest',inline:'nearest'});activeId=nextActive;}
    schedule();
  }};
}
