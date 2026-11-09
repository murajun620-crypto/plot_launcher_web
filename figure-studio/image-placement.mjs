import {mm} from './model.mjs?v=nested-groups-v0712-1';
import {validatedMiFiToBodySize} from './physical-size.mjs?v=0.3.5-1';
import {IMPORT_DPI} from './image-resolution.mjs?v=image-quality-v066-1';

const validSize=size=>size&&[size.width,size.height].every(n=>Number.isFinite(n)&&n>0&&n<=mm(2000));

// SVG dimensions are in points, just like the Figure Studio document. Never
// shrink a physical-size figure merely because it exceeds the current page.
export function importedImageSize(image,page,mode='image'){
 if((mode==='image'||mode==='plot'||(mode==='mifito'&&validatedMiFiToBodySize(image.mifitoBodySize,image.physicalSize)))&&validSize(image.physicalSize))return {w:image.physicalSize.width,h:image.physicalSize.height};
 // Small clipboard bitmaps must not be enlarged to the usual 70 mm panel.
 const s=mode==='image'?Math.min(mm(70)/image.width,page.width*.42/image.width,image.mime==='image/svg+xml'?Infinity:72/IMPORT_DPI):Math.min(mm(85)/image.width,page.width*.65/image.width,page.height*.65/image.height);
 return {w:image.width*s,h:image.height*s};
}

export function replacedImageSize(app,panel,previous,next){
 if(app!=='plot'||!validSize(previous)||!validSize(next))return {w:panel.w,h:panel.h};
 // Retain deliberate resizing in Studio, while allowing labels and margins to
// change the outer image dimensions without changing the scale of its axes.
 return {w:panel.w*next.width/previous.width,h:panel.h*next.height/previous.height};
}

export function replacedMiFiToImageSize(panel,previousPhysical,nextPhysical,previousBody,nextBody){
 if(!validatedMiFiToBodySize(nextBody,nextPhysical))return {w:panel.w,h:panel.h};
 // An explicit size in MiFiTo is authoritative on every send. Multiplying it
 // by an old Studio scale would turn a requested 70 mm into (for example) 122 mm.
 return {w:nextPhysical.width,h:nextPhysical.height};
}

export function miFiToSizeCorrection(panel,physical,body){
 if(!validatedMiFiToBodySize(body,physical))return null;
 const size=replacedMiFiToImageSize(panel,null,physical,null,body);
 return Math.abs(size.w-panel.w)>1e-6||Math.abs(size.h-panel.h)>1e-6?size:null;
}

export function imageInsertionPoint(page,size,offset=0){
 return {x:Math.max(0,Math.min(mm(10)+offset,page.width-size.w)),y:Math.max(0,Math.min(mm(10)+offset,page.height-size.h))};
}
