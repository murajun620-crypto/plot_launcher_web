// Select an interval in the displayed X coordinate system without changing the axes.
export function createXRangePicker({paper,image}) {
  const banner=document.createElement('section');
  banner.className='x-range-picker-banner';banner.hidden=true;
  banner.setAttribute('aria-label','規格化に使うX範囲の選択');
  const message=document.createElement('output');message.setAttribute('aria-live','polite');
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='button quiet';cancelButton.textContent='キャンセル';
  banner.append(message,cancelButton);paper.before(banner);
  const layer=document.createElement('div');layer.className='x-range-picker-layer';layer.hidden=true;layer.tabIndex=0;
  layer.setAttribute('role','group');layer.setAttribute('aria-label','グラフ内の2点をクリック、または横方向にドラッグしてX範囲を指定。Escapeでキャンセル。');
  const band=document.createElement('div');band.className='x-range-picker-band';band.hidden=true;layer.append(band);paper.append(layer);
  let current=null,anchor=null,gesture=null,suppressDoubleClickUntil=0;
  const format=value=>Number(value.toPrecision(8)).toString();
  function valueAt(fraction) {
    const [lo,hi]=current.range;
    if(fraction===0)return lo;if(fraction===1)return hi;
    return current.scale==='log'?Math.exp(Math.log(lo)+(Math.log(hi)-Math.log(lo))*fraction):lo*(1-fraction)+hi*fraction;
  }
  function fractionAt(event) {
    const box=layer.getBoundingClientRect();
    return Math.max(0,Math.min(1,(event.clientX-box.left)/box.width));
  }
  function layout() {
    if(!current)return;
    const picture=image.getBoundingClientRect(),box=paper.getBoundingClientRect(),[x,y,w,h]=current.axes;
    Object.assign(layer.style,{left:`${picture.left-box.left-paper.clientLeft+x*picture.width+paper.scrollLeft}px`,top:`${picture.top-box.top-paper.clientTop+y*picture.height+paper.scrollTop}px`,width:`${w*picture.width}px`,height:`${h*picture.height}px`});
  }
  function preview(first,last=first) {
    band.hidden=false;
    Object.assign(band.style,{left:`${Math.min(first,last)*100}%`,width:`${Math.abs(last-first)*100}%`});
    const values=[valueAt(first),valueAt(last)].sort((a,b)=>a-b);
    message.textContent=`${current.label}：X ${format(values[0])} ～ ${format(values[1])}　${anchor===null?'横にドラッグ、または離して1点目を決定':'2点目をクリック'}（Escで中止）`;
  }
  function stop() {
    const previous=current,id=gesture?.id;current=null;anchor=null;gesture=null;
    banner.hidden=layer.hidden=band.hidden=true;paper.classList.remove('selecting-x-range');
    if(id!==undefined&&layer.hasPointerCapture(id))layer.releasePointerCapture(id);
    suppressDoubleClickUntil=performance.now()+600;
    return previous;
  }
  function cancel({notify=true}={}) {
    if(!current)return;
    const previous=stop();if(notify)previous.onCancel?.();
  }
  function finish(first,last) {
    const values=[valueAt(first),valueAt(last)].sort((a,b)=>a-b);
    if(!values.every(Number.isFinite)||values[0]===values[1]){
      message.textContent='異なるX位置を2点選んでください。Escapeでキャンセルできます。';return;
    }
    const previous=stop();previous.onCommit(values);
  }
  layer.addEventListener('pointerdown',event=>{
    if(!current||event.button!==0||event.isPrimary===false)return;
    event.preventDefault();event.stopPropagation();layer.focus({preventScroll:true});
    gesture={id:event.pointerId,start:fractionAt(event),x:event.clientX};
    layer.setPointerCapture(event.pointerId);preview(anchor??gesture.start,gesture.start);
  });
  layer.addEventListener('pointermove',event=>{
    if(!current||gesture&&gesture.id!==event.pointerId)return;
    if(gesture||anchor!==null){event.stopPropagation();preview(anchor??gesture.start,fractionAt(event));}
  });
  layer.addEventListener('pointerup',event=>{
    if(!current||gesture?.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    const started=gesture,last=fractionAt(event),dragged=Math.abs(event.clientX-started.x)>=4;
    gesture=null;if(layer.hasPointerCapture(event.pointerId))layer.releasePointerCapture(event.pointerId);
    if(dragged||anchor!==null)finish(anchor??started.start,last);
    else {anchor=last;preview(anchor);}
  });
  for(const type of ['pointercancel','lostpointercapture'])layer.addEventListener(type,event=>{
    if(gesture?.id!==event.pointerId)return;
    gesture=null;if(anchor===null)band.hidden=true;else preview(anchor);
  });
  layer.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();},{passive:false});
  // Completing the second click must not also open the series/axis editor.
  paper.addEventListener('dblclick',event=>{
    if(current||performance.now()<suppressDoubleClickUntil){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('keydown',event=>{
    if(!current)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();}
    else if(layer.contains(event.target)||banner.contains(event.target))event.stopPropagation();
  },true);
  cancelButton.addEventListener('click',()=>cancel());
  window.addEventListener('resize',layout);window.addEventListener('scroll',layout,true);
  return {
    get active(){return !!current;},cancel,layout,
    start(options){
      if(!Array.isArray(options.range)||options.range.length!==2||!options.range.every(Number.isFinite)||options.range[0]===options.range[1]||options.scale==='log'&&options.range.some(value=>value<=0))throw Error('このX軸では範囲を選択できません。');
      cancel({notify:false});current=options;anchor=gesture=null;
      banner.hidden=layer.hidden=false;band.hidden=true;paper.classList.add('selecting-x-range');
      message.textContent=`${options.label}：グラフ内の2点をクリック、または横方向にドラッグ（Escで中止）`;
      paper.scrollIntoView({block:'nearest'});
      layout();layer.focus({preventScroll:true});
    },
  };
}
