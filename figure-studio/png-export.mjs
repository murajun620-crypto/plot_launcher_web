import {encodePNG} from './png-encoding.mjs?v=transparent-export-v0726-1';

/** Keep recompression off the editor thread. A failure still permits saving. */
export async function preparePNG(blob,dpi){
 if(typeof Worker!=='function')return encodePNG(blob,dpi);
 try{
  return await new Promise((resolve,reject)=>{
   const worker=new Worker(new URL('./png-export-worker.mjs?v=transparent-export-v0726-1',import.meta.url),{type:'module'});
   const finish=(error,value)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
   const timer=setTimeout(()=>finish(Error('PNG圧縮がタイムアウトしました。')),30000);
   worker.onmessage=event=>event.data.blob instanceof Blob?finish(null,event.data.blob):finish(Error(event.data.error||'PNG圧縮に失敗しました。'));
   worker.onerror=()=>finish(Error('PNG圧縮を開始できませんでした。'));
   try{worker.postMessage({blob,dpi});}catch(error){finish(error);}
  });
 }catch{return encodePNG(blob,dpi,{compress:false});}
}
