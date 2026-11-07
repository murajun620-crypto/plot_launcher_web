let paintSequence=0;
const alpha=value=>1-Math.min(100,Math.max(0,Number.isFinite(value)?value:0))/100;
const safePrefix=value=>String(value??'text').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)||'text';

/**
 * Render text with an independently transparent fill and an aligned outline.
 * Coordinates are local to the object's existing transform; the caller retains
 * overall object opacity and hit areas. Returns nodes for g.append(...nodes).
 */
export function renderTextPaint(object,{el,lines,uniqueId,layout}={}){
 if(typeof el!=='function'||!object||!Number.isFinite(object.fontSize)||object.fontSize<=0||!Number.isFinite(object.w)||!Number.isFinite(object.h))throw new TypeError('Text paint requires a valid text object and SVG element factory.');
 lines??=String(object.text??'').split('\n');
 if(!Array.isArray(lines)||lines.some(line=>typeof line!=='string'))throw new TypeError('Text lines must be strings.');
 const fontSize=object.fontSize,anchor=object.textAlign==='center'?'middle':object.textAlign==='right'?'end':'start',x=anchor==='middle'?object.w/2:anchor==='end'?object.w:0;
 const fill=object.fill||'#172f36',stroke=object.stroke||'none',width=Number.isFinite(object.strokeWidth)?Math.max(0,object.strokeWidth):0;
 const fillOpacity=alpha(object.fillTransparency),strokeOpacity=alpha(object.strokeTransparency),alignment=['inside','outside'].includes(object.strokeAlignment)?object.strokeAlignment:'center';
 const attributes={'font-family':object.fontFamily||'Arial','font-size':fontSize,'font-weight':object.bold?'700':'400','font-style':object.italic?'italic':'normal','text-decoration':object.underline?'underline':'none','text-anchor':anchor,'xml:space':'preserve'};
 function text(paint){
  if(layout){const group=el('g',{...attributes,...paint});group.append(...layout.createNodes(el,paint));return group;}
  const node=el('text',{...attributes,...paint});
  lines.forEach((line,index)=>node.append(el('tspan',{x,y:fontSize*(.95+index*1.25),...(object.textAlign==='justify'&&index<lines.length-1&&line.length>1?{textLength:object.w,lengthAdjust:'spacing'}:{})},line||' ')));
  return node;
 }
 const normalPaint={fill,stroke,'stroke-width':width,'fill-opacity':fillOpacity,'stroke-opacity':strokeOpacity};
 if(alignment==='center'||stroke==='none'||width===0||strokeOpacity===0)return [text(normalPaint)];

 const token=typeof uniqueId==='function'?uniqueId():uniqueId,id=`text-paint-${safePrefix(token)}-${(++paintSequence).toString(36)}`;
 const opaque={opacity:1,'fill-opacity':1,'stroke-opacity':1},defs=el('defs',{...opaque,'aria-hidden':'true'});
 const fillText=text({fill,stroke:'none','fill-opacity':fillOpacity,'stroke-opacity':1});
 const strokePaint={fill:'none',stroke,'stroke-width':2*width,'fill-opacity':1,'stroke-opacity':strokeOpacity,'aria-hidden':'true'};
 const extent=layout?Math.max(object.w,layout.width,fontSize):lines.reduce((max,line)=>Math.max(max,[...line].length*fontSize*2),Math.max(object.w,fontSize)),padding=fontSize*2+width*4+2;
 const left=anchor==='middle'?object.w/2-extent/2:anchor==='end'?object.w-extent:0;
 const bounds={x:left-padding,y:-padding,width:extent+padding*2,height:Math.max(object.h,layout?.height??(fontSize*(.95+Math.max(0,lines.length-1)*1.25)+fontSize))+padding*2};
 if(alignment==='inside'){
  // SVG clipPath does not reliably accept grouped mathematical geometry.
  // A white-on-transparent luminance mask intersects the same glyph interiors.
  const clip=layout?el('mask',{id,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse','mask-type':'luminance',...bounds,...opaque}):el('clipPath',{id,clipPathUnits:'userSpaceOnUse',...opaque});
  clip.append(text({fill:'#ffffff',stroke:'none',...opaque}));defs.append(clip);
  // The clipped half of a 2w stroke is w wide inside the glyph. Paint it after
  // the fill so an opaque fill cannot cover its own outline.
  return [defs,fillText,text({...strokePaint,[layout?'mask':'clip-path']:`url(#${id})`})];
 }

 // A luminance mask removes the glyph interior independently of its visible
 // fill, including fill:none and 100% transparent fill. The margin includes
 // overhangs, decorations and the default SVG miter limit without changing wrap.
 const mask=el('mask',{id,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse','mask-type':'luminance',...bounds,...opaque});
 mask.append(el('rect',{...bounds,fill:'#ffffff',stroke:'none',...opaque}),text({fill:'#000000',stroke:'none',...opaque}));defs.append(mask);
 return [defs,text({...strokePaint,mask:`url(#${id})`}),fillText];
}
