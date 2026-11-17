// Load the four ordinary faces as one family, without importing every weight.
export function localFontFaces(fonts,family){
 const faces=fonts.filter(font=>font.family===family),chosen=[];
 if(!faces.length)return chosen;
 const style=font=>String(font.style||font.fullName||'Regular').toLowerCase();
 const italic=font=>/italic|oblique|斜体/.test(style(font));
 const bold=font=>/bold|太字/.test(style(font));
 const regular=faces.find(font=>/^(regular|normal|book|roman|標準)$/.test(style(font)))||faces.find(font=>!italic(font)&&!bold(font))||faces[0];
 for(const face of [regular,faces.find(font=>italic(font)&&!bold(font)),faces.find(font=>bold(font)&&!italic(font)),faces.find(font=>bold(font)&&italic(font))])if(face&&!chosen.includes(face))chosen.push(face);
 return chosen;
}
