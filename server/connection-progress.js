export const connectionStages={
 disconnecting:'Encerrando a conexão com o WhatsApp…',
 profile_recovery:'Recuperando a conexão salva…',
 closing_previous:'Finalizando a tentativa anterior…',
 browser_start:'Abrindo o navegador do WhatsApp…',
 page_load:'Abrindo a página do WhatsApp Web…',
 auth_modules:'Carregando os componentes de conexão…',
 session_sync:'Restaurando e sincronizando a sessão…',
 qr_wait:'QR Code pronto para leitura.',
 ready:'WhatsApp conectado.',
};
export const connectionStageLabel=stage=>typeof stage==='string'&&Object.hasOwn(connectionStages,stage)?connectionStages[stage]:null;
