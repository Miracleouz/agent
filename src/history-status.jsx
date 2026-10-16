import React from 'react';
import {History,RefreshCw} from 'lucide-react';
export function HistoryStatus({chat,retry,busy}){
 if(!chat||chat.channel==='simulator')return null;
 const loading=chat.history_status==='loading';
 return <div className="history-status"><History size={14}/><span>{loading?'Carregando histórico dos últimos 30 dias…':chat.history_error|| (chat.history_status==='complete'?'Histórico dos últimos 30 dias carregado.':chat.history_status==='available'?'Exibindo o histórico que o WhatsApp disponibilizou nesta sessão.':'Histórico dos últimos 30 dias em atualização automática.')}</span><button type="button" disabled={loading||busy} onClick={retry}><RefreshCw size={13}/>Carregar histórico</button></div>;
}
