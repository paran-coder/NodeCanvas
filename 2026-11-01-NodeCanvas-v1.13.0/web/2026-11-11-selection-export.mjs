const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,value)=>{
 for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);
 return value;
});
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];
 return (crc^0xffffffff)>>>0;
}
function imageBytes(data){
 const comma=data.indexOf(',');
 return Uint8Array.from(atob(data.slice(comma+1)),char=>char.charCodeAt(0));
}
export function safeFileLabel(label){
 return String(label).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().replace(/[. ]+$/g,'').slice(0,80)||'이미지';
}
function header(size){const bytes=new Uint8Array(size);return [bytes,new DataView(bytes.buffer)];}
export function createImageZip(images){
 const entries=[],central=[];
 let offset=0,centralSize=0;
 for(const [index,{label,data}] of images.entries()){
  const type=data.slice(11,data.indexOf(';'));
  const filename=encoder.encode(String(index+1).padStart(3,'0')+'-'+safeFileLabel(label)+'.'+(type==='jpeg'?'jpg':type));
  const body=imageBytes(data),crc=crc32(body);
  const [local,l]=header(30),[directory,d]=header(46);
  l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
  l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,body.length,true);
  l.setUint32(22,body.length,true);l.setUint16(26,filename.length,true);
  d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);
  d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,body.length,true);
  d.setUint32(24,body.length,true);d.setUint16(28,filename.length,true);d.setUint32(42,offset,true);
  entries.push(local,filename,body);central.push(directory,filename);
  offset+=local.length+filename.length+body.length;
  centralSize+=directory.length+filename.length;
 }
 const [end,e]=header(22);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,images.length,true);e.setUint16(10,images.length,true);
 e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
 return new Blob([...entries,...central,end],{type:'application/zip'});
}
export async function createComparisonSheet(images){
 const columns=Math.min(images.length,4),tileWidth=280,tileHeight=226,padding=12;
 const canvas=document.createElement('canvas');
 canvas.width=columns*tileWidth;
 canvas.height=Math.ceil(images.length/columns)*tileHeight;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f3f4f6';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.font='16px system-ui, sans-serif';ctx.textBaseline='middle';
 for(const [index,{label,data}] of images.entries()){
  const x=(index%columns)*tileWidth+padding,y=Math.floor(index/columns)*tileHeight+padding;
  const w=tileWidth-2*padding,h=176;
  ctx.fillStyle='#fff';ctx.fillRect(x,y,w,tileHeight-2*padding);
  const image=await createImageBitmap(new Blob([imageBytes(data)],{type:data.slice(5,data.indexOf(';'))}));
  try{
   const scale=Math.min(w/image.width,h/image.height);
   const width=image.width*scale,height=image.height*scale;
   ctx.drawImage(image,x+(w-width)/2,y+(h-height)/2,width,height);
  }finally{image.close();}
  ctx.fillStyle='#18181b';
  const caption=(index+1)+'. '+label.replace(/\s+/g,' ');
  let shown=caption;
  while(ctx.measureText(shown).width>w-16&&shown.length>1)shown=shown.slice(0,-2)+'…';
  ctx.fillText(shown,x+8,y+h+13);
 }
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('비교 시트를 저장할 수 없습니다.')),'image/png'));
}
