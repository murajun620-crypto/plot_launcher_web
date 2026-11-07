import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTextPaint} from '../text-paint.mjs';

const el=(tag,attrs={},content)=>({tag,attrs,content,children:[],append(...nodes){this.children.push(...nodes);}});
const object=(extra={})=>({type:'text',text:'ABC\nDEF',w:120,h:45,fontSize:20,fontFamily:'Arial',bold:false,italic:false,underline:false,textAlign:'left',fill:'#123456',stroke:'#abcdef',strokeWidth:2,fillTransparency:0,strokeTransparency:0,opacity:.3,...extra});
const render=(extra={},options={})=>renderTextPaint(object(extra),{el,lines:['ABC','DEF'],...options});
const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]);

test('center uses one normal text node and preserves the existing line layout',()=>{
 const nodes=render({bold:true,italic:true,underline:true,textAlign:'center'});assert.equal(nodes.length,1);
 const text=nodes[0];assert.equal(text.tag,'text');assert.equal(text.attrs.fill,'#123456');assert.equal(text.attrs.stroke,'#abcdef');assert.equal(text.attrs['stroke-width'],2);
 assert.equal(text.attrs['font-family'],'Arial');assert.equal(text.attrs['font-size'],20);assert.equal(text.attrs['font-weight'],'700');assert.equal(text.attrs['font-style'],'italic');assert.equal(text.attrs['text-decoration'],'underline');assert.equal(text.attrs['text-anchor'],'middle');assert.equal(text.attrs['xml:space'],'preserve');
 assert.deepEqual(text.children.map(node=>node.attrs),[{x:60,y:19},{x:60,y:44}]);assert.deepEqual(text.children.map(node=>node.content),['ABC','DEF']);assert.equal(text.attrs.opacity,undefined);
});

test('inside doubles the stroke, clips by fully opaque glyphs and paints it over the fill',()=>{
 const [defs,fill,outline]=render({strokeAlignment:'inside',fillTransparency:35.5,strokeTransparency:12.5});
 assert.equal(defs.tag,'defs');assert.equal(fill.attrs.stroke,'none');assert.equal(outline.attrs.fill,'none');assert.equal(outline.attrs['stroke-width'],4);
 const clip=defs.children[0];assert.equal(clip.tag,'clipPath');assert.equal(clip.attrs.clipPathUnits,'userSpaceOnUse');assert.equal(outline.attrs['clip-path'],`url(#${clip.attrs.id})`);
 for(const node of [defs,clip,clip.children[0]]){assert.equal(node.attrs.opacity,1);assert.equal(node.attrs['fill-opacity'],1);assert.equal(node.attrs['stroke-opacity'],1);}
 assert.equal(clip.children[0].attrs.fill,'#ffffff');assert.equal(clip.children[0].attrs.stroke,'none');assert.equal(fill.attrs['fill-opacity'],.645);assert.equal(outline.attrs['stroke-opacity'],.875);
 assert.equal(JSON.stringify(fill.children),JSON.stringify(outline.children));assert.equal(JSON.stringify(fill.children),JSON.stringify(clip.children[0].children));
});

test('outside removes the full glyph interior with a white/black luminance mask before painting fill',()=>{
 const [defs,outline,fill]=render({strokeAlignment:'outside',fillTransparency:100,strokeTransparency:50.25});
 const mask=defs.children[0],white=mask.children[0],cutout=mask.children[1];
 assert.equal(mask.tag,'mask');assert.equal(mask.attrs.maskUnits,'userSpaceOnUse');assert.equal(mask.attrs.maskContentUnits,'userSpaceOnUse');assert.equal(mask.attrs['mask-type'],'luminance');assert.equal(outline.attrs.mask,`url(#${mask.attrs.id})`);
 assert.equal(outline.attrs['stroke-width'],4);assert.equal(outline.attrs.fill,'none');assert.ok(Math.abs(outline.attrs['stroke-opacity']-.4975)<1e-12);assert.equal(fill.attrs['fill-opacity'],0);assert.equal(fill.attrs.stroke,'none');
 assert.equal(white.tag,'rect');assert.equal(white.attrs.fill,'#ffffff');assert.equal(cutout.attrs.fill,'#000000');assert.equal(cutout.attrs.stroke,'none');
 for(const node of [defs,mask,white,cutout])for(const name of ['opacity','fill-opacity','stroke-opacity'])assert.equal(node.attrs[name],1);
 for(const name of ['x','y','width','height'])assert.equal(mask.attrs[name],white.attrs[name]);assert.ok(mask.attrs.x<0&&mask.attrs.y<0&&mask.attrs.width>120&&mask.attrs.height>45);
});

