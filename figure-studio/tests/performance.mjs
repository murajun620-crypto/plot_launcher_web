import {newDocument,makeObject,bounds,objectBounds,validateDocument} from '../model.mjs';

const SVG_NS='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
const stage=$('benchmarkCanvas'),root=$('benchmarkObjects'),overlay=$('benchmarkOverlay');
const runButton=$('runBenchmark'),stopButton=$('stopBenchmark'),status=$('benchmarkStatus');
const FRAME_COUNT=120,WARMUP_FRAMES=12;
const doc={...newDocument(),name:'Synthetic performance scene',width:1000,height:710};
const nodes=new Map(),sources=[];
let running=false,cancelRequested=false,visibilityAborted=false;

function element(name,attributes={},text){
  const node=document.createElementNS(SVG_NS,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  if(text!==undefined)node.textContent=text;
  return node;
}

function syntheticImage(index){
  const points=Array.from({length:42},(_,i)=>{
    const x=16+i*3.55,y=83-40*(1-Math.exp(-i/(9+index%5)))+8*Math.sin(i*.36+index*.4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const svg=`<svg xmlns="${SVG_NS}" width="180" height="112" viewBox="0 0 180 112"><rect width="180" height="112" fill="#fbfcfc"/><path d="M16 15V91H168M16 53H168" stroke="#cddadd" fill="none"/><polyline points="${points}" fill="none" stroke="#087d82" stroke-width="1.8"/><g fill="#607d84" font-size="7" font-family="Arial"><text x="14" y="103">0</text><text x="145" y="103">100</text><text x="98" y="13">SIMULATED</text></g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

function addObject(object,content){
  doc.objects.push(object);
  const group=element('g',{'data-benchmark-id':object.id,transform:`translate(${object.x} ${object.y})`});
  group.append(content);nodes.set(object.id,group);root.append(group);
}

for(let i=0;i<20;i++){
  const x=42+(i%5)*187,y=44+Math.floor(i/5)*162;
  const dataUrl=syntheticImage(i);sources.push(dataUrl);
  addObject(makeObject('image',{id:`image-${i}`,x,y,w:168,h:104}),element('image',{width:168,height:104,href:dataUrl}));
  for(let j=0;j<4;j++){
    const labels=[String.fromCharCode(97+i),`Condition ${i+1}`,'Time (a.u.)','n = 12'];
    const positions=[[0,-13],[17,-13],[56,119],[120,119]];
    const text=makeObject('text',{id:`text-${i}-${j}`,x:x+positions[j][0],y:y+positions[j][1],w:j===0?12:90,h:13,fontSize:j===0?12:9,text:labels[j]});
    addObject(text,element('text',{x:0,y:10,'font-size':text.fontSize,'font-family':'Arial',fill:'#274a54','font-weight':j===0?'700':'400'},text.text));
  }
  const arrow=makeObject('arrow',{id:`arrow-${i}`,x:x+122,y:y+28,w:-18,h:20,strokeWidth:1.2});
  const parts=element('g');parts.append(element('line',{x1:0,y1:0,x2:arrow.w,y2:arrow.h,stroke:'#9a6541','stroke-width':1.2}),element('polygon',{points:'-18,20 -17,13 -11,18',fill:'#9a6541'}));
  addObject(arrow,parts);
}
validateDocument(doc);
const origins=doc.objects.map(o=>({id:o.id,x:o.x,y:o.y}));

function drawOverlay(){
  overlay.replaceChildren();
  // The application redraws per-object selection bounds during group dragging.
  for(const object of doc.objects){
    const b=objectBounds(object);
    overlay.append(element('rect',{x:b.x,y:b.y,width:b.w,height:b.h,'stroke-width':.35,'stroke-dasharray':'2 3',opacity:.45}));
  }
  const all=bounds(doc.objects);
  overlay.append(element('rect',{x:all.x,y:all.y,width:all.w,height:all.h,'stroke-width':.8}));
}
drawOverlay();

function updateScene(frame){
  const t=frame/FRAME_COUNT*Math.PI*2,dx=Math.sin(t)*13,dy=Math.cos(t)*10;
  for(let i=0;i<doc.objects.length;i++){
    const object=doc.objects[i],origin=origins[i];
    object.x=origin.x+dx;object.y=origin.y+dy;
    nodes.get(object.id).setAttribute('transform',`translate(${object.x} ${object.y})`);
  }
  drawOverlay();
}

function stats(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return {
    averageMs:values.reduce((sum,v)=>sum+v,0)/values.length,
    maximumMs:Math.max(...values),
    medianMs:sorted[Math.floor(sorted.length/2)],
    p95Ms:sorted[Math.ceil(sorted.length*.95)-1],
  };
}
const round=value=>Number(value.toFixed(3));
const roundStats=value=>Object.fromEntries(Object.entries(value).map(([key,n])=>[key,round(n)]));

async function preload(){
  await Promise.all(sources.map(source=>{const image=new Image();image.src=source;return image.decode();}));
  await document.fonts.ready;
}

function measureFrames(){
  return new Promise((resolve,reject)=>{
    let remainingWarmup=WARMUP_FRAMES,previous=null,measured=0;
    const intervals=[],updates=[];
    const startedAt=performance.now();
    function tick(timestamp){
      if(cancelRequested||document.hidden||visibilityAborted){reject(new Error(document.hidden||visibilityAborted?'タブが背面になったため測定を中止しました。前面で再実行してください。':'測定を中止しました。'));return;}
      if(remainingWarmup>0){
        updateScene(WARMUP_FRAMES-remainingWarmup);remainingWarmup--;previous=timestamp;
        requestAnimationFrame(tick);return;
      }
      intervals.push(timestamp-previous);previous=timestamp;
      const updateStarted=performance.now();updateScene(measured);
      updates.push(performance.now()-updateStarted);
      measured++;
      if(measured%15===0)$('benchmarkProgress').value=measured;
      if(measured<FRAME_COUNT)requestAnimationFrame(tick);
      else resolve({intervals,updates,totalElapsedMs:performance.now()-startedAt});
    }
    requestAnimationFrame(tick);
  });
}

runButton.addEventListener('click',async()=>{
  if(running)return;
  running=true;cancelRequested=false;visibilityAborted=false;runButton.disabled=true;stopButton.disabled=false;
  $('benchmarkProgress').value=0;
  for(const id of ['metricFrameAverage','metricFrameMaximum','metricFrameP95','metricUpdateAverage','metricUpdateMaximum'])$(id).textContent='—';
  $('benchmarkResults').dataset.complete='false';
  $('benchmarkResults').textContent='測定中';
  status.textContent='模擬素材を読み込んでいます…';
  try{
    await preload();
    if(document.hidden)throw new Error('タブを前面にして実行してください。');
    status.textContent='測定中 · 120要素を移動しています。';
    const measurement=await measureFrames(),frameStats=stats(measurement.intervals),updateStats=stats(measurement.updates);
    const result={
      benchmark:'Figure Studio synthetic SVG group drag',
      version:1,
      sampleCount:FRAME_COUNT,
      warmupFrames:WARMUP_FRAMES,
      scene:{images:20,text:80,arrows:20,movingObjects:120,source:'small synthetic SVG data URIs, preloaded',canvasViewBox:[1000,710]},
      frameIntervals:roundStats(frameStats),
      javascriptUpdates:roundStats(updateStats),
      intervalsOver1_5xMedian:measurement.intervals.filter(v=>v>frameStats.medianMs*1.5).length,
      elapsedIncludingWarmupMs:round(measurement.totalElapsedMs),
      viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
      measuredAt:new Date().toISOString(),
      limitations:'Synthetic isolated scene; not actual editor QA or an input-to-display latency/GPU completion measurement. Large image loading, save/export and app integration excluded.',
      samples:{frameIntervalMs:measurement.intervals.map(round),javascriptUpdateMs:measurement.updates.map(round)},
    };
    $('metricFrameAverage').textContent=frameStats.averageMs.toFixed(2);
    $('metricFrameMaximum').textContent=frameStats.maximumMs.toFixed(2);
    $('metricFrameP95').textContent=frameStats.p95Ms.toFixed(2);
    $('metricUpdateAverage').textContent=updateStats.averageMs.toFixed(2);
    $('metricUpdateMaximum').textContent=updateStats.maximumMs.toFixed(2);
    $('benchmarkResults').textContent=JSON.stringify(result,null,2);
    $('benchmarkResults').dataset.complete='true';
    status.textContent=`測定完了 · ${FRAME_COUNT}フレーム · 中央値の1.5倍を超えた間隔: ${result.intervalsOver1_5xMedian}回`;
    $('benchmarkProgress').value=FRAME_COUNT;
  }catch(error){
    status.textContent=error.message;
    $('benchmarkResults').textContent=JSON.stringify({completed:false,message:error.message},null,2);
    $('benchmarkResults').dataset.complete='false';
  }finally{
    for(let i=0;i<doc.objects.length;i++){
      Object.assign(doc.objects[i],{x:origins[i].x,y:origins[i].y});
      nodes.get(doc.objects[i].id).setAttribute('transform',`translate(${origins[i].x} ${origins[i].y})`);
    }
    drawOverlay();running=false;runButton.disabled=false;stopButton.disabled=true;
  }
});
stopButton.addEventListener('click',()=>{cancelRequested=true;});
document.addEventListener('visibilitychange',()=>{if(running&&document.hidden)visibilityAborted=true;});
