const installed=new WeakMap();

/** Preview handlers own modified-wheel zoom; elsewhere it must not zoom chrome. */
export function installBrowserZoomGuard(documentRef=globalThis.document){
 if(!documentRef?.addEventListener)return ()=>{};
 if(installed.has(documentRef))return installed.get(documentRef);
 const preventPageZoom=event=>{if(event.cancelable&&(event.ctrlKey||event.metaKey))event.preventDefault();};
 // A document listener is passive by default in Chromium unless opted out.
 // Do not stop propagation: each preview keeps its own zoom/anchor handling.
 documentRef.addEventListener('wheel',preventPageZoom,{passive:false});
 const remove=()=>{documentRef.removeEventListener('wheel',preventPageZoom);installed.delete(documentRef);};
 installed.set(documentRef,remove);return remove;
}
