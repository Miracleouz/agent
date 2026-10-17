import {z} from 'zod';
const fail=(message,status)=>Object.assign(new Error(message),{status});
export function draftRoutes({app,store,visibleChat,queued,canControl}){
 const draft=(userId,chatId)=>store.get('SELECT body,revision,updated FROM chat_drafts WHERE user_id=? AND chat_id=?',userId,chatId)||{body:'',revision:0,updated:0};
 app.get('/api/chats/:id/draft',(req,res)=>{const chat=visibleChat(req);res.json(draft(req.user.id,chat.id));});
 app.put('/api/chats/:id/draft',async(req,res)=>{
  const input=z.object({body:z.string().max(4000),revision:z.number().int().min(0),version:z.number().int().min(0)}).strict().parse(req.body);
  const result=await queued(req,(chat,user)=>{
   canControl(req,chat);if(chat.mode!=='manual'||chat.routing_version!==input.version)throw fail('O atendimento mudou. Seu rascunho foi preservado neste navegador.',409);
   const current=draft(user.id,chat.id);if(current.revision!==input.revision)throw fail('O rascunho foi alterado em outro painel. Escolha qual texto manter.',409);
   store.run('INSERT INTO chat_drafts(user_id,chat_id,body,revision,updated) VALUES(?,?,?,?,?) ON CONFLICT(user_id,chat_id) DO UPDATE SET body=excluded.body,revision=excluded.revision,updated=excluded.updated',user.id,chat.id,input.body,current.revision+1,Date.now());store.changed();return draft(user.id,chat.id);
  });res.json(result);
 });
}
