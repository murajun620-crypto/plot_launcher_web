/** Sidebar selection and ordering operate on stable Figure IDs, never on labels. */
export function orderedFigureIds(order, ids) {
  const wanted = new Set(ids);
  return order.filter(id => wanted.has(id));
}

export function selectFigureIds(order, current, id, {toggle=false, range=false, anchor=null}={}) {
  if (!order.includes(id)) return orderedFigureIds(order, current);
  if (range) {
    const start = order.indexOf(anchor), end = order.indexOf(id);
    const slice = start < 0 ? [id] : order.slice(Math.min(start,end), Math.max(start,end)+1);
    return orderedFigureIds(order, toggle ? [...current,...slice] : slice);
  }
  if (toggle) return orderedFigureIds(order, current.includes(id) ? current.filter(v=>v!==id) : [...current,id]);
  return [id];
}

/** Move the selected Figures, keeping their document order, before a remaining ID. */
export function reorderFigures(figures, ids, beforeId=null) {
  const wanted = new Set(ids), moving = figures.filter(f=>wanted.has(f.id));
  if (!moving.length) return figures.slice();
  // A target inside the moving group is not a valid insertion boundary.
  if (beforeId!==null && wanted.has(beforeId)) return figures.slice();
  const remaining = figures.filter(f=>!wanted.has(f.id));
  const index = beforeId===null ? remaining.length : remaining.findIndex(f=>f.id===beforeId);
  if (index<0) return figures.slice();
  return [...remaining.slice(0,index),...moving,...remaining.slice(index)];
}
