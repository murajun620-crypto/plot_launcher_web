import {bounds} from './model.mjs?v=rotation-v079-1';

/** Leave enough scrollable space to center even a panel at a page edge. */
export function centerSelectionInViewport(viewport,paper,point,scale){
 const x=point.x*scale,y=point.y*scale,page=paper.getBoundingClientRect(),halfWidth=viewport.clientWidth/2,halfHeight=viewport.clientHeight/2;
 viewport.style.paddingLeft=`${Math.max(halfWidth,halfWidth-x)}px`;
 viewport.style.paddingRight=`${Math.max(halfWidth,halfWidth+x-page.width)}px`;
 viewport.style.paddingTop=`${Math.max(halfHeight,halfHeight-y)}px`;
 viewport.style.paddingBottom=`${Math.max(halfHeight,halfHeight+y-page.height)}px`;
 // Measure after layout: padding can introduce a scrollbar and change the
 // client size, and auto margins can change the paper's position.
 const view=viewport.getBoundingClientRect(),sheet=paper.getBoundingClientRect();
 viewport.scrollLeft+=sheet.left+x-(view.left+viewport.clientLeft+viewport.clientWidth/2);
 viewport.scrollTop+=sheet.top+y-(view.top+viewport.clientTop+viewport.clientHeight/2);
}

export function resetSelectionZoom(viewport){
 for(const side of ['padding-left','padding-right','padding-top','padding-bottom'])viewport.style.removeProperty(side);
}

export function createSelectionWheelZoom({viewport,paper,getSelection,getScale,setScale,afterCenter=()=>{}}){
 return event=>{
  if(!(event.ctrlKey||event.metaKey))return;
  event.preventDefault();if(!Number.isFinite(event.deltaY)||event.deltaY===0)return;
  const box=bounds(getSelection()),point=box?{x:box.x+box.w/2,y:box.y+box.h/2}:null;
  setScale(getScale()*Math.exp(-event.deltaY*.0015));
  if(point){centerSelectionInViewport(viewport,paper,point,getScale());afterCenter();}
 };
}
