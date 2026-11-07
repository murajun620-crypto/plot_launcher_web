const PATH_TYPES=new Set(['curve','freeform','arc']);
const COORDINATE_LIMIT=1e6,MIN_EXTENT=.001;
export const PATH_POINT_LIMITS=Object.freeze({curve:1500,freeform:2000});
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const fail=()=>{throw Error('曲線・フリーフォーム・円弧の設定が不正です。');};
export const isPathObject=object=>PATH_TYPES.has(object?.type);

/** Shared validation for project loading and safe local SVG path generation. */
export function validatePathObject(object){
 if(!isPathObject(object))fail();
 if(!finite(object.w,Number.MIN_VALUE,COORDINATE_LIMIT)||!finite(object.h,Number.MIN_VALUE,COORDINATE_LIMIT))fail();
 if(object.closed!==undefined&&typeof object.closed!=='boolean')fail();
 if(object.type==='arc'){
  const start=object.startAngle===undefined?0:object.startAngle,end=object.endAngle===undefined?180:object.endAngle;
  if(!finite(start,-3600,3600)||!finite(end,-3600,3600)||start===end)fail();
 }else{
  if(!Array.isArray(object.points)||object.points.length<2||object.points.length>PATH_POINT_LIMITS[object.type])fail();
  for(const point of object.points)if(!point||!finite(point.x,0,1)||!finite(point.y,0,1))fail();
 }
 return object;
}

// Six decimals avoid trigonometric noise and never emit unsafe attribute text.
const number=value=>String(Math.round(value*1e6)/1e6||0);
const pair=point=>`${number(point.x)} ${number(point.y)}`;
function arcData(object){
 const start=object.startAngle===undefined?0:object.startAngle,end=object.endAngle===undefined?180:object.endAngle;
 const delta=end-start,sweep=delta>0?1:0,rx=object.w/2,ry=object.h/2;
 const point=angle=>{const radians=(angle%360)*Math.PI/180;return {x:rx+rx*Math.cos(radians),y:ry+ry*Math.sin(radians)};};
 const first=point(start),radii=`${number(rx)} ${number(ry)}`;
 if(Math.abs(delta)>=360){
  const middle=point(start+(sweep?180:-180));
  return `M ${pair(first)} A ${radii} 0 0 ${sweep} ${pair(middle)} A ${radii} 0 0 ${sweep} ${pair(first)}${object.closed?' Z':''}`;
 }
 return `M ${pair(first)} A ${radii} 0 ${Math.abs(delta)>180?1:0} ${sweep} ${pair(point(end))}${object.closed?' Z':''}`;
}

/** Local coordinates: the caller's outer group applies translation/rotation. */
export function pathData(object){
 if(!isPathObject(object))return '';
 validatePathObject(object);
 if(object.type==='arc')return arcData(object);
 let points=object.points.map(point=>({x:point.x*object.w,y:point.y*object.h}));
 if(object.closed&&points.length>2&&points[0].x===points.at(-1).x&&points[0].y===points.at(-1).y)points=points.slice(0,-1);
 const commands=[`M ${pair(points[0])}`];
 if(object.type==='freeform')for(const point of points.slice(1))commands.push(`L ${pair(point)}`);
 else{
  // Uniform Catmull–Rom interpolation, converted to cubic Bezier segments.
  // Open ends duplicate their nearest vertex; closed paths wrap both tangents.
  const count=points.length,segments=object.closed?count:count-1;
  const at=index=>object.closed?points[(index+count)%count]:points[Math.max(0,Math.min(count-1,index))];
  for(let index=0;index<segments;index++){
   const p0=at(index-1),p1=at(index),p2=at(index+1),p3=at(index+2);
   const first={x:p1.x+(p2.x-p0.x)/6,y:p1.y+(p2.y-p0.y)/6};
   const second={x:p2.x-(p3.x-p1.x)/6,y:p2.y-(p3.y-p1.y)/6};
   commands.push(`C ${pair(first)} ${pair(second)} ${pair(p2)}`);
  }
 }
 if(object.closed)commands.push('Z');
 return commands.join(' ');
}

/** Return model props for makeObject(type, props), preserving captured positions. */
export function objectFromPoints(type,worldPoints,{closed=false}={}){
 if(!Object.hasOwn(PATH_POINT_LIMITS,type)||!Array.isArray(worldPoints)||worldPoints.length<2||worldPoints.length>PATH_POINT_LIMITS[type]||typeof closed!=='boolean')fail();
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const point of worldPoints){
  if(!point||!finite(point.x,-COORDINATE_LIMIT,COORDINATE_LIMIT)||!finite(point.y,-COORDINATE_LIMIT,COORDINATE_LIMIT))fail();
  left=Math.min(left,point.x);top=Math.min(top,point.y);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y);
 }
 const w=Math.max(MIN_EXTENT,right-left),h=Math.max(MIN_EXTENT,bottom-top);
 const object={type,x:left,y:top,w,h,points:worldPoints.map(point=>({x:(point.x-left)/w,y:(point.y-top)/h})),closed};
 validatePathObject(object);return object;
}
