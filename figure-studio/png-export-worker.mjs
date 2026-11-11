import {encodePNG} from './png-encoding.mjs?v=transparent-export-v0726-1';
self.onmessage=async event=>{
 try{self.postMessage({blob:await encodePNG(event.data.blob,event.data.dpi)});}
 catch(error){self.postMessage({error:error.message});}
};
