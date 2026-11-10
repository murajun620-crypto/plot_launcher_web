// File IO reports real byte counts. Parsing/rendering stay indeterminate when
// the underlying reader cannot report a meaningful fraction of the work.
export function createFileProgress({documentRef=globalThis.document}={}){
 const view=documentRef.defaultView,card=documentRef.createElement('aside');
 card.id='file-open-progress';card.className='file-open-progress';card.hidden=true;
 card.setAttribute('popover','manual');card.setAttribute('role','status');card.setAttribute('aria-live','polite');card.setAttribute('aria-label','ファイル読み込み状況');
 card.innerHTML='<div class="file-progress-heading"><strong></strong><button type="button" aria-label="読み込み結果を閉じる" hidden>×</button></div><div class="file-progress-name"></div><div class="file-progress-stage"></div><div class="file-progress-rail"><progress max="1" aria-label="ファイル読み込みの進行状況"></progress><span class="file-progress-runner" aria-hidden="true"></span></div><div class="file-progress-count"></div>';
 documentRef.body.append(card);
 const title=card.querySelector('strong'),name=card.querySelector('.file-progress-name'),phase=card.querySelector('.file-progress-stage'),bar=card.querySelector('progress'),rail=card.querySelector('.file-progress-rail'),count=card.querySelector('.file-progress-count'),closeButton=card.querySelector('button');
 let current=null,timer;
 function hide(){try{card.hidePopover?.();}catch{}card.hidden=true;}
 function show(){card.hidden=false;try{card.showPopover?.();}catch{card.removeAttribute('popover');}}
 closeButton.addEventListener('click',hide);
 function paint(){return new Promise(resolve=>{const fallback=setTimeout(resolve,60);view.requestAnimationFrame?.(()=>view.requestAnimationFrame(()=>{clearTimeout(fallback);resolve();}));});}
 function begin(files,{label='ファイルを開いています'}={}){
  clearTimeout(timer);if(current)current.alive=false;
  files=Array.isArray(files)?files:[files];files=files.filter(Boolean);
  const sizes=new Map();let totalBytes=files.reduce((sum,file)=>sum+(file.size||0),0);
  const task={alive:true,renderRevision:null,paused:false,
   stage(text,{completed,total,unit=''}={}){
    if(!task.alive||current!==task)return;
    title.textContent=label;phase.textContent=text;delete card.dataset.kind;closeButton.hidden=true;
    if(Number.isFinite(completed)&&Number.isFinite(total)&&total>0){bar.value=Math.max(0,Math.min(1,completed/total));count.textContent=`${completed} / ${total}${unit}`;}
    else{bar.removeAttribute('value');count.textContent='処理中です。しばらくお待ちください。';}
    if(!task.paused)show();
   },
   pause(){if(task.alive&&current===task){task.paused=true;hide();}},
   resume(text){if(task.alive&&current===task){task.paused=false;task.stage(text);}},
   paint,
   setReadFiles(items){sizes.clear();totalBytes=items.reduce((sum,file)=>sum+file.size,0);},
   async read(file,{text=false}={}){
    task.stage('ファイルの内容を読み込んでいます…');await paint();
    return new Promise((resolve,reject)=>{
     const reader=new view.FileReader();
     const update=loaded=>{
      if(!task.alive||current!==task)return;
      sizes.set(file,Math.min(file.size,loaded));
      const bytes=[...sizes.values()].reduce((a,b)=>a+b,0),fraction=totalBytes>0?Math.min(1,bytes/totalBytes):0;
      bar.value=fraction;count.textContent=`ファイルの読み込み ${Math.round(fraction*100)}%`;
     };
     reader.onprogress=event=>{if(event.lengthComputable)update(event.loaded);};
     reader.onload=()=>{update(file.size);resolve(reader.result);};
     reader.onerror=()=>reject(reader.error||new Error('ファイルを読み込めませんでした。'));
     reader.onabort=()=>reject(new view.DOMException('読み込みをキャンセルしました。','AbortError'));
     if(text)reader.readAsText(file);else reader.readAsArrayBuffer(file);
    });
   },
   waitForRender(revision){task.renderRevision=revision;task.stage('グラフを描画しています…');},
   finish(){if(!task.alive||current!==task)return;task.alive=false;title.textContent='ファイルを開きました';phase.textContent='完了';bar.value=1;count.textContent='';closeButton.hidden=false;card.dataset.kind='complete';timer=setTimeout(hide,700);},
   fail(error){if(!task.alive||current!==task)return;task.alive=false;title.textContent=task.renderRevision!==null?'グラフを描画できませんでした':'ファイルを開けませんでした';phase.textContent=error?.message||String(error);rail.hidden=true;count.textContent='';closeButton.hidden=false;card.dataset.kind='error';show();},
   cancel(){if(current!==task)return;task.alive=false;hide();},
   release(){if(task.alive&&task.renderRevision===null)task.cancel();},
  };
  current=task;name.textContent=files.map(file=>file.name||file.filename||'データ').join('、');name.title=name.textContent;rail.hidden=false;
  task.stage('読み込みを準備しています…');return task;
 }
 return {begin,get current(){return current?.alive?current:null;},
  rendering(revision){if(current?.alive&&current.renderRevision!==null)current.waitForRender(revision);},
  rendered(revision,error){if(current?.alive&&current.renderRevision===revision){if(error)current.fail(error);else current.finish();}},
 };
}
