/** Distribution summaries are calculated from raw measurements, never histogram bins. */
export const statisticNumber=value=>Number.isFinite(value)?String(Number(value.toPrecision(6))):'—';
export const statisticAvailable=(row,kind)=>['sd','se'].includes(kind)&&row?.count>=2&&Number.isFinite(row[kind]);
export function addStatisticAnnotation(config,row,kind,{active=true,includeName=false}={}){
 if(!statisticAvailable(row,kind)||!Number.isInteger(row.sheetIndex)||row.sheetIndex<0||row.sheetIndex>1000||typeof row[kind+'Text']!=='string')throw Error('SD・SEの注記には2点以上の有効なデータが必要です。');
 config.annotations||=[];
 const sheetIndex=active?'active':row.sheetIndex;
 let item=config.annotations.find(a=>a.type==='text'&&a.matrix_statistic?.sheetIndex===sheetIndex&&a.matrix_statistic.kind===kind);
 const text=(includeName?row.name+'\n':'')+row[kind+'Text'];
 if(item){item.visible=true;item.text=text;item.matrix_statistic.includeName=includeName;return item;}
 if(config.annotations.length>=200)throw Error('注釈は200個以内にしてください。');
 const position=config.annotations.filter(a=>a.matrix_statistic).length;
 item={id:crypto.randomUUID(),type:'text',axes_id:'primary',coordinate_system:'axes_fraction',x:.97-(Math.floor(position/4)%2)*.48,y:.96-(position%4)*.23,text,font_size:8,font_family:config.axes.fontFamily||'Arial',rotation:0,horizontal_alignment:'right',vertical_alignment:'top',bold:false,italic:false,underline:false,visible:true,locked:false,zorder:20,color:'#222222',opacity:1,matrix_statistic:{sheetIndex,kind,includeName}};
 config.annotations.push(item);return item;
}
export function syncStatisticAnnotationTexts(config,result){
 let changed=false;
 for(const update of result.matrixAnnotationTexts||[]){const item=config.annotations?.find(a=>a.id===update.id&&a.matrix_statistic);if(item&&item.text!==update.text){item.text=update.text;changed=true;}}
 return changed;
}
export function detachStatisticText(item,text){if(item.matrix_statistic&&text!==item.text)delete item.matrix_statistic;}
export function distributionCSV(rows,histogram){
 const numeric=row=>[row.min,row.max,row.mean,row.sd,row.se];
 const records=histogram?[['Series','Bin minimum','Bin maximum','Frequency','Cumulative (%)','Total valid points','Outside range','Minimum','Maximum','Average','SD (n-1)','SE']]:[['Series','Total valid points','Minimum','Maximum','Average','SD (n-1)','SE']];
 for(const row of rows){
  if(histogram)row.frequency?.forEach((count,i)=>records.push([row.name,row.binEdges[i],row.binEdges[i+1],count,row.cumulative[i],row.count,row.outside,...numeric(row)]));
  else records.push([row.name,row.count,...numeric(row)]);
 }
 const cell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
 return '\uFEFF'+records.map(row=>row.map(cell).join(',')).join('\r\n');
}
