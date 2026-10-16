export function sendAvatar(store,res,id){
 const photo=store.get("SELECT data,media_type,version FROM whatsapp_avatars WHERE remote_id=? AND status='ready'",id);
 if(!photo?.data)return res.status(404).json({error:'Foto indisponível.'});
 res.set({'Content-Type':photo.media_type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=300','ETag':'"'+photo.version+'"'}).send(Buffer.from(photo.data));
}
