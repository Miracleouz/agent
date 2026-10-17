import React from 'react';
import {Check,CheckCheck,Clock,RefreshCw,AlertCircle} from 'lucide-react';
export function ReadSyncStatus({chat,read,busy}){
 if(!chat||chat.channel==='simulator'||!chat.read_sync_state)return null;
 return <div className={'read-sync-status '+chat.read_sync_state}>{chat.read_sync_state==='pending'?<><Clock size={13}/>Confirmando leitura no WhatsApp…</>:chat.read_sync_state==='sent'?<><CheckCheck size={14}/>Leitura sincronizada com o WhatsApp</>:<><AlertCircle size={14}/><span>{chat.read_sync_error||'Leitura ainda não confirmada no WhatsApp.'}</span><button type="button" disabled={busy} onClick={read}><RefreshCw size={13}/>Sincronizar leitura</button></>}</div>;
}
export function DeliveryReceipt({message}){
 if(message.direction==='in'||!['sent','external'].includes(message.status)||message.status==='external'&&!Number.isInteger(message.provider_ack))return null;
 const ack=message.provider_ack;return <span className={'delivery-receipt '+(ack>=3?'read':'')} title={ack>=3?'Lida pelo cliente':ack===2?'Entregue ao cliente':'Enviada ao WhatsApp'}>{ack>=2?<CheckCheck size={15}/>:<Check size={15}/>}</span>;
}
