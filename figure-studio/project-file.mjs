/** File targets are scoped to the Figure book ID; the app restores persisted handles. */
export function projectFilePickerOptions({name,startIn,open=false}={}){
  return {id:'figure-studio-project',types:[{description:'Figure Studioプロジェクト',accept:{'application/json':open?['.figurestudio','.json']:['.figurestudio']}}],...(name?{suggestedName:name}:{}),...(startIn?{startIn}:{}),...(open?{multiple:false}:{})};
}

export async function prepareProjectSave({handle=null,saveAs=false,name,startIn,fallback},host=globalThis){
  let target=saveAs?null:handle;
  if(target){
    const options={mode:'readwrite'};
    if(typeof target.queryPermission==='function'&&await target.queryPermission(options)!=='granted'){
      if(typeof target.requestPermission!=='function'||await target.requestPermission(options)!=='granted')throw Error('上書き保存が許可されていません。「名前を付けて保存」で保存先を選び直してください。');
    }
  }else if(typeof host.showSaveFilePicker==='function'){
    target=await host.showSaveFilePicker(projectFilePickerOptions({name,startIn}));
  }else{
    if(typeof fallback!=='function')throw Error('このブラウザではファイルを保存できません。');
    return {handle:null,name,write:blob=>fallback(blob,name)};
  }
  return {handle:target,name:target.name,async write(blob){
    const writer=await target.createWritable();
    try{await writer.write(blob);await writer.close();}
    catch(error){try{await writer.abort();}catch{}throw error;}
    return target.name;
  }};
}

export class ProjectFileSession{
  #targets=new Map();
  constructor({host=globalThis,fallback}={}){this.host=host;this.fallback=fallback;}
  target(bookId){return this.#targets.get(bookId)??null;}
  opened(bookId,{handle=null,name=''}){this.#targets.set(bookId,{handle,name});}
  async prepare({bookId,name,saveAs=false}){
    const previous=this.target(bookId);
    const target=await prepareProjectSave({handle:previous?.handle,saveAs,name:previous?.name||name,startIn:previous?.handle,fallback:this.fallback},this.host);
    return {bookId,target};
  }
  async write({bookId,target},{revision,blob}){
    await target.write(blob);
    // A failed/cancelled Save As must never replace a working original target.
    this.#targets.set(bookId,{handle:target.handle,name:target.name});
    return {bookId,revision,handle:target.handle,name:target.name};
  }
  async save({bookId,revision,blob,name,saveAs=false}){return this.write(await this.prepare({bookId,name,saveAs}),{revision,blob});}
}
