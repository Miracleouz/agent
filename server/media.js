import {photoInfo,maxPhotoBytes} from './images.js';
export const maxMediaBytes=32*1024*1024;
export function mediaInfo(data,mime=''){
 if(!Buffer.isBuffer(data)||!data.length||data.length>maxMediaBytes)throw Object.assign(new Error('Arquivo inválido ou maior que 32 MB.'),{status:400});
 try{const image=photoInfo(data);return{...image,kind:'image'};}catch{}
 const base=String(mime).split(';')[0].toLowerCase();
 if(data.toString('ascii',0,4)==='OggS')return{type:'audio/ogg',extension:'ogg',kind:'audio'};
 if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WAVE')return{type:'audio/wav',extension:'wav',kind:'audio'};
 if(data.toString('ascii',0,3)==='ID3'||data[0]===255&&(data[1]&224)===224)return{type:'audio/mpeg',extension:'mp3',kind:'audio'};
 if(data.length>16&&data.toString('ascii',4,8)==='ftyp'){const audio=base.startsWith('audio/')||data.toString('ascii',8,12)==='M4A ';return{type:audio?'audio/mp4':'video/mp4',extension:audio?'m4a':'mp4',kind:audio?'audio':'video'};}
 if(data.subarray(0,4).equals(Buffer.from([26,69,223,163])))return{type:base.startsWith('audio/')?'audio/webm':'video/webm',extension:'webm',kind:base.startsWith('audio/')?'audio':'video'};
 throw Object.assign(new Error('Envie JPEG, PNG, WebP, MP4, WebM, OGG, MP3, WAV ou M4A válidos.'),{status:400});
}
export function sendMediaBytes(req,res,row){const data=Buffer.from(row.media_data);res.set({'Content-Type':row.media_type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Disposition':'inline','Accept-Ranges':'bytes'});if(!req.headers.range)return res.send(data);const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let start=Number(match?.[1]||0),end=match?.[2]?Number(match[2]):data.length-1;if(match&&!match[1]&&match[2]){start=Math.max(0,data.length-Number(match[2]));end=data.length-1;}if(!match||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=data.length){res.set('Content-Range',`bytes */${data.length}`);return res.status(416).end();}end=Math.min(end,data.length-1);res.set('Content-Range',`bytes ${start}-${end}/${data.length}`);res.status(206).send(data.subarray(start,end+1));}
