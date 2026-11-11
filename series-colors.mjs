/** Primary color edits must affect the visible edge of a point-only series. */
export function primarySeriesColor(item){
 if(item.mode!=='scatter')return item.color;
 const point=!item.scatterColor||item.scatterColor==='auto'?item.color:item.scatterColor;
 const edge=!item.markerEdgeColor||item.markerEdgeColor==='auto'?point:item.markerEdgeColor;
 return /^#[\da-f]{6}$/i.test(edge)?edge:item.color;
}
export const seriesFaceColor=item=>item.markerFaceColor&&item.markerFaceColor!=='auto'?item.markerFaceColor:item.scatterColor||'auto';
export function setSeriesColor(item,key,value){
 item[key]=value;
 if(key==='color'&&item.mode==='scatter')item.markerEdgeColor=value;
 if(key==='scatterColor'){item.markerEdgeColor='auto';item.markerFaceColor='auto';}
}
export function applySeriesPalette(item,color,target='both'){
 if(target!=='scatter')item.color=color;
 if(target!=='line')setSeriesColor(item,'scatterColor',color);
}
