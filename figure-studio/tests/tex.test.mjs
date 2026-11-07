import test from 'node:test';
import assert from 'node:assert/strict';
import {splitTex,geometryFromMathSvg,makeTexLayout,createTexRenderer} from '../tex.mjs';

const object=extra=>({type:'text',text:'速度 $v_0$ = 3',textMode:'auto',fontSize:20,fontFamily:'Arial',w:160,h:30,textAlign:'left',...extra});
const geometry={viewBox:[0,-800,1000,1000],nodes:[{tag:'g',attrs:{transform:'scale(1,-1)'},children:[{tag:'path',attrs:{d:'M0 0L1000 0L500 800Z'},children:[]}]}]};
const convert=async()=>geometry;
const measure=(text,o)=>[...text].length*o.fontSize*.5;
const el=(tag,attrs={},content)=>({tag,attrs,content,children:[],append(...nodes){this.children.push(...nodes);}});
const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]);

test('auto recognizes all four explicit delimiters and retains surrounding Japanese',()=>{
 assert.deepEqual(splitTex('日本語 $x_1$、$$\\frac{a}{b}$$ と \\(\\alpha\\) / \\[\\sum_i i\\]'),[
  {type:'text',text:'日本語 '},{type:'math',text:'x_1',display:false},{type:'text',text:'、'},
  {type:'math',text:'\\frac{a}{b}',display:true},{type:'text',text:' と '},{type:'math',text:'\\alpha',display:false},
  {type:'text',text:' / '},{type:'math',text:'\\sum_i i',display:true}
 ]);
});

test('plain mode, whole-expression mode and unfinished/escaped delimiters are distinct',()=>{
 assert.deepEqual(splitTex('$x$','plain'),[{type:'text',text:'$x$'}]);
 assert.deepEqual(splitTex('\\frac{1}{2}','tex'),[{type:'math',text:'\\frac{1}{2}',display:true}]);
 assert.deepEqual(splitTex('price \\$5 and $unfinished'),[{type:'text',text:'price \\$5 and $unfinished'}]);
 assert.deepEqual(splitTex('\\(x\\)'),[{type:'math',text:'x',display:false}]);
 assert.deepEqual(splitTex('\\\\(x)'),[{type:'text',text:'\\\\(x)'}]);
});

test('100k-character backslash and unmatched-delimiter runs require only a bounded scan',()=>{
 const slashes='\\'.repeat(100000),unclosed='\\('+('$\\['.repeat(33334));
 const started=performance.now();
 assert.deepEqual(splitTex(slashes+'$x$'),[{type:'text',text:slashes},{type:'math',text:'x',display:false}]);
 assert.deepEqual(splitTex(unclosed),[{type:'text',text:unclosed}]);
 assert.ok(performance.now()-started<1000,'delimiter scanning must not grow quadratically');
});

test('mixed text and TeX share a baseline; formulas remain vector geometry',async()=>{
 const input=object({text:'日本 $x$ 英語',bold:true,italic:true,underline:true});
 const layout=await makeTexLayout(input,{measure,convert});
 assert.equal(layout.rows.length,1);assert.equal(layout.height,25);
 const nodes=layout.createNodes(el,{'stroke-width':2});
 assert.deepEqual(nodes.map(node=>node.tag),['text','g','text']);
 assert.equal(nodes[0].content,'日本 ');assert.equal(nodes[0].attrs.y,19);assert.equal(nodes[0].attrs['text-anchor'],'start');
 assert.equal(nodes[0].attrs['font-weight'],'700');assert.equal(nodes[0].attrs['font-style'],'italic');assert.equal(nodes[0].attrs['text-decoration'],'underline');
 assert.equal(nodes[1].attrs.transform,'translate(30 19) scale(0.02)');assert.equal(nodes[2].attrs.x,50);
 const path=flatten(nodes).find(node=>node.tag==='path');assert.equal(path.attrs['stroke-width'],100);assert.equal(path.attrs.fill,undefined);assert.equal(path.attrs.stroke,undefined);
 assert.equal(input.text,'日本 $x$ 英語');
 assert.ok(!flatten(nodes).some(node=>['image','foreignObject','use'].includes(node.tag)));
});

