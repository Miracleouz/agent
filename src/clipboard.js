export function pastedImage(event){
 const clipboard=event.clipboardData;
 const item=Array.from(clipboard?.items||[]).find(item=>item.kind==='file'&&item.type.startsWith('image/'));
 return item?.getAsFile()||Array.from(clipboard?.files||[]).find(file=>file.type.startsWith('image/'))||null;
}
export function photoError(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))return 'Cole uma imagem PNG, JPEG ou WebP.';
 if(file.size>8*1024*1024)return 'A foto deve ter até 8 MB.';
 return null;
}
