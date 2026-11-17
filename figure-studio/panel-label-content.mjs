// Keep the editable label and supplemental text separate; the normal text
// renderer still owns fonts, TeX, sizing, export and group transforms.
export function validPanelLabelContent(value){
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  typeof value.text==='string'&&value.text.length<=100000&&
  typeof value.subtext==='string'&&value.subtext.length<=100000&&
  typeof value.parentheses==='boolean';
}

function coreText(text){
 let core=text.trim();
 while(core.startsWith('(')&&core.endsWith(')')&&core.slice(1,-1).trim())core=core.slice(1,-1).trim();
 return core;
}

export function panelLabelDisplay(content){
 if(!validPanelLabelContent(content))throw Error('ラベルの文字列と補足テキストを確認してください。');
 const core=coreText(content.text),main=core?(content.parentheses?`(${core})`:core):'',sub=content.subtext.trim();
 const text=[main,sub].filter(Boolean).join(' ');
 if(text.length>100000)throw Error('ラベルの文字数が多すぎます。');
 return text;
}

export function readPanelLabelContent(object){
 const saved=object.panelLabelContent;
 if(validPanelLabelContent(saved)&&panelLabelDisplay(saved)===object.text)return {...saved};
 // Old projects and labels edited as ordinary text remain editable as-is.
 const text=String(object.text??''),parentheses=text.startsWith('(')&&text.endsWith(')')&&!!text.slice(1,-1).trim();
 return {text:parentheses?coreText(text):text,subtext:'',parentheses};
}

export function writePanelLabelContent(object,content){
 const text=panelLabelDisplay(content);
 object.panelLabelContent={text:coreText(content.text),subtext:content.subtext.trim(),parentheses:content.parentheses};
 object.text=text;object.name=`パネルラベル ${text.slice(0,120)}`;
}
