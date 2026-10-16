import {test,expect} from '@playwright/test';
import {industrialStock} from '../fixtures/industrial-stock.js';
test('owner can quote, paginate, take over, answer, resume and replace inventory',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Vamos começar?'})).toBeVisible();
 await page.getByLabel('Seu nome').fill('Marina Lopes');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Criar meu painel'}).click();
 await expect(page.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/inbox-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByRole('button',{name:'Enviar teste'}).click();
 await expect(page.locator('.message-body').filter({hasText:'Encontrei 5 opções'})).toBeVisible();
 await page.getByRole('button',{name:'Ver mais',exact:true}).click();await expect(page.locator('.message-body').filter({hasText:'Aqui vão mais 3 opções'})).toBeVisible();
 await page.screenshot({path:'test-results/conversation-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Falar com atendente',exact:true}).last().click();await expect(page.locator('.chat-notice')).toContainText('Cliente pediu um atendente');await expect(page.locator('.human-alert')).toBeVisible();
 await page.getByLabel('Mensagem manual').fill('Olá! Sou a Marina, vou te ajudar com as correias.');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(page.locator('.message-body').filter({hasText:'Sou a Marina'})).toBeVisible();
 await page.getByRole('button',{name:'Reativar agente'}).click();await expect(page.getByRole('button',{name:'Responder manual',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Responder manual',exact:true}).click();await page.getByRole('combobox').selectOption('15');await page.getByRole('dialog').getByRole('button',{name:'Responder manual'}).click();await expect(page.locator('.chat-notice')).toContainText('Você está no controle');
 await page.getByRole('button',{name:'Estoque',exact:true}).click();
 const csv='sku;produto;marca;medida;preco;quantidade\nG-A42;Correia em V;Gates;A42;48,90;7\nO-A42;Correia em V;Optibelt;A42;59,90;5';
 await page.getByLabel('Importar estoque').setInputFiles({name:'meu-estoque.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await expect(page.getByRole('heading',{name:'Confirmar novo estoque'})).toBeVisible();await page.getByRole('button',{name:'Substituir estoque',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('cell',{name:'Gates',exact:true})).toBeVisible();await expect(page.getByText('R$ 48,90',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/stock-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await expect(page.getByRole('button',{name:'Gerar QR Code'})).toBeVisible();await expect(page.getByText('Botões nativos exigem', {exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Conversas',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile-conversation.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'Voltar às conversas'}).click();await expect(page.getByRole('heading',{name:'Caixa de entrada',exact:false})).toBeVisible();
 expect(errors).toEqual([]);
});

test('owner sees per-rib inventory and simulator calculates the finished belt price',async({page})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('button',{name:'Estoque',exact:true}).click();
 const brands=['GATES','CONTINENTAL','OPTIBELT','MEGADYNE','BANDO','DAYCO'];
 const csv='sku;produto;marca;preco;quantidade;unidade\n'+brands.map((b,i)=>`RIB-${i};CORREIA MICRO V PJ350 50 FRISOS-0;${b};${(7.93+i).toFixed(2)};50;Friso (FRI)`).join('\n');
 await page.getByLabel('Importar estoque').setInputFiles({name:'frisos.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await expect(page.getByRole('heading',{name:'Confirmar novo estoque'})).toBeVisible();await expect(page.getByRole('dialog').getByRole('cell',{name:'Friso (FRI)',exact:true})).toHaveCount(6);await page.getByRole('button',{name:'Substituir estoque',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('columnheader',{name:'PREÇO BASE / UNIDADE'})).toBeVisible();await expect(page.getByText('por friso/canal',{exact:true})).toHaveCount(6);
 await page.getByRole('button',{name:'Conversas',exact:true}).click();await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption('demo-outro');await page.getByLabel('Mensagem do cliente').fill('quero uma correia pj 350 5 frisos');await page.getByRole('button',{name:'Enviar teste',exact:true}).click();
 const bubble=page.locator('.message-body').filter({hasText:'Encontrei 5 opções'}).last();await expect(bubble).toContainText('R$ 39,65 por correia');await expect(bubble).toContainText('por friso × 5 frisos');await expect(bubble).not.toContainText('50 FRISOS');
 await page.getByRole('button',{name:'Ver mais',exact:true}).last().click();await expect(page.locator('.message-body').filter({hasText:'Aqui vão mais 1 opção'})).toBeVisible();
});

test('open belt uses length times width and synchronous belt asks specifically for width',async({page})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('button',{name:'Configurações',exact:true}).click();await expect(page.getByLabel('Sincronizadoras por milímetro')).toHaveValue('Preço por mm × largura do corte em mm');await page.getByRole('combobox',{name:'Base do preço das correias abertas',exact:true}).selectOption('per_meter_full_width');await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();await expect(page.getByRole('status')).toContainText('Configurações salvas');
 await page.getByRole('button',{name:'Estoque',exact:true}).click();
 const csv='sku;produto;marca;preco;quantidade;unidade\nOPEN;CORREIA SINCR AT10 50MM ABERTA;GATES;114,00;10;Metro (M)\nSYNC;CORREIA SINCR 1304 8M 100MM;BANDO;4,75;100;Milímetro (MM)';
 await page.getByLabel('Importar estoque').setInputFiles({name:'cortes.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await expect(page.getByRole('heading',{name:'Confirmar novo estoque'})).toBeVisible();await page.getByRole('button',{name:'Substituir estoque',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Conversas',exact:true}).click();
 async function send(body){await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption('demo-outro');await page.getByLabel('Mensagem do cliente').fill(body);await page.getByRole('button',{name:'Enviar teste',exact:true}).click();}
 await send('correia AT10 aberta, 2 metros por 25mm');await expect(page.locator('.message-body').last()).toContainText('114,00 por corte');await expect(page.locator('.message-body').last()).toContainText('2 m × 25 mm');
 await send('correia 1304 8M');await expect(page.locator('.message-body').last()).toContainText('Qual é a largura de corte');
 await send('20');await expect(page.locator('.message-body').last()).toContainText('95,00 por correia');await expect(page.locator('.message-body').last()).toContainText('20 mm de largura');
});

test('owner sees purchase intent only after an ambiguous choice is confirmed',async({page})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('button',{name:'Estoque',exact:true}).click();
 const csv='sku;produto;marca;medida;preco;quantidade\nG42;Correia em V;Gates;A42;39,90;12\nO42;Correia em V;Optibelt;A42;55,90;12';
 await page.getByLabel('Importar estoque').setInputFiles({name:'compra.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.getByRole('button',{name:'Substituir estoque',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Conversas',exact:true}).click();
 async function send(body){await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption('demo-outro');await page.getByLabel('Mensagem do cliente').fill(body);await page.getByRole('button',{name:'Enviar teste',exact:true}).click();}
 await send('qro cotacao A42 pfv');await expect(page.locator('.message-body').last()).toContainText('2 opções');
 await send('2');await expect(page.locator('.message-body').last()).toContainText('COTAR');await expect(page.locator('.chat-notice')).toContainText('O agente responde');
 await send('qro fexar o pedidu');await expect(page.locator('.chat-notice')).toContainText('Cliente quer fechar pedido');
 await expect(page.locator('.chat-tag').filter({hasText:'Quer fechar pedido'})).toBeVisible();
 await expect(page.locator('.purchase-summary')).toContainText('Opção 2: Optibelt');await expect(page.locator('.purchase-summary')).toContainText('55,90');
 await expect(page.locator('.message-body').last()).toContainText('ainda não está confirmado');
 await page.screenshot({path:'test-results/purchase-intent.png',fullPage:true});
 await page.getByRole('button',{name:'Reativar agente'}).click();await expect(page.locator('.purchase-summary')).toHaveCount(0);await expect(page.getByRole('button',{name:'Responder manual',exact:true})).toBeVisible();
});
test('owner configures followup delay and quotes AT10 33000 as 33 meters',async({page})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('button',{name:'Configurações',exact:true}).click();await expect(page.getByLabel('Acompanhamento após cotação',{exact:true})).toHaveValue('5');
 await page.getByLabel('Acompanhamento após cotação',{exact:true}).selectOption('10');await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();await expect(page.getByRole('status')).toContainText('Configurações salvas');
 await page.reload();await page.getByRole('button',{name:'Configurações',exact:true}).click();await expect(page.getByLabel('Acompanhamento após cotação',{exact:true})).toHaveValue('10');
 await page.getByLabel('Acompanhamento após cotação',{exact:true}).selectOption('5');await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();await expect(page.getByRole('status')).toContainText('Configurações salvas');
 await page.getByRole('button',{name:'Estoque',exact:true}).click();
 const csv='sku;produto;marca;preco;quantidade;unidade\nAT10;CORREIA AT10 50MM ABERTA;GATES;114,00;100;Metro (M)';
 await page.getByLabel('Importar estoque').setInputFiles({name:'aberta.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.getByRole('button',{name:'Substituir estoque',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Conversas',exact:true}).click();
 async function send(body){await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption('demo-outro');await page.getByLabel('Mensagem do cliente').fill(body);await page.getByRole('button',{name:'Enviar teste',exact:true}).click();}
 await send('AT10 33000');await expect(page.locator('.message-body').last()).toContainText('Qual é a largura');
 await send('25');await expect(page.locator('.message-body').last()).toContainText('33 m × 25 mm');await expect(page.locator('.message-body').last()).toContainText('1.881,00 por corte');
});
test('ROBINHO greets site visitors and quotes all items including finished and cut PK belts',async({page})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('button',{name:'Estoque',exact:true}).click();
 const csv='sku;produto;marca;medida;preco;quantidade;unidade\n'+industrialStock.map(item=>[item.sku,item.name,item.brand,item.variant,item.price,item.quantity,item.unit].join(';')).join('\n');
 await page.getByLabel('Importar estoque').setInputFiles({name:'multiplas-correias.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.getByRole('button',{name:'Substituir estoque',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Conversas',exact:true}).click();
 await page.evaluate(async()=>{await fetch('/api/simulator',{method:'DELETE',headers:{'X-Cota-Request':'1'}});});await page.reload();
 async function send(body){await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByLabel('Mensagem do cliente').fill(body);await page.getByRole('button',{name:'Enviar teste',exact:true}).click();}
 const hello='Olá, sou o agente ROBINHO, vou te ajudar no atendimento nesse momento';
 await send('oi vim pelo site');await expect(page.locator('.message-body').last()).toHaveText(hello);
 await send('cotar corr B 72\ncorreia a 89\ncorreia 3VX 500');const quote=page.locator('.message-body').last();
 await expect(quote).toContainText('Cotação dos 3 itens');for(const reference of ['B 72','A 89','3VX 500'])await expect(quote).toContainText(reference);
 await expect(quote).toContainText('R$');await expect(quote).toContainText('15.');await expect(page.locator('.message-body').filter({hasText:hello})).toHaveCount(1);
 await send('4 PK 650');await expect(page.locator('.message-body').last()).toContainText('peça pronta');await expect(page.locator('.message-body').last()).toContainText('por friso × 4 frisos');
 await page.screenshot({path:'test-results/robinho-pk-quote.png',fullPage:true});
});
test('team member signs replies, shows typing and confirms orders in the shared inbox',async({page,browser,baseURL})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('button',{name:'Equipe',exact:true}).click();await page.getByRole('button',{name:'Novo usuário',exact:true}).click();
 await page.getByLabel('Nome do usuário',{exact:true}).fill('Rafael Costa');await page.getByLabel('E-mail do usuário',{exact:true}).fill('rafael@example.test');await page.getByLabel('Senha do usuário',{exact:true}).fill('rafael-pass-12345');await page.getByRole('button',{name:'Salvar usuário',exact:true}).click();
 await expect(page.getByRole('cell',{name:'Rafael Costa',exact:true})).toBeVisible();await page.getByRole('button',{name:'Conversas',exact:true}).click();
 async function incoming(body){await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByLabel('Mensagem do cliente').fill(body);await page.getByRole('button',{name:'Enviar teste',exact:true}).click();}
 await incoming('pode separar');await expect(page.locator('.chat-notice')).toContainText('Cliente quer fechar pedido');
 const context=await browser.newContext({baseURL,viewport:{width:1440,height:1050}});const colleague=await context.newPage();
 try{
  await colleague.goto('/');await colleague.getByLabel('E-mail',{exact:true}).fill('rafael@example.test');await colleague.getByLabel('Senha',{exact:true}).fill('rafael-pass-12345');await colleague.getByRole('button',{name:'Entrar no painel',exact:true}).click();
  await expect(colleague.getByRole('button',{name:'Equipe',exact:true})).toHaveCount(0);await expect(colleague.getByRole('button',{name:'Estoque',exact:true})).toHaveCount(0);await expect(colleague.getByRole('button',{name:'WhatsApp',exact:true})).toHaveCount(0);
  await colleague.locator('.chat-item').filter({hasText:'Cliente de teste'}).first().click();await expect(colleague.locator('.team-chat-controls')).toContainText('Rafael Costa');
  await colleague.getByLabel('Mensagem manual').fill('Olá! Vou conferir seu pedido.');await expect(page.locator('.typing-notice')).toContainText('Rafael Costa está digitando');
  await colleague.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(page.locator('.message-role').filter({hasText:'Rafael Costa'})).toBeVisible();await expect(page.locator('.message-body').filter({hasText:'Vou conferir seu pedido'})).toBeVisible();
  const result=await colleague.evaluate(async()=>{const data=await(await fetch('/api/bootstrap')).json();const chat=data.chats.find(c=>c.phone==='demo-cliente');return(await(await fetch(`/api/chats/${chat.id}/messages`)).json()).at(-1);});
  expect(result.delivery_body).toBe('*Rafael Costa*: Olá! Vou conferir seu pedido.');expect(result.author_name).toBe('Rafael Costa');
  await colleague.getByRole('button',{name:'Marcar pedido fechado',exact:true}).click();await expect(page.locator('.chat-notice').filter({hasText:'Pedido fechado.'})).toBeVisible();
  await incoming('quero falar com atendente');await expect(page.locator('.chat-notice').filter({hasText:'também pediu para falar'})).toBeVisible();
  await page.screenshot({path:'test-results/shared-team-order.png',fullPage:true});
  await page.getByRole('button',{name:'Equipe',exact:true}).click();await page.getByRole('button',{name:'Desativar Rafael Costa',exact:true}).click();await expect(colleague.getByRole('button',{name:'Entrar no painel',exact:true})).toBeVisible({timeout:10000});
 }finally{await context.close();}
});
test('Admin registers five users in a batch, changes roles and transfers chats between Comerciais',async({page,browser,baseURL})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('button',{name:'Equipe',exact:true}).click();await page.getByRole('button',{name:'Cadastrar em lote',exact:true}).click();
 const lines='Gestora Teste;gestora@example.test;admin\nGestor Teste;gestor@example.test;admin\nComercial Um;comercial1@example.test;comercial\nComercial Dois;comercial2@example.test;comercial\nComercial Tres;comercial3@example.test;comercial';
 await page.getByLabel('Usuários para cadastrar',{exact:true}).fill(lines);await page.getByLabel('Senha inicial da equipe',{exact:true}).fill('team-ui-fixture-12345');await page.getByRole('button',{name:'Cadastrar usuários',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'gestora@example.test'})).toContainText('Admin');await expect(page.getByRole('row').filter({hasText:'comercial1@example.test'})).toContainText('Comercial');
 await page.screenshot({path:'test-results/admin-team-roles.png',fullPage:true});
 await page.getByRole('button',{name:'Conversas',exact:true}).click();await page.locator('.chat-item').filter({hasText:'Cliente de teste'}).first().click();
 async function transfer(target,name){await target.getByRole('button',{name:'Transferir',exact:true}).click();await target.getByLabel('Responsável pelo atendimento').selectOption({label:name+' · Comercial'});await target.getByRole('button',{name:'Confirmar transferência',exact:true}).click();await expect(target.getByRole('dialog')).toHaveCount(0);}
 await transfer(page,'Comercial Um');
 const contexts=[];
 async function login(email){const context=await browser.newContext({baseURL,viewport:{width:1440,height:1050}});contexts.push(context);const target=await context.newPage();await target.goto('/');await target.getByLabel('E-mail',{exact:true}).fill(email);await target.getByLabel('Senha',{exact:true}).fill('team-ui-fixture-12345');await target.getByRole('button',{name:'Entrar no painel',exact:true}).click();await expect(target.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();return target;}
 try{
  const one=await login('comercial1@example.test'),two=await login('comercial2@example.test'),manager=await login('gestora@example.test');
  await one.getByRole('tab',{name:/Conversas · Comercial Um/}).click();await expect(one.locator('.chat-item')).toHaveCount(1);await expect(one.getByRole('button',{name:'Equipe',exact:true})).toHaveCount(0);await expect(two.locator('.chat-item')).toHaveCount(0);
  await manager.getByRole('tab',{name:/Todos os atendimentos/}).click();await manager.locator('.chat-item').first().click();await expect(manager.locator('.team-chat-controls')).toContainText('Comercial Um');await expect(manager.getByRole('button',{name:'Equipe',exact:true})).toBeVisible();await transfer(manager,'Comercial Dois');
  await expect(one.locator('.chat-item')).toHaveCount(0);await two.getByRole('tab',{name:/Conversas · Comercial Dois/}).click();await expect(two.locator('.chat-item')).toHaveCount(1);await two.locator('.chat-item').first().click();await expect(two.locator('.team-chat-controls')).toContainText('Comercial Dois');
  await manager.screenshot({path:'test-results/admin-shared-inbox.png',fullPage:true});
  await page.getByRole('button',{name:'Equipe',exact:true}).click();await page.getByRole('button',{name:'Editar Gestora Teste',exact:true}).click();await page.getByLabel('Cargo',{exact:true}).selectOption('comercial');await page.getByRole('button',{name:'Salvar usuário',exact:true}).click();
  await expect(manager.getByRole('button',{name:'Entrar no painel',exact:true})).toBeVisible({timeout:10000});
  await manager.getByLabel('E-mail',{exact:true}).fill('gestora@example.test');await manager.getByLabel('Senha',{exact:true}).fill('team-ui-fixture-12345');await manager.getByRole('button',{name:'Entrar no painel',exact:true}).click();await expect(manager.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();await expect(manager.getByRole('button',{name:'Equipe',exact:true})).toHaveCount(0);await expect(manager.locator('.chat-item')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 }finally{for(const context of contexts)await context.close();}
});
test('opening claims a queue chat, releasing returns it to others, and groups remain read only',async({page,browser,baseURL})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('marina@example.test');await page.getByLabel('Senha',{exact:true}).fill('owner-pass-test-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();
 await page.getByRole('tab',{name:/Todos os atendimentos/}).click();await page.locator('.chat-item').filter({hasText:'Cliente de teste'}).first().click();await page.getByRole('button',{name:'Liberar conversa',exact:true}).click();
 const contexts=[],errors=[];
 async function login(email){const context=await browser.newContext({baseURL,viewport:{width:1440,height:1050}});contexts.push(context);const target=await context.newPage();target.on('pageerror',error=>errors.push(error.message));await target.goto('/');await target.getByLabel('E-mail',{exact:true}).fill(email);await target.getByLabel('Senha',{exact:true}).fill('team-ui-fixture-12345');await target.getByRole('button',{name:'Entrar no painel',exact:true}).click();await expect(target.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();return target;}
 try{
  const one=await login('comercial3@example.test'),two=await login('comercial1@example.test');
  await expect(one.getByRole('tab',{name:/Não lidas/})).toHaveAttribute('aria-selected','true');await expect(one.locator('.chat-item')).toHaveCount(1);await expect(two.locator('.chat-item')).toHaveCount(1);
  await one.locator('.chat-item').first().click();await expect(one.getByRole('tab',{name:/Conversas · Comercial Tres/})).toHaveAttribute('aria-selected','true');await expect(one.locator('.team-chat-controls')).toContainText('Comercial Tres');await expect(two.locator('.chat-item')).toHaveCount(0);
  await one.getByRole('tab',{name:/Não lidas/}).click();await expect(one.locator('.chat-item')).toHaveCount(0);await one.getByRole('tab',{name:/Conversas · Comercial Tres/}).click();await one.locator('.chat-item').first().click();
  await one.getByLabel('Mensagem manual').fill('Atendimento exclusivo com o meu nome.');await one.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(one.locator('.message-role').filter({hasText:'Comercial Tres'})).toBeVisible();
  await page.getByRole('tab',{name:/Todos os atendimentos/}).click();await page.locator('.chat-item').first().click();await expect(page.locator('.team-chat-controls')).toContainText('Comercial Tres');await expect(one.locator('.team-chat-controls')).toContainText('Comercial Tres');
  await one.screenshot({path:'test-results/personal-inbox.png',fullPage:true});
  await one.getByRole('button',{name:'Liberar conversa',exact:true}).click();await expect(one.locator('.chat-item')).toHaveCount(0);await expect(one.getByLabel('Mensagem manual')).toHaveCount(0);await expect(two.locator('.chat-item')).toHaveCount(1);
  await two.locator('.chat-item').first().click();await expect(two.getByRole('tab',{name:/Conversas · Comercial Um/})).toHaveAttribute('aria-selected','true');await expect(two.locator('.team-chat-controls')).toContainText('Comercial Um');
  await one.getByRole('tab',{name:/Não lidas/}).click();await expect(one.locator('.chat-item')).toHaveCount(0);await one.getByRole('tab',{name:/Grupos/}).click();await expect(one.locator('.chat-item').filter({hasText:'Grupo simulado de teste'})).toBeVisible();await one.locator('.chat-item').first().click();await expect(one.locator('.message-body')).toContainText('Mensagem de grupo para consulta');await expect(one.getByText('Grupo em modo de consulta',{exact:true})).toBeVisible();await expect(one.getByLabel('Mensagem manual')).toHaveCount(0);await expect(one.getByRole('button',{name:'Liberar conversa',exact:true})).toHaveCount(0);
  await one.screenshot({path:'test-results/groups-readonly.png',fullPage:true});
  await two.setViewportSize({width:390,height:844});expect(await two.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();expect(errors).toEqual([]);
 }finally{for(const context of contexts)await context.close();}
});
