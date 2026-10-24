// Multiplicative conversions only: never infer a physical unit from its label.
const prefixes = [['p',1e-12],['n',1e-9],['μ',1e-6],['m',1e-3],['',1],['k',1e3],['M',1e6],['G',1e9]];
const prefixed = (base, suffix='') => prefixes.map(([prefix,factor])=>[`${prefix}${base}${suffix}`,factor]);
export const UNIT_FAMILIES = [
  [['ns',1e-9],['μs',1e-6],['ms',1e-3],['s',1],['min',60],['h',3600]],
  [['pm',1e-12],['Å',1e-10],['nm',1e-9],['μm',1e-6],['mm',1e-3],['cm',1e-2],['m',1],['km',1e3]],
  prefixed('A'), prefixed('V'), prefixed('A','/cm$^2$'),
  [['eV',1],['keV',1e3],['MeV',1e6]],
  [['Pa',1],['kPa',1e3],['MPa',1e6],['GPa',1e9]],
  [['N',1],['mN',1e-3],['μN',1e-6]],
  [['Hz',1],['kHz',1e3],['MHz',1e6],['GHz',1e9]],
  [['Ω',1],['kΩ',1e3],['MΩ',1e6]],
  [['mol/L',1],['mmol/L',1e-3],['μmol/L',1e-6]],
  [['mg/L',1],['μg/L',1e-3],['g/L',1e3]],
  [['S/cm',1],['mS/cm',1e-3],['μS/cm',1e-6]],
  [['nm/min',1e-9/60],['μm/min',1e-6/60],['nm/h',1e-9/3600],['μm/h',1e-6/3600],['m/s',1]],
  [['m$^{-1}$',1],['cm$^{-1}$',100],['mm$^{-1}$',1e3],['μm$^{-1}$',1e6],['nm$^{-1}$',1e9]],
];
const normal = unit => String(unit ?? '').replace(/\\micro\b|\\micro(?=[A-Za-z])/g,'μ').replace(/µ|\\mu/g,'μ')
  .replace(/[\s${}]/g,'').replace(/²/g,'^2').replace(/⁻¹/g,'^-1').replace(/^u(?=[AVms])/,'μ');
export function unitConversion(from, to) {
  for (const family of UNIT_FAMILIES) {
    const a=family.find(([unit])=>normal(unit)===normal(from)),b=family.find(([unit])=>normal(unit)===normal(to));
    if (a && b) return Number((a[1]/b[1]).toPrecision(15));
  }
  return null;
}
export function unitSuggestion(axis, info) {
  const maximum=Number(info?.tickMax);
  if (!info || info.categorical || info.hidden || !Number.isFinite(maximum) || maximum<=0 || (maximum>=.1*(1-1e-12) && maximum<=1000*(1+1e-12))) return null;
  const family=UNIT_FAMILIES.find(items=>items.some(([unit])=>normal(unit)===normal(info.unit)));
  const candidates=(family || []).map(([unit])=>({axis,from:info.unit,to:unit,maximum,factor:unitConversion(info.unit,unit)}))
    .filter(item=>item.factor && item.factor!==1 && maximum*item.factor>=.1 && maximum*item.factor<=1000);
  candidates.sort((a,b)=>Math.abs(Math.log10(maximum*a.factor)-1.5)-Math.abs(Math.log10(maximum*b.factor)-1.5));
  return candidates[0] || {axis,from:info.unit,maximum,factor:null};
}
const scaled = (value, factor) => value === '' || value === undefined || value === null ? value :
  Number((Number(value)*factor).toPrecision(12));
export function scaleAxis(config, axis, factor) {
  if (!['x','y','y2'].includes(axis) || !Number.isFinite(factor) || factor<=0) throw new Error('単位の換算倍率を確認してください。');
  const next=structuredClone(config),axes=next.axes;
  const total=Number(axes[`${axis}UnitScale`] ?? 1)*factor;
  if (!Number.isFinite(total) || total<1e-30 || total>1e30) throw new Error('単位の換算倍率が範囲外です。');
  axes[`${axis}UnitScale`]=Number(total.toPrecision(12));
  for (const suffix of ['Min','Max','Step','MinorStep']) {
    const key=`${axis}${suffix}`;
    if (axes[key]!=='' && axes[key]!==undefined) axes[key]=String(scaled(axes[key],factor));
  }
  for (const series of next.series) {
    if (axis==='x') series.xOffset=scaled(series.xOffset ?? 0,factor);
    else if ((series.yAxis==='right'?'y2':'y')===axis) series.yOffset=scaled(series.yOffset ?? 0,factor);
  }
  const annotationY=next.series.some(series=>series.yAxis!=='right')?'y':'y2';
  for (const note of next.annotations || []) if (note.coordinate_system==='data') {
    const name=axis==='x'?'x':axis===annotationY?'y':null;
    if (name) for (const suffix of ['', '1','2']) if (note[`${name}${suffix}`]!==undefined) note[`${name}${suffix}`]=scaled(note[`${name}${suffix}`],factor);
  }
  return next;
}
export function convertAxisUnit(config,axis,from,to) {
  const factor=unitConversion(from,to);
  if (!factor) throw new Error('この単位の組み合わせは換算できません。');
  if (factor!==1 && axis!=='x' && config.plotType==='Raman 3D' && config.options?.normalize!==false) throw new Error('強度を換算する場合は、先に正規化を解除してください。');
  const next=scaleAxis(config,axis,factor);next.axes[`${axis}Unit`]=to;return next;
}
export function resetPresetUnitScales(config) {
  for (const axis of ['x','y']) {
    const factor=Number(config.axes[`${axis}UnitScale`] ?? 1);
    if (factor!==1) Object.assign(config,scaleAxis(config,axis,1/factor));
  }
}
