// Bridge MathJax's character metrics/native-text hook to the selected CSS font.
// Structural/stretchy math symbols retain MathJax's vector geometry.
const nativeText=text=>[...text].map(c=>c.codePointAt(0)>=0x1d400&&c.codePointAt(0)<=0x1d7ff?c.normalize('NFKD'):c).join('');
export function usesNativeMathFont(variant,code){
 code=nativeText(String.fromCodePoint(code)).codePointAt(0);
 return !/size|fraktur|script|calligraphic|double-struck|monospace/i.test(variant||'')&&
  ((code>=0x20&&code<=0x2ff)||(code>=0x370&&code<=0x3ff)||[0x2212,0x00d7,0x00f7,0x00b1].includes(code));
}
export function mathFontStyle(object,variant='normal'){
 return {family:object.fontFamily||'Arial',italic:!!object.italic||/italic|mathit/.test(variant),bold:!!object.bold||/bold/.test(variant)};
}
export function installNativeMathFont(output,object,{documentRef=globalThis.document,measure}={}){
 const context=measure?null:documentRef?.createElement('canvas')?.getContext('2d');
 if(!measure&&!context)throw Error('数式のフォントを計測できません。');
 const original={getChar:output.font.getChar,unknownText:output.unknownText,measure:output.measureTextNode,cache:output.unknownCache};
 const metrics=new Map();
 function metric(text,variant){
  text=nativeText(text);
  const key=variant+'\0'+text;if(metrics.has(key))return metrics.get(key);
  const style=mathFontStyle(object,variant);let value;
  if(measure)value=measure(text,style);
  else {context.font=`${style.italic?'italic ':''}${style.bold?'bold ':''}1000px ${style.family}`;const m=context.measureText(text);value={w:m.width/1000,h:Math.max(0,m.actualBoundingBoxAscent||750)/1000,d:Math.max(0,m.actualBoundingBoxDescent||0)/1000};}
  if(![value.w,value.h,value.d].every(Number.isFinite))throw Error('数式のフォントサイズが不正です。');
  metrics.set(key,value);return value;
 }
 output.unknownCache=new Map();
 output.font.getChar=function(variant,code){
  if(!usesNativeMathFont(variant,code))return original.getChar.call(this,variant,code);
  const m=metric(String.fromCodePoint(code),variant);return [m.h,m.d,m.w,{unknown:true}];
 };
 output.unknownText=function(text,variant){
  if(![...text].every(c=>usesNativeMathFont(variant,c.codePointAt(0))))return original.unknownText.call(this,text,variant);
  const style=mathFontStyle(object,variant);text=nativeText(text);
  return this.svg('text',{'data-studio-native-font':variant,'font-family':style.family,'font-size':1000,'font-style':style.italic?'italic':'normal','font-weight':style.bold?'700':'400',transform:'scale(1,-1)'},[this.text(text)]);
 };
 output.measureTextNode=function(node){
  const variant=this.adaptor.getAttribute(node,'data-studio-native-font');
  return variant!=null?metric(this.adaptor.textContent(node),variant):original.measure.call(this,node);
 };
 let restored=false;return ()=>{if(restored)return;restored=true;output.font.getChar=original.getChar;output.unknownText=original.unknownText;output.measureTextNode=original.measure;output.unknownCache=original.cache;};
}
