// Raster detail is determined by original pixels at the placed physical size.
export const IMPORT_DPI=300;
export function rasterResolution(asset,object){
 if(!asset||asset.mime==='image/svg+xml'||![asset.width,asset.height,object?.w,object?.h].every(n=>Number.isFinite(n)&&n>0))return null;
 const x=asset.width/(object.w/72),y=asset.height/(object.h/72);
 return {width:asset.width,height:asset.height,dpi:Math.min(x,y),dpiX:x,dpiY:y,widthAt300:asset.width/IMPORT_DPI*25.4,heightAt300:asset.height/IMPORT_DPI*25.4};
}
/** Keep at least twice the device-pixel detail needed by the current view. */
export function automaticPreviewQuality(asset,{width,height,pixelRatio=1}={}){
 if(asset?.mime==='image/svg+xml'||![width,height,asset?.width,asset?.height].every(n=>Number.isFinite(n)&&n>0))return 1;
 const ratio=Math.max(width/asset.width,height/asset.height)*Math.max(1,Number.isFinite(pixelRatio)?pixelRatio:1)*2;
 return ratio<=.25?.25:ratio<=.5?.5:1;
}
