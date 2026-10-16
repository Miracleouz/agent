export const maxPhotoBytes=8*1024*1024;
const invalid=()=>Object.assign(new Error('Envie uma foto JPEG, PNG ou WebP válida de até 8 MB.'),{status:400});
export function photoInfo(data){
 if(!Buffer.isBuffer(data)||!data.length||data.length>maxPhotoBytes)throw invalid();
 if(data.length>=45&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.readUInt32BE(8)===13&&data.toString('ascii',12,16)==='IHDR'&&data.readUInt32BE(16)>0&&data.readUInt32BE(20)>0&&data.includes(Buffer.from('IDAT'))&&data.subarray(-12).equals(Buffer.from('0000000049454e44ae426082','hex')))return{type:'image/png',extension:'png'};
 if(data.length>=12&&data[0]===255&&data[1]===216&&data[2]===255&&data[data.length-2]===255&&data[data.length-1]===217)return{type:'image/jpeg',extension:'jpg'};
 if(data.length>=20&&data.toString('ascii',0,4)==='RIFF'&&data.readUInt32LE(4)+8===data.length&&data.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(data.toString('ascii',12,16)))return{type:'image/webp',extension:'webp'};
 throw invalid();
}
