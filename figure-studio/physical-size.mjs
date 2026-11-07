// SVG absolute lengths use CSS's 96 px/in. The Figure Studio document uses
// points (72 pt/in); never recover physical lengths from rounded naturalWidth.
const POINTS_PER_UNIT={pt:1,mm:72/25.4,cm:72/2.54,in:72,pc:12,px:72/96,'':72/96};
const MAX_POINTS=2000*72/25.4;
const validLength=value=>Number.isFinite(value)&&value>0&&value<=MAX_POINTS;

export function svgLengthInPoints(value){
 if(typeof value!=='string')return null;
 const match=/^\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(pt|mm|cm|in|pc|px)?\s*$/i.exec(value);
 if(!match)return null;
 const points=Number(match[1])*POINTS_PER_UNIT[(match[2]||'').toLowerCase()];
 return validLength(points)?points:null;
}

function viewBoxRatio(value){
 if(typeof value!=='string'||!value.trim())return null;
 const values=value.trim().split(/[\s,]+/).map(Number);
 if(values.length!==4||!values.every(Number.isFinite)||values[2]<=0||values[3]<=0)return null;
 const ratio=values[2]/values[3];
 return Number.isFinite(ratio)&&ratio>0?ratio:null;
}

export function svgPhysicalSize({width,height,viewBox}={}){
 let w=svgLengthInPoints(width),h=svgLengthInPoints(height);
 // A viewBox alone describes coordinates, not an intended physical size.
 // An explicitly invalid or percentage dimension must not be guessed around.
 if(w!==null&&h===null&&height==null){const ratio=viewBoxRatio(viewBox);if(ratio)h=w/ratio;}
 if(h!==null&&w===null&&width==null){const ratio=viewBoxRatio(viewBox);if(ratio)w=h*ratio;}
 return validLength(w)&&validLength(h)?{width:w,height:h}:null;
}

// MiFiTo explicitly distinguishes the cropped image body from annotation
// bands. Both are stored in document points after checking the SVG extents.
export function validatedMiFiToBodySize(body,physical){
 if(!body||!physical||![body.width,body.height,physical.width,physical.height].every(validLength)||body.width>physical.width||body.height>physical.height)return null;
 return {width:body.width,height:body.height};
}

export function svgMiFiToBodySize({bodyWidthMm,bodyHeightMm}={},physical){
 const number=/^\s*[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/;
 const length=value=>typeof value==='string'&&number.test(value)?svgLengthInPoints(`${value.trim()}mm`):null;
 return validatedMiFiToBodySize({width:length(bodyWidthMm),height:length(bodyHeightMm)},physical);
}
