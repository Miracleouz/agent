// Browser errors belong in server logs; the shared panel receives only fixed guidance.
export function safeConnectionDetail(error){
 const text=typeof error==='string'?error:error?.message||error?.code||'Falha sem detalhe fornecido pelo navegador.';
 return String(text).replace(/https?:\/\/[^\s<>"']+/gi,value=>{try{return new URL(value).origin;}catch{return'[URL ocultada]';}}).replace(/\b(Bearer|Basic)\s+[^\s]+/gi,'$1 [oculto]').replace(/\b(password|passwd|token|secret|authorization|cookie|qr|qrcode)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[oculto]').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').slice(0,2500);
}
export function connectionError(error){
 const text=String(typeof error==='string'?error:error?.message||error?.code||'');
 const categories=[
  ['live_events',/COTA_LIVE_(?:COLLECTION|BRIDGE)_UNAVAILABLE|COTA_CHAT_LOOKUP_UNAVAILABLE/i,'O WhatsApp não disponibilizou os componentes de mensagens em tempo real. Reconecte pelo painel e confira o log do serviço. A sessão e o histórico foram preservados.'],
  ['connection_timeout',/COTA_CONNECTION_TIMEOUT/i,'A conexão com o WhatsApp não ficou pronta dentro do prazo. Confira a etapa exibida no painel e os logs atuais. Você pode tentar conectar novamente; a sessão e o histórico foram preservados.'],
  ['browser_close_timeout',/COTA_BROWSER_CLOSE_TIMEOUT/i,'A tentativa anterior não encerrou o navegador a tempo. Reinicie o serviço do Cota antes de tentar conectar novamente. A sessão e o histórico foram preservados.'],
  ['logout_failed',/COTA_LOGOUT_FAILED/i,'O navegador foi fechado, mas o WhatsApp não confirmou a desvinculação. Confira Aparelhos conectados no celular. Ao conectar novamente, a sessão salva pode ser restaurada.'],
  ['profile_active',/COTA_PROFILE_ACTIVE/i,'Outro processo do Cota ou Chromium está usando esta sessão. Encerre essa outra instância antes de recuperar. Os bloqueios e a autenticação foram preservados.'],
  ['profile_process_check',/COTA_PROFILE_PROCESS_CHECK/i,'Não foi possível verificar os processos que usam a sessão. Consulte a etapa process_scan no log. A recuperação foi interrompida sem remover os bloqueios.'],
  ['profile_permissions',/COTA_PROFILE_PERMISSIONS/i,'O serviço não tem permissão para recuperar os bloqueios da sessão. Confira o proprietário e as permissões do volume. Estoque, histórico e autenticação foram preservados.'],
  ['profile_lock_format',/COTA_PROFILE_LOCK_FORMAT/i,'Um arquivo de bloqueio tem formato inesperado. A recuperação não removeu arquivos. Consulte o log e o guia de recuperação antes de alterar a sessão.'],
  ['profile_path',/COTA_PROFILE_PATH/i,'A pasta da sessão não foi encontrada ou tem formato inesperado. Confira DATA_DIR e o volume utilizado pelo Cota. Nenhuma autenticação foi apagada.'],
  ['profile_changed',/COTA_PROFILE_CHANGED/i,'O perfil mudou durante a recuperação. Confira outras instâncias usando a sessão antes de tentar novamente. Os bloqueios não foram removidos.'],
  ['profile_confirmation',/COTA_PROFILE_CONFIRMATION/i,'Confirme que todas as outras instâncias que usam a mesma sessão estão paradas antes de recuperar a conexão. Nenhum bloqueio foi removido.'],
  ['profile_recovery_failed',/COTA_PROFILE_RECOVERY_FAILED/i,'Não foi possível recuperar o perfil com segurança. Confira outras instâncias e as permissões do volume. Nenhuma sessão foi apagada. Pare todas as instâncias e consulte o guia de recuperação.'],
  ['auth_modules',/COTA_AUTH_MODULES_UNAVAILABLE|Cannot read properties of (?:null|undefined) \(reading '(?:Socket|Cmd|Conn|OfflineMessageHandler)'\)/i,'O WhatsApp Web não disponibilizou os componentes de autenticação a tempo. Clique em Gerar QR Code para abrir uma nova tentativa; a sessão e o histórico foram preservados.'],
  ['page_reloaded',/COTA_AUTH_DOCUMENT_CHANGED|detached Frame|Execution context was destroyed|Cannot find context with specified id/i,'A página do WhatsApp foi recarregada durante a conexão. Clique em Gerar QR Code para tentar novamente; a sessão e o histórico foram preservados.'],
  ['profile_busy',/SingletonLock.*(?:File exists|already|EEXIST)|ProcessSingleton|profile.*(?:in use|another)|user data directory.*in use|browser is already running/i,'O perfil do Chromium está ocupado ou ficou bloqueado após um reinício. Pare instâncias duplicadas e consulte o log antes de alterar os arquivos da sessão.'],
  ['browser_missing',/Chromium não encontrado|CHROME_PATH|browser was not found|executable.*(?:not found|doesn.t exist)|could not find (?:Chrome|Chromium)|spawn .*ENOENT/i,'Chromium não encontrado. No Docker, reconstrua a imagem; fora dele, instale o navegador e confira CHROME_PATH.'],
  ['permissions',/EACCES|EPERM|permission denied|read-only file system|EROFS/i,'O serviço não tem permissão para usar o navegador ou gravar a sessão. Confira as permissões do volume de dados.'],
  ['disk_full',/ENOSPC|no space left on device/i,'O servidor está sem espaço para gravar a sessão do WhatsApp. Libere espaço no host e tente novamente.'],
  ['memory',/out of memory|oom-kill|Cannot allocate memory|ENOMEM/i,'O navegador não conseguiu obter memória. Confira a memória e os limites do contêiner antes de reconectar.'],
  ['certificate',/ERR_CERT|CERTIFICATE_VERIFY_FAILED|self.signed certificate|unable to verify.*certificate/i,'O navegador não conseguiu validar o certificado HTTPS. Confira o relógio do host e os certificados da rede/proxy.'],
  ['proxy',/ERR_PROXY|ERR_TUNNEL|proxy.*(?:failed|authentication)|407 Proxy/i,'Falha no proxy usado para acessar o WhatsApp. Confira a configuração e a autenticação do proxy no servidor.'],
  ['dns',/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i,'O servidor não conseguiu resolver o endereço do WhatsApp. Confira o DNS do host ou do contêiner.'],
  ['network',/ERR_CONNECTION|ERR_NETWORK|ERR_INTERNET|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH/i,'O servidor não conseguiu acessar o WhatsApp Web. Confira a conexão e as regras de rede do host ou contêiner.'],
  ['timeout',/auth timeout|TimeoutError|timed?\s*out|timeout|ERR_TIMED_OUT/i,'O WhatsApp Web demorou para iniciar. Confira a rede e os recursos do servidor; o tempo de autenticação pode ser ajustado em WHATSAPP_AUTH_TIMEOUT_MS.'],
  ['browser_dependencies',/error while loading shared libraries|cannot open shared object file|missing.*(?:dependencies|libraries)/i,'Faltam bibliotecas para iniciar o Chromium. No Docker, reconstrua a imagem fornecida pelo projeto.'],
  ['browser_start',/Failed to launch|Target closed|browser.*(?:closed|disconnected)|Protocol error/i,'O Chromium não iniciou ou foi encerrado. Confira o log do serviço para identificar o motivo.'],
 ];
 const found=categories.find(([,pattern])=>pattern.test(text));
 return found?{code:found[0],message:found[2]}:{code:'initialization',message:'Falha ao iniciar o WhatsApp Web. Consulte o log do serviço para identificar o erro; a causa ainda não foi determinada.'};
}
export function authenticationTimeout(value){const number=Number(value);return Number.isInteger(number)&&number>=30000&&number<=300000?number:90000;}