test('all alignments keep strokes visible when the glyph fill is none',()=>{
 for(const alignment of ['center','inside','outside']){
  const nodes=render({strokeAlignment:alignment,fill:'none',fillTransparency:100}),visible=nodes.filter(node=>node.tag==='text');
  assert.ok(visible.every(node=>node.attrs.fill==='none'));assert.ok(visible.some(node=>node.attrs.stroke==='#abcdef'&&node.attrs['stroke-opacity']===1));
  const geometry=nodes[0].tag==='defs'?flatten(nodes[0].children).filter(node=>node.tag==='text'):[];
  for(const glyph of geometry)assert.equal(glyph.attrs['fill-opacity'],1);
 }
});

test('inside and outside rendering expose semantic text only once, including fill:none',()=>{
 for(const strokeAlignment of ['inside','outside'])for(const fill of ['#123456','none']){
  const nodes=render({strokeAlignment,fill}),defs=nodes.find(node=>node.tag==='defs'),texts=nodes.filter(node=>node.tag==='text');
  assert.equal(defs.attrs['aria-hidden'],'true');
  const announced=texts.filter(node=>node.attrs['aria-hidden']!=='true');assert.equal(announced.length,1);assert.equal(announced[0].attrs.fill,fill);assert.equal(announced[0].attrs.stroke,'none');assert.deepEqual(announced[0].children.map(line=>line.content),['ABC','DEF']);
  assert.equal(texts.find(node=>node.attrs.stroke==='#abcdef').attrs['aria-hidden'],'true');
 }
 assert.equal(render()[0].attrs['aria-hidden'],undefined);
});

test('no stroke, zero width or fully transparent stroke uses the single text fast path',()=>{
 for(const extra of [{stroke:'none'},{strokeWidth:0},{strokeTransparency:100}])for(const alignment of ['inside','outside']){
  const nodes=render({...extra,strokeAlignment:alignment});assert.equal(nodes.length,1);assert.equal(nodes[0].tag,'text');assert.equal(nodes[0].attrs.fill,'#123456');
 }
});

test('mask and visible glyphs retain right anchoring, justified spacing and blank lines',()=>{
 const right=render({strokeAlignment:'outside',textAlign:'right'});for(const node of flatten(right).filter(node=>node.tag==='text')){assert.equal(node.attrs['text-anchor'],'end');assert.ok(node.children.every(line=>line.attrs.x===120));}
 const justify=render({strokeAlignment:'inside',textAlign:'justify'},{lines:['long line','','last line']});
 for(const node of flatten(justify).filter(node=>node.tag==='text')){
  assert.equal(node.children[0].attrs.textLength,120);assert.equal(node.children[0].attrs.lengthAdjust,'spacing');assert.equal(node.children[1].content,' ');assert.equal(node.children[1].attrs.textLength,undefined);assert.equal(node.children[2].attrs.textLength,undefined);assert.equal(node.children[2].attrs.y,69);
 }
});

test('IDs remain local and unique for repeated renders and unsafe caller-provided IDs',()=>{
 const results=[render({strokeAlignment:'inside'},{uniqueId:'same'}),render({strokeAlignment:'inside'},{uniqueId:'same'}),render({strokeAlignment:'outside'},{uniqueId:'x") url(https://bad)/<script>'}),render({strokeAlignment:'outside'},{uniqueId:()=> 'function-id'})];
 const ids=results.map(nodes=>nodes[0].children[0].attrs.id);assert.equal(new Set(ids).size,ids.length);
 for(const [index,id]of ids.entries()){
  assert.match(id,/^[A-Za-z][A-Za-z0-9_-]*$/);const visible=results[index].find(node=>node.attrs.mask||node.attrs['clip-path']);assert.equal(visible.attrs.mask||visible.attrs['clip-path'],`url(#${id})`);
 }
});

test('parent opacity is not applied a second time and fractional channel opacity is explicit',()=>{
 const [text]=render({opacity:.2,fillTransparency:12.5,strokeTransparency:66.75});
 assert.equal(text.attrs.opacity,undefined);assert.equal(text.attrs['fill-opacity'],.875);assert.equal(text.attrs['stroke-opacity'],.3325);
});

test('helper uses a factory without cloneNode or DOM measurement and rejects malformed metrics',()=>{
 assert.doesNotThrow(()=>render({strokeAlignment:'outside'}));
 assert.throws(()=>render({fontSize:NaN}),TypeError);assert.throws(()=>render({}, {lines:[42]}),TypeError);
 const [text]=renderTextPaint(object({text:'single'}),{el});assert.equal(text.children[0].content,'single');
});
