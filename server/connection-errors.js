// Browser errors belong in server logs; the shared panel receives only fixed guidance.
export function safeConnectionDetail(error){
 const text=typeof error==='string'?error:error?.message||error?.code||'Falha sem detalhe fornecido pelo navegador.';
 return String(text).replace(/https?:\/\/[^\s<>"']+/gi,value=>{try{return new URL(value).origin;}catch{return'[URL ocultada]';}}).replace(/\b(Bearer|Basic)\s+[^\s]+/gi,'$1 [oculto]').replace(/\b(password|passwd|token|secret|authorization|cookie|qr|qrcode)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[oculto]').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').slice(0,2500);
}
export function connectionError(error){
 const text=String(typeof error==='string'?error:error?.message||error?.code||'');
 const categories=[
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
