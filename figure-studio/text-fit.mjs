const linesOf=text=>String(text??'').replace(/\r\n?/g,'\n').split('\n');
const size=value=>Math.min(1e6,Math.max(2,Math.ceil(value*1000)/1000));

/** Fit editable text while retaining its aligned top anchor in page coordinates. */
export function fitTextBox(object,{measure,layout}={}){
 if(object?.type!=='text'||object.locked)return false;
 const lines=linesOf(object.text),font=object.fontSize;
 if(!Number.isFinite(font)||font<=0||typeof measure!=='function')return false;
 let width=0,height=font*1.25*Math.max(1,lines.length);
 if(layout){width=layout.width;height=layout.height;}
 else for(const [index,line]of lines.entries()){
  const m=measure(line,object),advance=typeof m==='number'?m:m?.width;
  if(!Number.isFinite(advance)||advance<0)return false;
  width=Math.max(width,advance,Number.isFinite(m?.actualBoundingBoxRight)?m.actualBoundingBoxRight:0);
  if(Number.isFinite(m?.actualBoundingBoxDescent))height=Math.max(height,font*(.95+index*1.25)+m.actualBoundingBoxDescent);
 }
 const w=size(width+2),h=size(height+2),changed=!object.textAutoSize||Math.abs(object.w-w)>1e-6||Math.abs(object.h-h)>1e-6;
 object.textAutoSize=true;if(!changed)return false;
 const anchor=(w,h)=>{
  const x=object.textAlign==='center'?w/2:object.textAlign==='right'?w:0,y=0;
  const dx=(x-w/2)*(object.flipX?-1:1),dy=(y-h/2)*(object.flipY?-1:1),r=(object.rotation||0)*Math.PI/180;
  return {x:w/2+dx*Math.cos(r)-dy*Math.sin(r),y:h/2+dx*Math.sin(r)+dy*Math.cos(r)};
 };
 const before=anchor(object.w,object.h),after=anchor(w,h);
 object.x+=before.x-after.x;object.y+=before.y-after.y;object.w=w;object.h=h;
 return true;
}

export const naturalTextLines=linesOf;
