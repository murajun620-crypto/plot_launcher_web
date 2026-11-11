export const MATRIX_TYPES=['Surface Map','Surface Histogram'];
export const isMatrixPlot=type=>MATRIX_TYPES.includes(type);
export const isCombinedHistogram=config=>config?.plotType==='Surface Histogram'&&config.options?.matrix?.histSheetMode!=='separate';
export const MATRIX_DEFAULTS={range:'A1:S19',sheets:[],pitchX:5,pitchY:5,originX:0,originY:0,valueLabel:'Surface roughness, Sa',valueUnit:'nm',palette:'turbo',colorMin:'',colorMax:'',markerSize:30,mapStyle:'points',edgeColor:'none',edgeWidth:.25,equalAspect:true,colorbar:true,colorbarVisibility:{},colorbarTickGapPercent:'',colorbarTitleGapPercent:'',frame:false,binMin:'',binMax:'',binWidth:'',binCount:'',histSheetMode:'separate',cdfInterpolation:'smooth',histStyle:'overlay',histAlpha:.55,cumulative:true,cumulativeColors:{}};
export const matrixColorbarVisible=(options,index)=>options?.colorbarVisibility?.[index]??options?.colorbar??true;
export function validateMatrixOptions(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('マップ・分布の設定を確認してください。');
 const value={...structuredClone(MATRIX_DEFAULTS),...structuredClone(raw),histSheetMode:raw.histSheetMode===undefined?'combined':raw.histSheetMode};
 if(typeof value.range!=='string'||!/^\s*\$?[a-z]{1,3}\$?\d+:\$?[a-z]{1,3}\$?\d+\s*$/i.test(value.range))throw Error('セル範囲はA1:S19のように指定してください。');
 if(!Array.isArray(value.sheets)||!value.sheets.length||value.sheets.length>32||new Set(value.sheets).size!==value.sheets.length||value.sheets.some(i=>!Number.isInteger(i)||i<0||i>1000))throw Error('対象のシートを1〜32個選択してください。');
 for(const key of ['pitchX','pitchY','originX','originY','markerSize','edgeWidth','histAlpha'])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||Math.abs(value[key])>1e15)throw Error('座標・描画の数値を確認してください。');
 if(value.pitchX<=0||value.pitchY<=0||value.markerSize<=0||value.markerSize>1000||value.edgeWidth<0||value.edgeWidth>10||value.histAlpha<0||value.histAlpha>1)throw Error('座標間隔・点の大きさ・不透明度を確認してください。');
 for(const key of ['colorMin','colorMax','binMin','binMax','binWidth','binCount'])if(value[key]!==''&&(!Number.isFinite(Number(value[key]))||Math.abs(Number(value[key]))>1e15))throw Error('範囲・ビンの値を確認してください。');
 for(const key of ['colorbarTickGapPercent','colorbarTitleGapPercent'])if(value[key]!==''&&(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||value[key]>20))throw Error('カラーバーの文字余白は短辺の0〜20%で指定してください。');
 for(const [a,b]of [['colorMin','colorMax'],['binMin','binMax']])if(value[a]!==''&&value[b]!==''&&Number(value[b])<=Number(value[a]))throw Error('最大値は最小値より大きくしてください。');
 if(value.binWidth!==''&&Number(value.binWidth)<=0||value.binCount!==''&&(!Number.isInteger(Number(value.binCount))||Number(value.binCount)<1||Number(value.binCount)>500))throw Error('ビン幅は正の値、ビン数は1〜500の整数にしてください。');
 if(value.binWidth!==''&&value.binCount!=='')throw Error('ビン幅とビン数はいずれか一方を指定してください。');
 for(const [key,choices]of Object.entries({palette:['viridis','plasma','turbo','jet','cividis','gray'],mapStyle:['points','cells'],histStyle:['overlay','grouped','step'],histSheetMode:['separate','combined'],cdfInterpolation:['smooth','linear']}))if(!choices.includes(value[key]))throw Error('マップ・ヒストグラムの表示方法を確認してください。');
 for(const key of ['equalAspect','colorbar','frame','cumulative'])if(typeof value[key]!=='boolean')throw Error('マップ・分布の表示設定を確認してください。');
 if(!value.colorbarVisibility||Array.isArray(value.colorbarVisibility)||typeof value.colorbarVisibility!=='object'||Object.keys(value.colorbarVisibility).length>1001||Object.entries(value.colorbarVisibility).some(([key,visible])=>!/^\d{1,4}$/.test(key)||Number(key)>1000||typeof visible!=='boolean'))throw Error('シートごとのカラーバー表示を確認してください。');
 for(const key of ['valueLabel','valueUnit'])if(typeof value[key]!=='string'||value[key].length>200)throw Error('値のラベル・単位を確認してください。');
 if(typeof value.edgeColor!=='string'||!/^none$|^#[\da-f]{6}$/i.test(value.edgeColor))throw Error('点の縁色を確認してください。');
 if(!value.cumulativeColors||Array.isArray(value.cumulativeColors)||typeof value.cumulativeColors!=='object'||Object.keys(value.cumulativeColors).length>32||Object.entries(value.cumulativeColors).some(([key,color])=>!/^\d{1,4}$/.test(key)||typeof color!=='string'||!/^auto$|^#[\da-f]{6}$/i.test(color)))throw Error('累積線の色を確認してください。');
 return value;
}
