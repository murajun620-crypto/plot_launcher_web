// Use the actual rendered SVG boxes, including text rotation and legend symbols.
export function alignmentOffsets(items, operation) {
  const valid = ['left','center_h','right','top','center_v','bottom','distribute_h','distribute_v'];
  if (!valid.includes(operation)) throw Error('整列の方法を選んでください。');
  if (items.length < (operation.startsWith('distribute_') ? 3 : 2)) return [];
  if (items.some(item => !Array.isArray(item.box) || item.box.length !== 4 || !item.box.every(Number.isFinite))) throw Error('描画が完了してから整列してください。');
  const axis = ['left','center_h','right','distribute_h'].includes(operation) ? 0 : 1;
  const start = item => item.box[axis], size = item => item.box[axis+2], center = item => start(item)+size(item)/2;
  const moves = new Map(items.map(item => [item.id, 0]));
  if (operation.startsWith('distribute_')) {
    const sorted = [...items].sort((a,b) => center(a)-center(b));
    const first = center(sorted[0]), step = (center(sorted.at(-1))-first)/(sorted.length-1);
    sorted.forEach((item,index) => moves.set(item.id, first+step*index-center(item)));
  } else {
    const low = Math.min(...items.map(start)), high = Math.max(...items.map(item => start(item)+size(item)));
    const edge = ['left','top'].includes(operation) ? 'start' : ['right','bottom'].includes(operation) ? 'end' : 'center';
    const target = edge==='start' ? low : edge==='end' ? high : (low+high)/2;
    items.forEach(item => moves.set(item.id, target-(edge==='start'?start(item):edge==='end'?start(item)+size(item):center(item))));
  }
  return items.map(item => ({id:item.id,dx:axis===0?moves.get(item.id):0,dy:axis===1?moves.get(item.id):0}));
}
