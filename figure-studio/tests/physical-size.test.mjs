import test from 'node:test';
import assert from 'node:assert/strict';
import {svgLengthInPoints,svgPhysicalSize} from '../physical-size.mjs';
import {imagePhysicalSize} from '../assets.mjs';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('absolute SVG units and CSS pixels map to the same physical point length',()=>{
 for(const length of ['72pt','25.4mm','2.54cm','1in','6pc','96px','96'])near(svgLengthInPoints(length),72);
 near(svgLengthInPoints('  +2.54e1 MM '),72);
 near(svgLengthInPoints('.5in'),36);
});

test('PlotLauncher SVG point sizes retain exact fractional lengths instead of rounded image pixels',()=>{
 const size=svgPhysicalSize({width:'151.561181pt',height:'122.461181pt',viewBox:'0 0 151.561181 122.461181'});
 assert.deepEqual(size,{width:151.561181,height:122.461181});
 // The 4 cm axis occupies this many SVG points, regardless of the outer
 // margins or naturalWidth rounding. One-to-one placement keeps it 40 mm.
 const axisPoints=4/2.54*72,axisFraction=axisPoints/151.561181;
 near(size.width*axisFraction*25.4/72,40);
});

test('one explicit dimension may use the viewBox aspect without losing physical scale',()=>{
 assert.deepEqual(svgPhysicalSize({width:'2in',viewBox:'-10, -20, 400, 200'}),{width:144,height:72});
 assert.deepEqual(svgPhysicalSize({height:'72pt',viewBox:'0 0 400 200'}),{width:144,height:72});
 near(svgPhysicalSize({width:'40mm',viewBox:'0 0 4 3'}).height,30*72/25.4);
});

test('missing physical intent and invalid dimension declarations do not invent a size',()=>{
 for(const attrs of [{},{viewBox:'0 0 400 300'},{width:'40mm'},{height:'30mm'},
  {width:'40mm',height:'100%',viewBox:'0 0 4 3'},
  {width:'auto',height:'30mm',viewBox:'0 0 4 3'},
  {width:'',height:'30mm',viewBox:'0 0 4 3'},
  {width:'-40mm',height:'30mm'},{width:'0',height:'30mm'}])assert.equal(svgPhysicalSize(attrs),null);
 for(const value of ['NaN','Infinity','1e309pt','20em','100%','calc(10mm)','0pt','-1pt','1000000pt','2001mm','20px trailing','20 m m',null,72])assert.equal(svgLengthInPoints(value),null);
});

test('invalid or extreme viewBox geometry cannot produce an inferred dimension',()=>{
 for(const viewBox of ['0 0 0 20','0 0 10 -20','0 0 Infinity 20','0 0 10','0 0 10 20 30','0 0 1e-300 1e300','0 0 1 1000000'])assert.equal(svgPhysicalSize({width:'10mm',viewBox}),null);
 // Explicit absolute dimensions do not need a valid viewBox to carry size.
 assert.deepEqual(svgPhysicalSize({width:'72pt',height:'36pt',viewBox:'invalid'}),{width:72,height:36});
});

test('asset physical metadata remains exact and does not mutate the saved asset',async()=>{
 const asset={mime:'image/svg+xml',width:202,height:163,physicalSize:{width:151.561181,height:122.461181}};
 const before=JSON.stringify(asset);
 assert.deepEqual(await imagePhysicalSize(asset),asset.physicalSize);
 assert.equal(JSON.stringify(asset),before);
 for(const physicalSize of [undefined,{width:0,height:10},{width:Infinity,height:10},{width:'72',height:36},{width:1e9,height:10}])assert.equal(await imagePhysicalSize({mime:'image/png',physicalSize}),null);
});