test('normal characters wrap by measured width while a formula is an atomic unit',async()=>{
 const layout=await makeTexLayout(object({text:'ABCD $x$ EF',w:42}),{measure,convert});
 assert.deepEqual(layout.rows.map(row=>row.runs.map(run=>run.text??'<math>').join('')),['ABCD',' <math> ','EF']);
 assert.equal(layout.rows[1].runs.find(run=>run.type==='math').width,20);
 const large=await makeTexLayout(object({text:'$x$',w:5}),{measure,convert});assert.equal(large.width,20);assert.equal(large.rows.length,1);
});

test('tall fractions expand baseline spacing and display math gets its own row',async()=>{
 const tall={...geometry,viewBox:[0,-1800,1000,2400]};
 const layout=await makeTexLayout(object({text:'前 $$\\frac{1}{2}$$後'}),{measure,convert:async()=>tall});
 assert.equal(layout.rows.length,3);assert.equal(layout.rows[1].y,25+36);assert.equal(layout.rows[1].ascent,36);assert.equal(layout.rows[1].descent,12);assert.equal(layout.height,98);
 const center=await makeTexLayout(object({text:'$x$',textAlign:'center'}),{measure,convert});assert.equal(center.rows[0].x,70);
 const right=await makeTexLayout(object({text:'$x$',textAlign:'right'}),{measure,convert});assert.equal(right.rows[0].x,140);
});

test('justification distributes spacing without stretching mathematical glyphs',async()=>{
 const layout=await makeTexLayout(object({text:'AB$x$C\nD',textAlign:'justify',w:100}),{measure,convert});
 const nodes=layout.createNodes(el),spacing=50/3;
 assert.ok(Math.abs(nodes[0].attrs.textLength-(20+spacing))<1e-10);assert.equal(nodes[0].attrs.lengthAdjust,'spacing');
 assert.equal(nodes[1].attrs.transform,`translate(${20+2*spacing} 19) scale(0.02)`);
 assert.ok(Math.abs(nodes[2].attrs.x-90)<1e-10);assert.equal(nodes[3].attrs.textLength,undefined);
});

test('outline compensation includes subscript scales and fresh nodes are created for masks',async()=>{
 const small={...geometry,nodes:[{tag:'g',attrs:{transform:'translate(800, -150) scale(0.707)'},children:geometry.nodes}]};
 const layout=await makeTexLayout(object({text:'$x_i$'}),{measure,convert:async()=>small});
 const one=layout.createNodes(el,{'stroke-width':4}),two=layout.createNodes(el,{'stroke-width':0});
 const path1=flatten(one).find(node=>node.tag==='path'),path2=flatten(two).find(node=>node.tag==='path');
 assert.ok(Math.abs(path1.attrs['stroke-width']*.02*.707-4)<1e-10);assert.equal(path2.attrs['stroke-width'],0);assert.notEqual(path1,path2);
 assert.equal(geometry.nodes[0].children[0].attrs['stroke-width'],undefined);
});

test('renderer is lazy, caches geometry across styles and prepares layouts before export',async()=>{
 let calls=0;const ready=[],renderer=createTexRenderer({measure,convert:async(...args)=>{calls++;return convert(...args);},onReady:key=>ready.push(key)});
 const plain=object({text:'plain'}),first=object();assert.equal(renderer.hasMath(plain),false);assert.equal(renderer.getLayout(plain),null);assert.equal(calls,0);
 assert.equal(renderer.getLayout(first),null);assert.equal(renderer.getLayout(first),null);
 await renderer.prepare([first,plain]);assert.equal(calls,1);assert.equal(ready.length,1);assert.ok(renderer.getLayout(first));
 await renderer.prepare([{...first,fill:'#ffffff',strokeWidth:4}]);assert.equal(ready.length,1);assert.equal(calls,1);
 await renderer.prepare([{...first,fontSize:30}]);assert.equal(ready.length,2);assert.equal(calls,1);
 assert.equal(renderer.hasMath(object({text:'x_1',textMode:'tex'})),true);assert.equal(renderer.hasMath(object({text:'$x$',textMode:'plain'})),false);
});

