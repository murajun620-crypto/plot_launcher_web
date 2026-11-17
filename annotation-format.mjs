const TYPES=['text','segment','arrow'];
const TEXT_FIELDS=['font_family','font_size','bold','italic','underline','text_align','vertical_alignment'];
const LINE_FIELDS=['line_width','line_style'];
const ARROW_FIELDS=['arrow_style','arrow_size'];
export function formatTargets(annotations,ids){const selected=new Set(ids);return (annotations||[]).filter(item=>selected.has(item.id)&&TYPES.includes(item.type)&&!item.locked);}
export function formatFieldApplies(item,key){return ['color','opacity','angle','visible'].includes(key)||item.type==='text'&&TEXT_FIELDS.includes(key)||item.type!=='text'&&LINE_FIELDS.includes(key)||item.type==='arrow'&&ARROW_FIELDS.includes(key);}

function axisFraction(value,range,log,inverse=false){
 const f=log?Math.log:value=>value,lo=f(Number(range[0])),hi=f(Number(range[1]));
 const result=inverse?(log?Math.exp(lo+value*(hi-lo)):lo+value*(hi-lo)):(f(Number(value))-lo)/(hi-lo);
 if(!Number.isFinite(result)||hi===lo)throw Error('現在の軸範囲では注釈の角度を変更できません。');
 return result;
}
function linePoints(item,context,inverse=false,points){
 if(!context||![context.width,context.height].every(value=>Number.isFinite(value)&&value>0))throw Error('グラフを描画してから角度を変更してください。');
 const coords=points||[[item.x1,item.y1],[item.x2,item.y2]],fraction=item.coordinate_system==='axes_fraction';
 return coords.map(point=>point.map((value,i)=>{
  const dimension=i?context.height:context.width,range=i?context.yRange:context.xRange,log=(i?context.yScale:context.xScale)==='log';
  if(inverse)return fraction?value/dimension:axisFraction(value/dimension,range,log,true);
  return (fraction?Number(value):axisFraction(value,range,log))*dimension;
 }));
}
export function annotationFormatValue(item,key,context){
 if(key==='angle'){
  if(item.type==='text')return Number(item.rotation||0);
  const [a,b]=linePoints(item,context);return Number((Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI).toFixed(6));
 }
 return item[key]??({color:'#222222',opacity:1,visible:true,font_family:'Arial',font_size:9,bold:item.font_weight==='bold',italic:item.font_style==='italic',underline:false,text_align:item.horizontal_alignment||'left',vertical_alignment:'baseline',line_width:.5,line_style:'-',arrow_style:'->',arrow_size:7})[key];
}
function checkedPatch(patch){
 const result={};
 for(const [key,value] of Object.entries(patch)){
  if(!['color','opacity','angle','visible',...TEXT_FIELDS,...LINE_FIELDS,...ARROW_FIELDS].includes(key))throw Error('変更できない注釈の項目です。');
  if(['bold','italic','underline','visible'].includes(key)){if(typeof value!=='boolean')throw Error('チェック項目を確認してください。');}
  else if(['font_size','opacity','angle','line_width','arrow_size'].includes(key)){
   const [lo,hi]=({font_size:[1,200],opacity:[0,1],angle:[-360,360],line_width:[.1,20],arrow_size:[1,100]})[key];
   if(typeof value!=='number'||!Number.isFinite(value)||value<lo||value>hi)throw Error('注釈の数値を範囲内で指定してください。');
  }else if(key==='color'){if(!/^#[0-9a-f]{6}$/i.test(value))throw Error('注釈の色を確認してください。');}
  else if(key==='font_family'){if(typeof value!=='string'||!value.trim()||value.length>500)throw Error('フォントを選択してください。');}
  else if(!({line_style:['-','--','-.',':'],arrow_style:['->','<->','-|>'],text_align:['left','center','right','justify'],vertical_alignment:['baseline','center','top','bottom']})[key].includes(value))throw Error('注釈の設定を確認してください。');
  result[key]=value;
 }
 return result;
}
export function applyAnnotationFormat(annotations,ids,patch,context){
 const values=checkedPatch(patch),plans=formatTargets(annotations,ids).map(item=>{
  const next={};
  for(const [key,value] of Object.entries(values)){
   if(!formatFieldApplies(item,key))continue;
   if(key==='angle'){
    if(item.type==='text')next.rotation=value;
    else{
     const [a,b]=linePoints(item,context),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2,length=Math.hypot(b[0]-a[0],b[1]-a[1])/2,r=value*Math.PI/180;
     const [p,q]=linePoints(item,context,true,[[cx-length*Math.cos(r),cy-length*Math.sin(r)],[cx+length*Math.cos(r),cy+length*Math.sin(r)]]);
     Object.assign(next,{x1:p[0],y1:p[1],x2:q[0],y2:q[1]});
    }
   }else next[key]=value;
   if(key==='bold')next.font_weight=value?'bold':'normal';
   if(key==='italic')next.font_style=value?'italic':'normal';
   if(key==='text_align')next.horizontal_alignment=value==='justify'?'left':value;
  }
  return {item,next};
 });
 // One invalid target must never leave only part of a selection changed.
 for(const {item,next} of plans)Object.assign(item,next);
 return plans.filter(({next})=>Object.keys(next).length).length;
}
