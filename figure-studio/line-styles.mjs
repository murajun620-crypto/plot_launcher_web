// Ratios are in stroke widths, so previews and physical exports scale together.
export const LINE_STYLES=Object.freeze([
 {value:'solid',label:'実線',pattern:null,cap:'round'},
 {value:'round-dot',label:'丸点線',pattern:[0,3],cap:'round'},
 {value:'square-dot',label:'角点線',pattern:[1,2],cap:'butt'},
 {value:'dash',label:'破線',pattern:[4,3],cap:'butt'},
 {value:'long-dash',label:'長い破線',pattern:[8,3],cap:'butt'},
 {value:'dash-dot',label:'一点鎖線',pattern:[4,2,1,2],cap:'butt'},
 {value:'long-dash-dot',label:'長い一点鎖線',pattern:[8,2,1,2],cap:'butt'},
 {value:'dash-dot-dot',label:'二点鎖線',pattern:[4,2,1,2,1,2],cap:'butt'},
 {value:'long-dash-dot-dot',label:'長い二点鎖線',pattern:[8,2,1,2,1,2],cap:'butt'},
].map(style=>Object.freeze({...style,pattern:style.pattern&&Object.freeze(style.pattern)})));
const byValue=new Map(LINE_STYLES.map(style=>[style.value,style]));
export const supportsLineStyle=object=>['line','arrow','rect','ellipse','curve','freeform','arc'].includes(object?.type);
export const isLineStyle=value=>byValue.has(value);
export function lineStyleValue(object){return isLineStyle(object?.dashStyle)?object.dashStyle:object?.dashed?'dash':'solid';}
export function lineStrokeAttributes(object){
 const style=byValue.get(lineStyleValue(object)),width=Number.isFinite(object.strokeWidth)?Math.max(0,object.strokeWidth):1;
 return {'stroke-dasharray':style.pattern&&width>0?style.pattern.map(part=>Number((part*width).toFixed(8))).join(' '):undefined,
  'stroke-linecap':object.dashStyle===undefined?'round':style.cap};
}
export function setLineStyle(object,value){
 if(!supportsLineStyle(object)||!isLineStyle(value))return false;
 object.dashStyle=value;object.dashed=value!=='solid';return true;
}
