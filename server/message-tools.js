import {randomUUID,createHash} from 'node:crypto';
import multer from 'multer';
import {z} from 'zod';
import {maxPhotoBytes,photoInfo} from './images.js';
export const editWindow=15*60000;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function messageToolsRoutes({app,store,accounts,agent,whatsapp,getChat,visibleChat,queued,canControl}){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:maxPhotoBytes,files:1,fields:3}});
 const manual=(req,chat,version)=>{if(chat.mode!=='manual')throw fail('Ative "Responder manual" antes de enviar ou editar.',409);canControl(req,chat);if(version!==chat.routing_version)throw fail('O atendimento mudou. Confira a conversa antes de continuar.',409);};
 const getMessage=(chat,id)=>{const message=store.message(id);if(!message||message.chat_id!==chat.id)throw fail('Mensagem não encontrada.',404);return message;};
 app.get('/api/chats/:id/messages/:messageId/photo',(req,res)=>{
  const chat=visibleChat(req),message=getMessage(chat,req.params.messageId);if(!message.media_type)throw fail('Foto não encontrada.',404);
  const data=store.get('SELECT media_data FROM messages WHERE id=?',message.id)?.media_data;if(!data)throw fail('Foto não encontrada.',404);
  res.set({'Content-Type':message.media_type,'X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="foto"','Cache-Control':'private, no-store'}).send(Buffer.from(data));
 });
 app.get('/api/chats/:id/messages/:messageId/edits',(req,res)=>{const chat=visibleChat(req),message=getMessage(chat,req.params.messageId);res.json(store.all('SELECT id,old_body,new_body,editor_name,requested,completed,status,error FROM message_edits WHERE message_id=? ORDER BY requested,rowid',message.id));});
 app.post('/api/chats/:id/photo',(req,_res,next)=>{visibleChat(req);next();},upload.single('photo'),async(req,res)=>{
  const {caption,version,requestId}=z.object({caption:z.string().trim().max(4000).default(''),version:z.coerce.number().int().min(0),requestId:z.uuid()}).strict().parse(req.body);
  if(!req.file)throw fail('Escolha uma foto para enviar.');const info=photoInfo(req.file.buffer),hash=createHash('sha256').update(req.file.buffer).digest('hex');
  const result=await queued(req,async(chat,user)=>{
   manual(req,chat,version);
   const previous=store.get('SELECT id,chat_id,body,media_hash FROM messages WHERE author_id=? AND manual_request_id=?',user.id,requestId);
   if(previous){if(previous.chat_id!==chat.id||previous.body!==caption||previous.media_hash!==hash)throw fail('Esta solicitação já foi usada. Confira o histórico antes de selecionar a foto novamente.',409);return store.message(previous.id);}
   if(!chat.assigned_user_id)store.openChat(chat.id,user);store.cancelFollowups(chat.id);
   const transportCaption=store.settings().signHumanMessages?`*${user.name}*: ${caption||'Foto'}`:caption;
   const message=store.addMessage({chatId:chat.id,direction:'owner',body:caption,status:'pending',author:user,deliveryBody:transportCaption});
   store.run('UPDATE messages SET media_type=?,media_name=?,media_size=?,media_data=?,media_hash=?,manual_request_id=? WHERE id=?',info.type,'foto.'+info.extension,req.file.buffer.length,req.file.buffer,hash,requestId,message.id);store.changed();
   try{
    const providerId=chat.channel==='simulator'?null:await whatsapp.sendPhoto(chat,{type:info.type,data:req.file.buffer,name:'foto.'+info.extension},transportCaption);
    store.run("UPDATE messages SET status='sent',provider_id=?,sent_at=? WHERE id=?",providerId||null,agent.now(),message.id);
   }catch(error){store.run('UPDATE messages SET status=?,error=? WHERE id=?',error.uncertain?'uncertain':'failed','Não foi possível confirmar o envio da foto. Confira no WhatsApp antes de selecionar e enviar novamente.',message.id);store.event('photo_error','O envio de uma foto não foi confirmado. Confira o chat e a conexão.');}
   store.changed();return store.message(message.id);
  });res.status(result.status==='failed'?502:result.status==='uncertain'?202:201).json(result.status==='failed'?{error:result.error,message:result}:result);
 });
 app.patch('/api/chats/:id/messages/:messageId',async(req,res)=>{
  const input=z.object({body:z.string().trim().max(4000),version:z.number().int().min(0),editVersion:z.number().int().min(0)}).strict().parse(req.body);
  const result=await queued(req,async(chat,user)=>{
   manual(req,chat,input.version);if(!chat.assigned_user_id)throw fail('Assuma o atendimento antes de editar.',409);const message=getMessage(chat,req.params.messageId),now=agent.now();
   if(message.direction!=='owner'||message.status!=='sent')throw fail('Somente mensagens manuais enviadas com sucesso podem ser editadas.',403);
   if(message.author_id!==user.id&&user.role!=='admin')throw fail('Você só pode editar suas próprias mensagens.',403);
   if(!message.media_type&&!input.body)throw fail('A mensagem não pode ficar vazia.');
   if(now-(message.sent_at??message.created)>=editWindow||now<(message.sent_at??message.created))throw fail('O prazo de 15 minutos para editar esta mensagem terminou.',409);
   if(message.edit_state==='pending'||input.editVersion!==message.edit_version)throw fail('A mensagem mudou. Atualize antes de editar novamente.',409);
   if(message.body===input.body)return message;
   if(chat.channel!=='simulator'&&!message.provider_id)throw fail('Não há confirmação do WhatsApp para editar esta mensagem.',409);
   const prefix=message.author_name?`*${message.author_name}*: `:null,signed=prefix&&message.delivery_body?.startsWith(prefix),transportBody=signed?prefix+(input.body||(message.media_type?'Foto':'')):input.body;
   const id=randomUUID(),nextVersion=message.edit_version+1;
   store.transaction(()=>{store.run("UPDATE messages SET edit_version=?,edit_state='pending',edit_error=NULL WHERE id=?",nextVersion,message.id);store.run("INSERT INTO message_edits VALUES(?,?,?,?,?,?,?,?,?,NULL,'pending',NULL)",id,message.id,message.body,input.body,message.delivery_body,transportBody,user.id,user.name,now);});store.changed();
   try{
    if(chat.channel!=='simulator')await whatsapp.editMessage(chat,message.provider_id,transportBody);
    store.transaction(()=>{store.run("UPDATE messages SET body=?,delivery_body=?,edited_at=?,edited_by=?,edited_name=?,edit_state='sent',edit_error=NULL WHERE id=?",input.body,transportBody,agent.now(),user.id,user.name,message.id);store.run("UPDATE message_edits SET status='sent',completed=? WHERE id=?",agent.now(),id);});
   }catch(error){
    const state=error.definite?'failed':'uncertain',detail=error.definite?'O WhatsApp não permitiu editar esta mensagem. O texto anterior foi mantido.':'Não foi possível confirmar a edição. Confira no WhatsApp antes de tentar novamente.';
    store.transaction(()=>{store.run('UPDATE messages SET edit_state=?,edit_error=? WHERE id=?',state,detail,message.id);store.run('UPDATE message_edits SET status=?,error=?,completed=? WHERE id=?',state,detail,agent.now(),id);});store.changed();throw fail(detail,error.definite?409:502);
   }
   store.changed();return store.message(message.id);
  });res.json(result);
 });
}
