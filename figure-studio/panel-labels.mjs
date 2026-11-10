import {bounds,selectionUnits,makeObject,mm,uid,clone} from './model.mjs?v=nested-groups-v0712-1';

import {panelNumbering,numberedLabel} from './panel-numbering.mjs?v=panel-labels-v0723-1';
export const PANEL_LABEL_STYLES=['alpha','branch-number','branch-roman','number','custom','none'];
export function panelLabelText(index,style='alpha',values={}){return numberedLabel(index-1,panelNumbering(style,values));}

/** The outer group is always one panel, including when a member is selected. */
export function panelLabelUnits(doc,ids,{scope='selection'}={}){
 const targets=scope==='all'?doc.objects.map(object=>object.id):ids;
 const items=selectionUnits(doc,targets).filter(unit=>unit.some(object=>object.type==='image'))
  .map(unit=>({unit,box:bounds(unit.filter(object=>!object.panelLabel))}));
 // Read across a row, then down. Slightly uneven tops still belong to one row.
 const rows=[];
 for(const item of items.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x)){
  const row=rows.find(row=>Math.abs(item.box.y-row.y)<=Math.min(item.box.h,row.h)*.4);
  if(row){row.items.push(item);row.h=Math.min(row.h,item.box.h);}else rows.push({y:item.box.y,h:item.box.h,items:[item]});
 }
 return rows.flatMap(row=>row.items.sort((a,b)=>a.box.x-b.box.x));
}

/** Labels are ordinary editable text; group membership makes them travel with panels. */
export function applyPanelLabels(doc,ids,{scope='selection',style='alpha',start=1,numbering={},fontSize=9,bold=false,gap=0,position='outside'}={},fitText=()=>{}){
 if(!PANEL_LABEL_STYLES.includes(style)||!Number.isSafeInteger(start)||start<1||start>9999||!Number.isFinite(fontSize)||fontSize<1||fontSize>1000||!Number.isFinite(gap)||gap<0||gap>mm(100)||!['outside','inside'].includes(position))throw Error('ラベルの設定を確認してください。');
 const targets=panelLabelUnits(doc,ids,{scope});
 if(!targets.length)throw Error('固定されていない画像または画像グループを選択してください。');
 const removed=new Set(),plans=targets.map(({unit,box},index)=>{
  const previous=unit.filter(object=>object.panelLabel&&object.type==='text');
  previous.forEach(object=>removed.add(object.id));
  if(style==='none')return {unit,groupId:unit[0].groupId,label:null};
  const groupId=unit[0].groupId||uid(),text=panelLabelText(index+1,style,{...numbering,start});
  const label=previous.length?clone(previous.find(object=>!object.groupStack?.length)||previous[0]):makeObject('text');
  Object.assign(label,{panelLabel:true,groupId,x:box.x,y:box.y,w:mm(9),h:fontSize*1.25+2,rotation:0,flipX:false,flipY:false,text,textMode:'plain',fontSize,bold,textAlign:'left',name:`パネルラベル ${text}`,locked:false});
  delete label.groupStack;
  if(!previous.length)Object.assign(label,{fill:'#000000',stroke:'none',fontFamily:'Arial'});
  fitText(label);
  label.x=box.x+(position==='inside'?gap:0);
  label.y=position==='inside'?box.y+gap:box.y-label.h-gap;
  if(!Number.isFinite(label.x)||!Number.isFinite(label.y)||Math.abs(label.x)>1e6||Math.abs(label.y)>1e6)throw Error('ラベルを配置できる範囲を超えています。');
  return {unit,groupId,label};
 });
 if(doc.objects.length-removed.size+plans.filter(plan=>plan.label).length>3000)throw Error('オブジェクトは3000個までです。');
 // Commit only after every destination and option has been checked.
 for(const {unit,groupId,label}of plans)if(label)for(const object of unit)if(!object.groupId)object.groupId=groupId;
 doc.objects=doc.objects.filter(object=>!removed.has(object.id));
 doc.objects.push(...plans.flatMap(plan=>plan.label?[plan.label]:[]));
 return {count:plans.length,ids:plans.flatMap(plan=>[...plan.unit.filter(object=>!removed.has(object.id)).map(object=>object.id),...(plan.label?[plan.label.id]:[])])};
}
