export const FONT_SIZES=Object.freeze([6,7,8,9,10,11,12,14,16,18,20,22,24,28,32,36,40,44,48,54,60,66,72,80,88,96]);
export const TEXT_FORMAT_ACTIONS=Object.freeze(['bold','italic','underline','font-grow','font-shrink','font-up','font-down','text-left','text-center','text-right','text-justify']);
export function fontSizeForAction(value,action){
 const size=Math.max(1,Math.min(1000,Number(value)||9));
 return action==='font-up'?Math.min(1000,size+1):action==='font-down'?Math.max(1,size-1):action==='font-grow'?(FONT_SIZES.find(n=>n>size)||Math.min(1000,size+8)):action==='font-shrink'?([...FONT_SIZES].reverse().find(n=>n<size)||Math.max(1,size-1)):size;
}
export function formatText(value,action){
 if(['bold','italic','underline'].includes(action))return {...value,[action]:!value[action]};
 if(action.startsWith('font-'))return {...value,fontSize:fontSizeForAction(value.fontSize,action)};
 if(/^text-(left|center|right|justify)$/.test(action))return {...value,textAlign:action.slice(5)};
 return value;
}
