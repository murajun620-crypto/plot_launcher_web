import {bounds,selectionUnits,expandSelection} from './model.mjs?v=image-array-v076-1';

/** A group stays whole in mixed selections; only a group selected alone opens up. */
export function imageArraySelection(doc,ids){
 const selected=new Set(expandSelection(doc,ids));
 // Count locked selected groups too: skipping a fixed group must not change mode.
 const groups=new Set(doc.objects.filter(object=>selected.has(object.id)&&object.type==='image'&&object.groupId).map(object=>object.groupId));
 const hasStandalone=doc.objects.some(object=>selected.has(object.id)&&object.type==='image'&&!object.groupId);
 let units=selectionUnits(doc,ids).filter(unit=>unit.some(object=>object.type==='image'));
 const groupUnitCount=units.filter(unit=>unit[0].groupId).length,imageUnitCount=units.length-groupUnitCount;
 const withinGroup=groups.size===1&&!hasStandalone&&units.some(unit=>unit.filter(object=>object.type==='image').length>1);
 if(withinGroup)units=units.flatMap(unit=>unit.filter(object=>object.type==='image').length>1?unit.filter(object=>object.type==='image').map(object=>[object]):[unit]);
 return {units,withinGroup,groupCount:groups.size,groupUnitCount,imageUnitCount,mixed:groupUnitCount>0&&imageUnitCount>0};
}

export function imageArrayUnits(doc,ids){
 return imageArraySelection(doc,ids).units;
}

function axisBands(items,position,size){
 const ordered=[...items].sort((a,b)=>a.box[position]-b.box[position]||a.box[size]-b.box[size]||a.key.localeCompare(b.key));
 const bands=[];
 for(const item of ordered){
  let best=null,bestScore=-1;
  for(const band of bands){
   // Require overlap with every member: a tall/wide image cannot join two tracks.
   let score=1;
   for(const member of band.items){
    const overlap=Math.min(item.box[position]+item.box[size],member.box[position]+member.box[size])-Math.max(item.box[position],member.box[position]);
    score=Math.min(score,overlap/Math.min(item.box[size],member.box[size]));
    if(score<.5-1e-8)break;
   }
   if(score>=.5-1e-8&&score>bestScore){best=band;bestScore=score;}
  }
  if(best)best.items.push(item);else bands.push({items:[item]});
 }
 bands.sort((a,b)=>Math.min(...a.items.map(item=>item.box[position]))-Math.min(...b.items.map(item=>item.box[position])));
 return bands;
}

/** Detect both tracks independently so vacant cells retain their place. */
export function inferImageArray(doc,ids){
 const {units,...mode}=imageArraySelection(doc,ids);
 // Only original images/graphs define tracks and gaps. Grouped annotations still
 // travel with the unit, even when they extend beyond the image rectangle.
 const items=units.map(unit=>({unit,key:unit.map(object=>object.id).sort().join('\0'),box:bounds(unit.filter(object=>object.type==='image'))}));
 if(items.length<2)return {...mode,items,rows:[],columns:[],error:'固定されていない画像を2枚以上、または画像グループを2つ以上選択してください。'};
 const rows=axisBands(items,'y','h'),columns=axisBands(items,'x','w');
 const cells=new Set();
 rows.forEach((row,index)=>row.items.forEach(item=>item.row=index));
 columns.forEach((column,index)=>column.items.forEach(item=>item.column=index));
 for(const item of items){
  const cell=`${item.row}:${item.column}`;
  if(cells.has(cell))return {...mode,items,rows,columns,error:'画像が重なっていて行・列を判定できません。おおまかに並べてから実行してください。'};
  cells.add(cell);
 }
 return {...mode,items,rows,columns,error:null};
}

/** Translate only, using maximum image widths/heights per track. Units are pt. */
export function arrangeImageArray(doc,ids,{horizontalGap,verticalGap}){
 if(!Number.isFinite(horizontalGap)||!Number.isFinite(verticalGap)||horizontalGap<0||verticalGap<0)throw Error('隙間は0以上の数値で指定してください。');
 const layout=inferImageArray(doc,ids);
 if(layout.error)throw Error(layout.error);
 const trackPositions=(bands,position,size,gap)=>{
  let next=Math.min(...layout.items.map(item=>item.box[position]));
  return bands.map(band=>{const value=next;next+=Math.max(...band.items.map(item=>item.box[size]))+gap;return value;});
 };
 const xs=trackPositions(layout.columns,'x','w',horizontalGap),ys=trackPositions(layout.rows,'y','h',verticalGap);
 const moves=layout.items.map(item=>({...item,dx:xs[item.column]-item.box.x,dy:ys[item.row]-item.box.y}));
 // Validate every destination before changing the document.
 if(moves.some(item=>item.unit.some(object=>!Number.isFinite(object.x+item.dx)||!Number.isFinite(object.y+item.dy)||Math.abs(object.x+item.dx)>1e6||Math.abs(object.y+item.dy)>1e6)))throw Error('隙間が大きすぎます。');
 for(const {unit,dx,dy} of moves)for(const object of unit){object.x+=dx;object.y+=dy;}
 return {rows:layout.rows.length,columns:layout.columns.length,count:layout.items.length};
}
