import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {copySheetSources,groupSheetSources,MAX_SHEET_SOURCES} from '../sheet-sources.mjs';
import {makeProject,parseProject} from '../state.js';

test('overlay projects keep non-adjacent sheets and store the Excel file once',()=>{
 const raw=JSON.parse(readFileSync(new URL('../samples/general.plotproject',import.meta.url),'utf8'));
 const {data}=parseProject(raw);
 const files=[0,2].map(sheetIndex=>({filename:'sample.xlsx',bytes:data.bytes,sheetIndex,headerRow:1}));
 const project=makeProject(raw.settings,{...data,files},[],raw.workspace);
 assert.ok(project.data.files[0].base64);
 assert.equal(project.data.files[1].base64,undefined);
 assert.equal(project.data.files[1].sameFileAs,0);
 const restored=parseProject(JSON.parse(JSON.stringify(project))).data.files;
 assert.deepEqual(restored.map(file=>file.sheetIndex),[0,2]);
 assert.equal(restored[0].bytes,restored[1].bytes);
 const copies=copySheetSources(restored);
 assert.notEqual(copies[0].bytes,restored[0].bytes);
 assert.equal(copies[0].bytes,copies[1].bytes);
 assert.deepEqual(groupSheetSources(copies).sourceIndexes,[0,0]);
 for(const sameFileAs of [1,-1,'0']){
  const invalid=structuredClone(project);invalid.data.files[1].sameFileAs=sameFileAs;
  assert.throws(()=>parseProject(invalid),/参照が不正/);
 }
 const other=structuredClone(project);other.data.files[1].filename='other.xlsx';
 assert.throws(()=>parseProject(other),/参照が不正/);
});

function sheetPicker() {
 const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=src.indexOf('function updateSheetPickerCount('),end=src.indexOf("$('#sheet-picker-list').addEventListener",start);
 const controls=new Map(),$=id=>{
  if(!controls.has(id))controls.set(id,Object.assign(new EventTarget(),{children:[],replaceChildren(...children){this.children=children;}}));
  return controls.get(id);
 };
 const document={createElement:()=>({children:[],append(...children){this.children.push(...children);}}),createTextNode:value=>value};
 const $$=selector=>$('#sheet-picker-list').children.map(label=>label.children[0]).filter(input=>!selector.endsWith(':checked')||input.checked);
 const open=Function('$','$$','document','showDialog','MAX_SHEET_SOURCES',src.slice(start,end)+'return chooseWorkbookSheets;')($,$$,document,()=>{},MAX_SHEET_SOURCES);
 return {open,$,inputs:()=>$$('input'),close:value=>{const dialog=$('#sheet-picker');dialog.returnValue=value;dialog.dispatchEvent(new Event('close'));}};
}

test('Excel import defaults to separate, and the overlay returns exactly the checked sheets',async()=>{
 const picker=sheetPicker(),pending=picker.open(['A','B','C'],'sample.xlsx',null,{allowOverlay:true});
 assert.equal(picker.$('#sheet-picker-layout').value,'separate');
 assert.equal(picker.$('#sheet-picker-layout-field').hidden,false);
 assert.ok(picker.inputs().every(input=>input.checked));
 picker.$('#sheet-picker-layout').value='overlay';picker.inputs()[1].checked=false;
 picker.close('apply');assert.deepEqual(await pending,{sheets:[0,2],overlay:true});
 const edit=picker.open(['A','B','C'],'sample.xlsx',[2]);
 assert.equal(picker.$('#sheet-picker-layout-field').hidden,true);
 picker.close('apply');assert.deepEqual(await edit,{sheets:[2],overlay:false});
});

test('cancel and empty selection do not import any sheet',async()=>{
 const picker=sheetPicker(),pending=picker.open(['A','B'],'sample.xlsx',null,{allowOverlay:true});
 picker.close('cancel');assert.equal(await pending,null);
 const none=picker.open(['A','B'],'sample.xlsx',[],{allowOverlay:true});
 assert.equal(picker.$('#sheet-picker-apply').disabled,true);
 picker.close('apply');assert.equal(await none,null);
});
