import test from 'node:test';
import assert from 'node:assert/strict';
import {mm,newDocument} from '../model.mjs';
import {importedImageSize,replacedImageSize,imageInsertionPoint} from '../image-placement.mjs';
const page=newDocument(),physical={width:139.878952,height:110.316519},image={width:186,height:147,physicalSize:physical};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('PlotLauncher and imported SVG retain precise point dimensions instead of rounded CSS pixels',()=>{
 for(const mode of ['plot','image']){
  const size=importedImageSize(image,page,mode);
  assert.deepEqual(size,{w:physical.width,h:physical.height});
  near(113.385827/physical.width*size.w,mm(40));
  near(85.039370/physical.height*size.h,mm(30));
 }
});
test('physical figures larger than the page keep size and are placed at the top-left',()=>{
 const size=importedImageSize({...image,physicalSize:{width:mm(240),height:mm(180)}},page,'plot');
 assert.deepEqual(size,{w:mm(240),h:mm(180)});
 assert.deepEqual(imageInsertionPoint(page,size,mm(4)),{x:0,y:0});
});
test('MiFiTo and images without physical metadata keep their previous fit behavior',()=>{
 for(const physicalSize of [undefined,{width:NaN,height:10},{width:-1,height:10},{width:Infinity,height:1}]){
  const size=importedImageSize({...image,physicalSize},page,'plot');
  near(size.w,mm(85));near(size.h,size.w*147/186);
 }
 near(importedImageSize(image,page,'mifito').w,mm(85));
 near(importedImageSize({...image,physicalSize:undefined},page).w,mm(70));
});
test('source edits change margins without rescaling axes and keep deliberate manual scale',()=>{
 const next={width:170.12345,height:130.98765};
 for(const scale of [1,.5,1.5]){
  const panel={w:physical.width*scale,h:physical.height*scale};
  const size=replacedImageSize('plot',panel,physical,next);
  near(size.w/next.width,scale);near(size.h/next.height,scale);
  const back=replacedImageSize('plot',size,next,physical);
  near(back.w,panel.w);near(back.h,panel.h);
 }
});
test('legacy unknown dimensions and MiFiTo do not unexpectedly resize on source edit',()=>{
 const panel={w:150,h:110},next={width:170,height:130};
 for(const [app,previous]of [['plot',null],['plot',{width:0,height:1}],['mifito',physical]])assert.deepEqual(replacedImageSize(app,panel,previous,next),panel);
});
