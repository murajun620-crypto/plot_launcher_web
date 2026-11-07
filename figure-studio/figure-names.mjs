// Figure IDs identify content; a leading Figure number describes its position.
// Keep custom titles and suffixes intact, and call only after book operations.
export function renumberFigureNames(figures){
 figures.forEach((figure,index)=>{
  if(typeof figure.name==='string')figure.name=figure.name.replace(/^((?:Figure|Fig)\.?\s*)\d+(?=$|[\s:：—–-])/i,(_,prefix)=>prefix+(index+1));
 });
 return figures;
}
