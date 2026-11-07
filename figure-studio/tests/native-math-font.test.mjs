import test from 'node:test';import assert from 'node:assert/strict';
import {usesNativeMathFont,mathFontStyle,installNativeMathFont} from '../native-math-font.mjs';
test('Arial covers Latin, Greek and mathematical italic codepoints while structural glyphs keep their math shapes',()=>{
 for(const code of [65,0x3b1,0x1d465,0x2212])assert.equal(usesNativeMathFont('italic',code),true);
 for(const[variant,code]of [['-size1',65],['double-struck',65],['normal',0x2211],['normal',0x221a]])assert.equal(usesNativeMathFont(variant,code),false);
 assert.deepEqual(mathFontStyle({fontFamily:'Arial',bold:true},'italic'),{family:'Arial',bold:true,italic:true});
});
test('native metrics, SVG family and SMP normalization agree, and all shared hooks restore after a conversion',()=>{
 const oldCache=new Map(),output={font:{getChar:()=>[1,0,1,{p:'path'}]},unknownText:()=>({fallback:true}),measureTextNode:()=>({w:9,h:9,d:9}),unknownCache:oldCache,
  svg:(tag,attrs,children)=>({tag,attrs,children}),text:t=>t,adaptor:{getAttribute:(n,k)=>n.attrs[k]??null,textContent:n=>n.children.join('')}};
 const before={get:output.font.getChar,text:output.unknownText,measure:output.measureTextNode};const measured=[];
 const restore=installNativeMathFont(output,{fontFamily:'Arial'},{measure:(text,style)=>{measured.push({text,style});return {w:.5,h:.7,d:.1};}});
 assert.deepEqual(output.font.getChar('italic',0x1d465),[.7,.1,.5,{unknown:true}]);
 const node=output.unknownText(String.fromCodePoint(0x1d465),'italic');assert.equal(node.attrs['font-family'],'Arial');assert.equal(node.attrs['font-size'],1000);assert.deepEqual(node.children,['x']);assert.equal(node.attrs['font-style'],'italic');
 assert.deepEqual(output.measureTextNode(node),{w:.5,h:.7,d:.1});assert.equal(measured[0].text,'x');assert.equal(output.font.getChar('-size1',0x2211)[3].p,'path');
 restore();restore();assert.equal(output.font.getChar,before.get);assert.equal(output.unknownText,before.text);assert.equal(output.measureTextNode,before.measure);assert.equal(output.unknownCache,oldCache);
});
