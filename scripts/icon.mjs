import { mkdirSync, writeFileSync } from 'node:fs';
const size=32, dib=Buffer.alloc(40+size*size*4+size*4);
dib.writeUInt32LE(40,0);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(size*size*4,20);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){const d=(x-16)**2+(y-16)**2;const i=40+((size-1-y)*size+x)*4;const ring=d>100&&d<180;const triangle=y>8&&y<25&&Math.abs(x-16)<(y-7)*.55&&Math.abs(x-16)>(y-10)*.4;if(ring||triangle){dib[i]=250;dib[i+1]=210;dib[i+2]=20;dib[i+3]=255;}}
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=size;header[7]=size;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(dib.length,14);header.writeUInt32LE(22,18);
mkdirSync('apps/desktop/src-tauri/icons',{recursive:true});writeFileSync('apps/desktop/src-tauri/icons/icon.ico',Buffer.concat([header,dib]));
