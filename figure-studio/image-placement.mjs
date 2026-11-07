import {mm} from './model.mjs';

const validSize=size=>size&&[size.width,size.height].every(n=>Number.isFinite(n)&&n>0&&n<=mm(2000));

// SVG dimensions are in points, just like the Figure Studio document. Never
// shrink a physical-size figure merely because it exceeds the current page.
export function importedImageSize(image,page,mode='image'){
 if((mode==='image'||mode==='plot')&&validSize(image.physicalSize))return {w:image.physicalSize.width,h:image.physicalSize.height};
 const s=mode==='image'?Math.min(mm(70),page.width*.42)/image.width:Math.min(mm(85)/image.width,page.width*.65/image.width,page.height*.65/image.height);
 return {w:image.width*s,h:image.height*s};
}

export function replacedImageSize(app,panel,previous,next){
 if(app!=='plot'||!validSize(previous)||!validSize(next))return {w:panel.w,h:panel.h};
 // Retain deliberate resizing in Studio, while allowing labels and margins to
// change the outer image dimensions without changing the scale of its axes.
 return {w:panel.w*next.width/previous.width,h:panel.h*next.height/previous.height};
}

export function imageInsertionPoint(page,size,offset=0){
 return {x:Math.max(0,Math.min(mm(10)+offset,page.width-size.w)),y:Math.max(0,Math.min(mm(10)+offset,page.height-size.h))};
}
