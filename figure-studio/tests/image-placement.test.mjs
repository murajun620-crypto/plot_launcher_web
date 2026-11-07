import test from 'node:test';
import assert from 'node:assert/strict';
import {mm,newDocument} from '../model.mjs';
import {importedImageSize,replacedImageSize,replacedMiFiToImageSize,imageInsertionPoint} from '../image-placement.mjs';
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

test('explicit MiFiTo paste keeps the cropped body size and extra outer bands without fitting',()=>{
 const physicalSize={width:mm(87),height:mm(64)},mifitoBodySize={width:mm(80),height:mm(60)};
 const size=importedImageSize({...image,physicalSize,mifitoBodySize},page,'mifito');
 assert.deepEqual(size,{w:mm(87),h:mm(64)});
 near(size.w*mifitoBodySize.width/physicalSize.width,mm(80));near(size.h*mifitoBodySize.height/physicalSize.height,mm(60));
 const large={physicalSize:{width:mm(400),height:mm(300)},mifitoBodySize:{width:mm(390),height:mm(285)}};
 const largeSize=importedImageSize({...image,...large},page,'mifito');
 assert.deepEqual(largeSize,{w:mm(400),h:mm(300)});assert.deepEqual(imageInsertionPoint(page,largeSize),{x:0,y:0});
});

test('legacy and invalid MiFiTo body intent retain existing fit behavior',()=>{
 for(const mifitoBodySize of [undefined,{width:0,height:1},{width:Infinity,height:1},{width:physical.width+1,height:10},{width:10,height:physical.height+1},{width:'72',height:10}])near(importedImageSize({...image,mifitoBodySize},page,'mifito').w,mm(85));
});

test('MiFiTo updates grow outer bands while preserving body scale and deliberate manual resizing',()=>{
 const previous={width:mm(80),height:mm(60)},next={width:mm(92),height:mm(68)},body={width:mm(80),height:mm(60)};
 for(const [scaleX,scaleY]of [[1,1],[.5,.5],[1.5,2]]){
  const panel={w:previous.width*scaleX,h:previous.height*scaleY};
  const size=replacedMiFiToImageSize(panel,previous,next,body,body);
  near(size.w*body.width/next.width,body.width*scaleX);near(size.h*body.height/next.height,body.height*scaleY);
  const back=replacedMiFiToImageSize(size,next,previous,body,body);near(back.w,panel.w);near(back.h,panel.h);
 }
 const largerBody={width:mm(160),height:mm(120)},largerOuter={width:mm(172),height:mm(128)};
 const resized=replacedMiFiToImageSize({w:previous.width,h:previous.height},previous,largerOuter,body,largerBody);
 near(resized.w*largerBody.width/largerOuter.width,mm(160));near(resized.h*largerBody.height/largerOuter.height,mm(120));
});

test('first explicit MiFiTo size replaces legacy fit; missing or invalid next intent preserves placement',()=>{
 const panel={w:150,h:110},next={width:mm(87),height:mm(64)},body={width:mm(80),height:mm(60)};
 for(const previousBody of [undefined,{width:0,height:10},{width:1000,height:10}])assert.deepEqual(replacedMiFiToImageSize(panel,physical,next,previousBody,body),{w:next.width,h:next.height});
 assert.deepEqual(replacedMiFiToImageSize(panel,null,next,null,body),{w:next.width,h:next.height});
 for(const nextBody of [undefined,{width:0,height:10},{width:next.width+1,height:10}])assert.deepEqual(replacedMiFiToImageSize(panel,physical,next,null,nextBody),panel);
 assert.deepEqual(replacedMiFiToImageSize(panel,physical,null,null,body),panel);
});
