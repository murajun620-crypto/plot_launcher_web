export function chooseProjectFileAction({kind,name,canBind=true},doc=globalThis.document){
  return new Promise(resolve=>{
    const dialog=doc.createElement('dialog');dialog.setAttribute('aria-label','プロジェクトの保存先');
    Object.assign(dialog.style,{width:'min(520px,calc(100vw - 32px))',boxSizing:'border-box',padding:'24px',border:'1px solid #b8cecb',borderRadius:'12px',color:'#163e39',background:'#fff',maxHeight:'calc(100vh - 32px)',overflow:'auto'});
    const heading=doc.createElement('h2');heading.style.cssText='font-size:18px;margin:0 0 12px';
    heading.textContent=kind==='permission'?'元ファイルへの保存を許可':kind==='new'?'元プロジェクトの保存先を選択':kind==='missing'?'このPCで元ファイルを選択':kind==='changed'?'元ファイルが更新されています':'元ファイルの内容を確認';dialog.append(heading);
    const file=doc.createElement('p');file.textContent=name;file.style.cssText='font-weight:600;overflow-wrap:anywhere';dialog.append(file);
    const detail=doc.createElement('p');detail.style.cssText='font-size:14px;line-height:1.7';
    detail.textContent=kind==='missing'?'このブラウザで元ファイルの保存先を確認できません。このPCのOneDriveなどから元ファイルを選ぶと、次回から上書き保存できます。':kind==='changed'?'元ファイルは、この編集を開始した時点と内容が異なります。OneDrive同期や別の編集で更新された可能性があります。「上書き」を選ぶと、元ファイルの変更をこの画面の編集内容で置き換えます。':'このプロジェクトでは元ファイルの版を確認できません。「上書き」を選ぶと、選択した元ファイルをこの画面の編集内容で置き換えます。';
    if(kind==='permission')detail.textContent='開いている内容をこの元プロジェクトに保存します。続けるには、ブラウザの上書き保存の許可が必要です。';
    if(kind==='new')detail.textContent='このプロジェクトの保存先を選択してください。保存先を確認してから、一括保存を続けます。';
    dialog.append(detail);const actions=doc.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:20px';dialog.append(actions);
    let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(value);};
    const button=(label,value,primary=false)=>{const node=doc.createElement('button');node.type='button';node.textContent=label;node.style.cssText=`padding:9px 12px;border:1px solid #9ebfba;border-radius:6px;cursor:pointer;background:${primary?'#137c70':'#fff'};color:${primary?'#fff':'#163e39'}`;node.addEventListener('click',()=>finish(value));actions.append(node);return node;};
    const cancel=button('キャンセル','cancel');button(kind==='new'?'保存先を選択':'名前を付けて保存','saveAs',kind==='new');
    if(kind==='missing'){if(canBind)button('元ファイルを選択して上書き','bind',true);}else if(kind==='permission')button('上書き保存を許可','allow',true);else if(kind!=='new')button('画面の内容で上書き','overwrite');
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish('cancel');});dialog.addEventListener('close',()=>{if(!done){done=true;dialog.remove();resolve('cancel');}});
    doc.body.append(dialog);dialog.showModal();cancel.focus();
  });
}