test('invalid TeX fails export once per key without repaint retry or unhandled rejection',async()=>{
 let calls=0,errors=0;const renderer=createTexRenderer({measure,convert:async()=>{calls++;throw new Error('Undefined control sequence');},onError:()=>errors++});
 const bad=object({text:'$\\bad$'});assert.equal(renderer.getLayout(bad),null);
 await assert.rejects(renderer.prepare([bad]),/数式を描画できません.*Undefined control sequence/);
 assert.equal(renderer.getLayout(bad),null);await assert.rejects(renderer.prepare([bad]),/数式を描画できません/);
 assert.equal(calls,1);assert.equal(errors,1);assert.ok(renderer.getError(bad) instanceof Error);
});

function dom(tag,attrs={},children=[],text=''){
 const node={localName:tag,attributes:Object.entries(attrs).map(([name,value])=>({name,value:String(value)})),children,childNodes:[...(text?[{nodeType:3,nodeValue:text}]:[]),...children],getAttribute(name){return Object.hasOwn(attrs,name)?String(attrs[name]):null;},querySelector(){return null;},querySelectorAll(){return this.children.flatMap(child=>[child,...child.querySelectorAll()]).filter(child=>child.getAttribute('id'));}};
 return node;
}

test('SVG normalization strips engine paint and IDs, expands only local references',()=>{
 const path=dom('path',{id:'mjx-X',d:'M0 0L1 1',fill:'currentColor',stroke:'currentColor','stroke-width':0});
 const svg=dom('svg',{viewBox:'0 -800 1000 1000'},[dom('defs',{},[path]),dom('g',{transform:'scale(1,-1)',fill:'currentColor'},[dom('use',{'xlink:href':'#mjx-X',x:5,y:2})])]);
 const output=geometryFromMathSvg(svg);assert.deepEqual(output.viewBox,[0,-800,1000,1000]);
 assert.equal(output.nodes.length,1);assert.equal(output.nodes[0].attrs.fill,undefined);
 const resolved=output.nodes[0].children[0];assert.equal(resolved.attrs.transform,'translate(5 2)');assert.equal(resolved.children[0].tag,'path');assert.deepEqual(resolved.children[0].attrs,{d:'M0 0L1 1'});
 assert.ok(!JSON.stringify(output).includes('mjx-X'));
});

test('SVG normalization rejects external references, active content, bad dimensions and cycles',()=>{
 const svg=children=>dom('svg',{viewBox:'0 0 1000 1000'},children);
 assert.throws(()=>geometryFromMathSvg(svg([dom('use',{href:'https://example.test/glyph.svg#x'})])),/参照/);
 assert.throws(()=>geometryFromMathSvg(svg([dom('foreignObject')])),/SVG要素/);
 assert.throws(()=>geometryFromMathSvg(dom('svg',{viewBox:'0 0 Infinity 20'})),/大きさ/);
 assert.throws(()=>geometryFromMathSvg(svg([dom('path',{d:'M0 0',transform:'scale(0)'})])),/座標変換/);
 const circular=dom('use',{id:'loop',href:'#loop'});assert.throws(()=>geometryFromMathSvg(svg([circular])),/参照/);
});

test('source and measurement limits reject before producing misleading output',async()=>{
 await assert.rejects(makeTexLayout(object({text:'x'.repeat(50001),textMode:'tex'}),{measure,convert}),/長すぎ/);
 await assert.rejects(makeTexLayout(object(),{measure:()=>NaN,convert}),/幅/);
});
