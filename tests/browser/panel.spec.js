import {test,expect} from '@playwright/test';
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
