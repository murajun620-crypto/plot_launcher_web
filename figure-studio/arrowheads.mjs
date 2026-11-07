// PowerPoint's public arrowhead enums define these styles and three width/length
// levels. Geometry is Figure Studio's own (not a pixel-for-pixel Office renderer).
// https://learn.microsoft.com/en-us/office/vba/api/office.msoarrowheadstyle
export const ARROW_STYLES=Object.freeze(['none','triangle','open','stealth','diamond','oval']);
export const ARROW_WIDTHS=Object.freeze(['narrow','medium','wide']);
export const ARROW_LENGTHS=Object.freeze(['short','medium','long']);
export const ARROW_PROPERTIES=Object.freeze(Object.fromEntries(['Start','End'].flatMap(end=>[
 [`arrow${end}Style`,ARROW_STYLES],[`arrow${end}Width`,ARROW_WIDTHS],[`arrow${end}Length`,ARROW_LENGTHS]
])));

/** Resolve old boolean-only projects without mutating or migrating them. */
export function arrowEndpoint(object,end){
 const prefix=end==='start'?'arrowStart':'arrowEnd';
 const fallback=object.type==='arrow'&&(end==='start'?object.arrowStart===true:object.arrowEnd!==false)?'triangle':'none';
 return {
  style:ARROW_STYLES.includes(object[`${prefix}Style`])?object[`${prefix}Style`]:fallback,
  width:ARROW_WIDTHS.includes(object[`${prefix}Width`])?object[`${prefix}Width`]:'medium',
  length:ARROW_LENGTHS.includes(object[`${prefix}Length`])?object[`${prefix}Length`]:'medium'
 };
}

export function arrowPropertyValue(object,property){
 if(!Object.hasOwn(ARROW_PROPERTIES,property))return undefined;
 const end=property.startsWith('arrowStart')?'start':'end';
 return arrowEndpoint(object,end)[property.endsWith('Style')?'style':property.endsWith('Width')?'width':'length'];
}

/** Set one setting, preserving the other endpoint when a plain line becomes an arrow. */
export function setArrowProperty(object,property,value){
 if(!['line','arrow'].includes(object.type)||!Object.hasOwn(ARROW_PROPERTIES,property)||!ARROW_PROPERTIES[property].includes(value))return false;
 for(const end of ['start','end']){
  const config=arrowEndpoint(object,end),prefix=end==='start'?'arrowStart':'arrowEnd';
  for(const [key,suffix]of [['style','Style'],['width','Width'],['length','Length']])object[prefix+suffix]=config[key];
 }
 object[property]=value;
 object.arrowStart=object.arrowStartStyle!=='none';object.arrowEnd=object.arrowEndStyle!=='none';
 if(object.arrowStart||object.arrowEnd)object.type='arrow';
 return true;
}

const widthScale={narrow:.65,medium:1,wide:1.5},lengthScale={short:.65,medium:1,long:1.6};
const trimRatio={none:0,triangle:1,open:0,stealth:.65,diamond:.5,oval:.5};

/** SVG descriptors in the object's local coordinates. The caller applies object rotation. */
export function arrowGeometry(object){
 const dx=object.w,dy=object.h,distance=Math.hypot(dx,dy),strokeWidth=object.strokeWidth??1;
 const shaft={x1:0,y1:0,x2:dx,y2:dy};
 if(!Number.isFinite(distance)||distance<1e-9||strokeWidth<=0)return{shaft,heads:[]};
 const ux=dx/distance,uy=dy/distance,baseLength=Math.max(6,strokeWidth*4),heads=[];
 let startTrim=0,endTrim=0;
 for(const end of ['start','end']){
  const config=arrowEndpoint(object,end);if(config.style==='none')continue;
  const width=baseLength*.84*widthScale[config.width],half=width/2;
  // Keep the historic "oval" project value, but display a true circle. Width
  // selects its diameter; a retained length preference cannot distort it.
  const length=config.style==='oval'?width:baseLength*lengthScale[config.length];
  const angle=Math.atan2(end==='start'?-dy:dy,end==='start'?-dx:dx)*180/Math.PI;
  const x=end==='start'?0:dx,y=end==='start'?0:dy;
  const attrs={transform:`translate(${x} ${y}) rotate(${angle})`,fill:object.stroke??'#263b44','pointer-events':'visiblePainted'};
  let tag='polygon';
  if(config.style==='triangle')attrs.points=`0,0 ${-length},${half} ${-length},${-half}`;
  else if(config.style==='stealth')attrs.points=`0,0 ${-length},${half} ${-length*.65},0 ${-length},${-half}`;
  else if(config.style==='diamond')attrs.points=`0,0 ${-length/2},${half} ${-length},0 ${-length/2},${-half}`;
  else if(config.style==='oval'){tag='circle';Object.assign(attrs,{cx:-half,cy:0,r:half});}
  else if(config.style==='open'){tag='polyline';Object.assign(attrs,{points:`${-length},${half} 0,0 ${-length},${-half}`,fill:'none',stroke:object.stroke??'#263b44','stroke-width':strokeWidth,'stroke-linecap':'round','stroke-linejoin':'round'});}
  heads.push({end,style:config.style,length,width,angle,x,y,tag,attrs});
  if(end==='start')startTrim=length*trimRatio[config.style];else endTrim=length*trimRatio[config.style];
 }
 // Short arrows may have overlapping heads; never reverse the shaft between them.
 const trimScale=Math.min(1,distance/Math.max(startTrim+endTrim,1e-9));
 shaft.x1=ux*startTrim*trimScale;shaft.y1=uy*startTrim*trimScale;
 shaft.x2=dx-ux*endTrim*trimScale;shaft.y2=dy-uy*endTrim*trimScale;
 return{shaft,heads};
}
