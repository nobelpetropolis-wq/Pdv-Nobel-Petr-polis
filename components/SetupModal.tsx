import React, { useState } from 'react';
import { CloudIcon, CloudOffIcon, BookIcon, ChevronDownIcon, InfoIcon, DownloadIcon, ExternalLinkIcon, BarcodeIcon, UsersIcon } from './Icons';
import BarcodeScannerModal from './BarcodeScannerModal';

type OperatingMode = 'online' | 'offline' | 'undetermined';

interface SetupModalProps {
  onConnect: (webAppUrl: string) => void;
  onSetMode: (mode: 'online' | 'offline') => void;
  isConnecting: boolean;
  connectionError: string | null;
  initialMode: OperatingMode;
  onInstallAttempt: () => void;
  isRunningInIframe: boolean;
  currentEventId: string;
  onSwitchEvent: () => void;
}

const SCRIPT_CODE = `
const ESTOQUE_SHEET_NAME = 'Estoque';
const VENDAS_SHEET_NAME = 'Vendas';
const ITENS_VENDA_SHEET_NAME = 'Itens_Venda';

function doGet(e) {
  return ContentService.createTextOutput("Método GET não suportado. Use POST.").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload;
    let result;

    switch (action) {
      case 'checkConnection':
        result = checkConnection();
        break;
      case 'getInventory':
        result = getInventory();
        break;
      case 'addBookToInventory':
        result = addBookToInventory(payload.book);
        break;
      case 'addBulkBooksToInventory':
        result = addBulkBooksToInventory(payload.books);
        break;
      case 'recordSale':
        result = recordSale(payload.sale);
        break;
      case 'deleteBookFromInventory':
        result = deleteBookFromInventory(payload.isbn);
        break;
      case 'getSalesHistory':
        result = getSalesHistory();
        break;
      default:
        throw new Error('Ação desconhecida: ' + action);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log(error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function checkConnection() {
  SpreadsheetApp.getActiveSpreadsheet();
  return true;
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Aba "' + name + '" não encontrada na planilha.');
  }
  return sheet;
}

function getInventory() {
  const sheet = getSheet(ESTOQUE_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const header = data[0].map(h => h.toString().toLowerCase().trim());
  const isbnIndex = header.indexOf('isbn');
  const titleIndex = header.indexOf('title');
  const priceIndex = header.indexOf('price');

  if (isbnIndex === -1 || titleIndex === -1 || priceIndex === -1) {
    throw new Error("Cabeçalho da aba 'Estoque' inválido. Precisa conter 'isbn', 'title' e 'price'.");
  }

  return data.slice(1).map(row => ({
    isbn: (row[isbnIndex] || '').toString().trim(),
    title: row[titleIndex] || '',
    price: parseFloat(row[priceIndex].toString().replace(',', '.')) || 0,
  })).filter(book => book.isbn && book.title);
}

function addBookToInventory(book) {
  const sheet = getSheet(ESTOQUE_SHEET_NAME);
  sheet.appendRow([book.isbn, book.title, book.price]);
}

function addBulkBooksToInventory(books) {
  const sheet = getSheet(ESTOQUE_SHEET_NAME);
  if (books.length === 0) return;
  const rows = books.map(book => [book.isbn, book.title, book.price]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
}

function recordSale(sale) {
  const vendasSheet = getSheet(VENDAS_SHEET_NAME);
  // Nova estrutura de colunas: id, data, vendedor, metodo_pagamento, subtotal, desconto_%, desconto_valor, total, cliente_nome, cliente_cpf, cliente_telefone
  vendasSheet.appendRow([
    sale.id,
    new Date(sale.date),
    sale.sellerName,
    sale.paymentMethod,
    sale.subtotal,
    sale.discountPercentage,
    sale.discountAmount,
    sale.total,
    sale.customerName || '',
    sale.customerCpf || '',
    sale.customerPhone || ''
  ]);

  const itensSheet = getSheet(ITENS_VENDA_SHEET_NAME);
  if (sale.items.length === 0) return;
  const itemsRows = sale.items.map(item => [sale.id, item.isbn, item.title, item.quantity, item.price]);
  itensSheet.getRange(itensSheet.getLastRow() + 1, 1, itemsRows.length, 5).setValues(itemsRows);
}

function deleteBookFromInventory(isbn) {
  const sheet = getSheet(ESTOQUE_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const header = data[0].map(h => h.toString().toLowerCase().trim());
  const isbnIndex = header.indexOf('isbn');
  
  if (isbnIndex === -1) return;

  const rowIndexToDelete = data.findIndex((row, index) => index > 0 && (row[isbnIndex] || '').toString().trim() == isbn) + 1;

  if (rowIndexToDelete === 0) { 
    Logger.log('ISBN ' + isbn + ' não encontrado para deletar.');
    return;
  }

  sheet.deleteRow(rowIndexToDelete);
}

function getSalesHistory() {
  const vendasSheet = getSheet(VENDAS_SHEET_NAME);
  const itensSheet = getSheet(ITENS_VENDA_SHEET_NAME);

  const vendasData = vendasSheet.getDataRange().getValues().slice(1);
  const itensData = itensSheet.getDataRange().getValues().slice(1);

  const salesMap = {};

  for (const itemRow of itensData) {
    if (!itemRow || !itemRow[0]) continue; 

    let saleId = String(itemRow[0]).trim();
    if (saleId === '') continue;

    let isbn, title, quantity, price;

    if (itemRow.length >= 5) {
      isbn = itemRow[1];
      title = itemRow[2];
      quantity = itemRow[3];
      price = itemRow[4];
    } else if (itemRow.length === 4) {
      isbn = itemRow[1];
      quantity = itemRow[2];
      price = itemRow[3];
      title = 'Título não registrado';
    } else {
      continue;
    }

    if (!salesMap[saleId]) {
      salesMap[saleId] = { items: [] };
    }

    salesMap[saleId].items.push({
      isbn: String(isbn || '').trim(),
      title: title || 'Título não registrado',
      quantity: parseInt(String(quantity || '1').trim()) || 1,
      price: parseFloat(String(price || '0').replace(',', '.')) || 0,
    });
  }

  const historicalSales = [];
  for (const saleRow of vendasData) {
    if (!saleRow || !saleRow[0]) continue;
    
    // Detecção de linha corrompida (ex: ISBN na coluna de pagamento ou título na coluna de subtotal)
    // Se a coluna 4 (metodo_pagamento) parece um ISBN (só números e longo) e a linha tem deslocamento
    const possibleIsbnInCol4 = String(saleRow[3] || '').length >= 10 && !isNaN(parseFloat(String(saleRow[3])));
    if (possibleIsbnInCol4) {
      continue; // Pula linha visivelmente deslocada
    }

    let [
      id,
      date,
      field3, 
      field4, 
      subtotal,
      discountPercentage,
      discountAmount,
      total,
      customerName,
      field10, 
      field11 
    ] = saleRow;

    let saleId = String(id).trim();
    if (saleId === '') continue;
    
    const saleDetails = salesMap[saleId] || { items: [] };
    
    if (saleRow.length > 4) {
        let customerCpf = '';
        let customerPhone = '';
        
        if (saleRow.length >= 11) {
             customerCpf = String(field10 || '');
             customerPhone = String(field11 || '');
        } else if (saleRow.length === 10) {
             customerPhone = String(field10 || '');
        }

      const parsedSubtotal = parseFloat(String(subtotal || '0').replace(',', '.')) || 0;
      const parsedTotal = parseFloat(String(total || '0').replace(',', '.')) || 0;

      // Se ambos subtotal e total não são números, a linha está deslocada
      if (isNaN(parseFloat(String(subtotal))) && isNaN(parseFloat(String(total)))) {
          continue; 
      }

      const saleObject = {
        id: saleId,
        date: date,
        sellerName: field3,
        paymentMethod: field4,
        subtotal: parsedSubtotal,
        discountPercentage: parseFloat(String(discountPercentage || '0').replace(',', '.')) || 0,
        discountAmount: parseFloat(String(discountAmount || '0').replace(',', '.')) || 0,
        total: parsedTotal,
        customerName: customerName || '',
        customerCpf: customerCpf,
        customerPhone: customerPhone,
        items: saleDetails.items,
      };
      historicalSales.push(saleObject);
    } else {
      const saleObject = {
        id: saleId,
        date: date,
        paymentMethod: field3,
        total: parseFloat(String(field4 || '0').replace(',', '.')) || 0,
        sellerName: 'N/A',
        subtotal: parseFloat(String(field4 || '0').replace(',', '.')) || 0, 
        discountPercentage: 0,
        discountAmount: 0,
        customerName: '',
        customerCpf: '',
        customerPhone: '',
        items: saleDetails.items,
      };
      historicalSales.push(saleObject);
    }
  }

  return historicalSales;
}
`.trim();

const SetupModal: React.FC<SetupModalProps> = ({ onConnect, onSetMode, isConnecting, connectionError, initialMode, onInstallAttempt, isRunningInIframe, currentEventId, onSwitchEvent }) => {
  const [webAppUrl, setWebAppUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const getInitialView = () => {
    if (initialMode === 'online') return 'reconnect';
    return 'choice';
  };
  const [view, setView] = useState<'choice' | 'online-setup' | 'reconnect'>(getInitialView());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (webAppUrl.trim()) {
      onConnect(webAppUrl.trim());
    }
  };
  
  const handleScanSuccess = (decodedText: string) => {
    setWebAppUrl(decodedText);
    setIsScannerOpen(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(SCRIPT_CODE);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const renderChoiceView = () => (
    <div className="flex-grow flex flex-col justify-center items-center p-4 sm:p-8 text-center overflow-y-auto">
      <div className="flex items-center gap-3 sm:gap-4 mb-4">
        <BookIcon className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400" />
        <h2 className="text-2xl sm:text-4xl font-bold text-white">Bem-vindo ao Livraria PDV!</h2>
      </div>
      <p className="text-slate-400 mb-8 max-w-lg">
        Escolha como você quer gerenciar seus dados. Você pode sincronizar com a nuvem para acessar de qualquer lugar ou usar o modo local.
      </p>

      {/* Botão de Trocar Evento */}
      <div className="mb-6 sm:mb-10 flex flex-col items-center gap-2 w-full">
           <button onClick={onSwitchEvent} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 sm:px-4 py-2 rounded-full transition-colors border border-slate-600 group max-w-full">
                <UsersIcon className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-slate-200 truncate">Perfil: <strong className="text-indigo-300 font-mono text-sm sm:text-base">{currentEventId}</strong></span>
                <span className="text-[10px] sm:text-xs text-slate-400 ml-1 sm:ml-2 group-hover:text-white transition-colors">Trocar</span>
           </button>
           <p className="text-xs text-slate-500 max-w-md">
               Para conectar outra planilha, clique em "Trocar" acima e crie um novo perfil de evento.
           </p>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
        <button onClick={() => setView('online-setup')} className="group relative flex flex-col text-left p-5 sm:p-8 bg-slate-800/50 rounded-2xl border border-slate-700 hover:border-indigo-500/80 transition-all duration-300 overflow-hidden transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-900/40">
          <div className="absolute -inset-px bg-gradient-to-r from-indigo-700/50 to-purple-700/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg"></div>
          <div className="relative z-10 flex flex-col h-full">
            <CloudIcon className="w-10 h-10 text-indigo-400 mb-4" />
            <h3 className="font-bold text-2xl text-white mb-2 flex items-center gap-3">
              Modo Online
              <span className="text-xs font-semibold bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full">Recomendado</span>
            </h3>
            <p className="text-slate-400 text-sm flex-grow mb-6">
              Sincronize com uma Planilha Google para ter backup automático na nuvem, acesso de múltiplos dispositivos e um histórico de vendas completo.
            </p>
            <span className="font-semibold text-indigo-400 self-start mt-auto">Configurar Sincronização &rarr;</span>
          </div>
        </button>
        <button onClick={() => onSetMode('offline')} className="group relative flex flex-col text-left p-5 sm:p-8 bg-slate-800/50 rounded-2xl border border-slate-700 hover:border-emerald-500/80 transition-all duration-300 overflow-hidden transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-900/40">
           <div className="absolute -inset-px bg-gradient-to-r from-emerald-700/50 to-teal-700/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg"></div>
           <div className="relative z-10 flex flex-col h-full">
            <CloudOffIcon className="w-10 h-10 text-emerald-400 mb-4" />
            <h3 className="font-bold text-2xl text-white mb-2">Modo Offline</h3>
            <p className="text-slate-400 text-sm flex-grow mb-6">
              Comece a usar agora mesmo, sem necessidade de configuração. Todos os seus dados de vendas e estoque ficam salvos de forma segura apenas neste navegador.
            </p>
            <span className="font-semibold text-emerald-400 self-start mt-auto">Começar Agora &rarr;</span>
           </div>
        </button>
      </div>
    </div>
  );
  
  const renderOnlineSetupView = () => (
    <>
      <main className="p-4 sm:p-8 space-y-6 overflow-y-auto">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                <h3 className="text-xl sm:text-2xl font-bold text-white">Conectar com Planilhas Google</h3>
                <span className="bg-slate-700 text-indigo-300 text-[10px] sm:text-xs px-2 py-1 rounded-full border border-indigo-500/30 self-start">Perfil: <strong>{currentEventId}</strong></span>
            </div>
            <p className="text-sm text-slate-400 mt-1">Siga os passos para sincronizar seus dados na nuvem.</p>
          </div>
          
          <div className="space-y-3 text-sm text-slate-400 bg-slate-900/70 p-4 sm:p-6 rounded-lg border border-slate-700">
              <details className="group" open>
                  <summary className="flex justify-between items-center font-semibold cursor-pointer text-slate-200 text-base list-none [&::-webkit-details-marker]:hidden py-2">
                      <span>Já configurou antes? Conecte um novo dispositivo</span>
                      <ChevronDownIcon className="w-5 h-5 transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 pt-3 pl-4 space-y-3 border-l-2 border-slate-700 ml-1">
                      <p>Se você já publicou o script, só precisa da URL existente para conectar este novo dispositivo.</p>
                      <ol className="list-decimal list-inside space-y-2">
                          <li>Acesse <a href="https://script.google.com/home/my" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">seus projetos do Apps Script</a>.</li>
                          <li>Encontre e abra o projeto que você criou para o PDV Livraria.</li>
                          <li>No editor, clique em <code className="font-mono bg-slate-700 p-1 rounded">Implantar {'>'} Gerenciar implantações</code>.</li>
                          <li>Copie a <code className="font-mono bg-slate-700 p-1 rounded">URL do app da Web</code> da sua implantação ativa.</li>
                          <li>Cole a URL no campo abaixo (ou use o scanner se tiver o QR Code).</li>
                      </ol>
                  </div>
              </details>

              <details className="group">
                  <summary className="flex justify-between items-center font-semibold cursor-pointer text-slate-200 text-base list-none [&::-webkit-details-marker]:hidden py-2">
                    <span>É sua primeira vez? Siga os passos de configuração</span>
                    <ChevronDownIcon className="w-5 h-5 transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 pt-3 pl-4 space-y-4 border-l-2 border-slate-700 ml-1">
                    <details className="group/inner pl-2">
                        <summary className="flex justify-between items-center font-semibold cursor-pointer text-slate-300 list-none [&::-webkit-details-marker]:hidden py-1">
                          <span>Passo 1: Preparar a Planilha</span>
                          <ChevronDownIcon className="w-4 h-4 transition-transform duration-300 group-open/inner:rotate-180" />
                        </summary>
                        <ol className="list-decimal list-inside space-y-2 mt-2 pl-4 text-xs">
                          <li>Crie uma nova Planilha Google: <a href="https://sheets.new" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">sheets.new</a>.</li>
                          <li>Crie 3 abas com os nomes exatos: <code className="font-mono bg-slate-700 p-1 rounded">Estoque</code>, <code className="font-mono bg-slate-700 p-1 rounded">Vendas</code>, <code className="font-mono bg-slate-700 p-1 rounded">Itens_Venda</code>.</li>
                          <li>Na aba <strong>Estoque</strong>, coloque estes cabeçalhos na primeira linha: <code className="font-mono bg-slate-700 p-1 rounded">isbn</code>, <code className="font-mono bg-slate-700 p-1 rounded">title</code>, e <code className="font-mono bg-slate-700 p-1 rounded">price</code>.</li>
                          <li><strong>ESSENCIAL:</strong> Na aba <strong>Estoque</strong>, selecione a coluna A, vá em <code className="font-mono bg-slate-700 p-1 rounded">Formatar {'>'} Número {'>'} Texto simples</code> para formatar os ISBNs corretamente.</li>
                           <li>Na aba <strong>Vendas</strong>, adicione: <code className="font-mono bg-slate-700 p-1 rounded">id</code>, <code className="font-mono bg-slate-700 p-1 rounded">data</code>, <code className="font-mono bg-slate-700 p-1 rounded">vendedor</code>, <code className="font-mono bg-slate-700 p-1 rounded">metodo_pagamento</code>, <code className="font-mono bg-slate-700 p-1 rounded">subtotal</code>, <code className="font-mono bg-slate-700 p-1 rounded">desconto_%</code>, <code className="font-mono bg-slate-700 p-1 rounded">desconto_valor</code>, <code className="font-mono bg-slate-700 p-1 rounded">total</code>, <code className="font-mono bg-slate-700 p-1 rounded">cliente_nome</code>, <code className="font-mono bg-slate-700 p-1 rounded">cliente_cpf</code>, <code className="font-mono bg-slate-700 p-1 rounded">cliente_telefone</code>.</li>
                            <li>Na aba <strong>Itens_Venda</strong>, adicione: <code className="font-mono bg-slate-700 p-1 rounded">id_venda</code>, <code className="font-mono bg-slate-700 p-1 rounded">isbn</code>, <code className="font-mono bg-slate-700 p-1 rounded">title</code>, <code className="font-mono bg-slate-700 p-1 rounded">quantidade</code>, <code className="font-mono bg-slate-700 p-1 rounded">preco_unitario</code>.</li>
                        </ol>
                    </details>
                    <details className="group/inner pl-2">
                        <summary className="flex justify-between items-center font-semibold cursor-pointer text-slate-300 list-none [&::-webkit-details-marker]:hidden py-1">
                          <span>Passo 2: Criar o Script</span>
                           <ChevronDownIcon className="w-4 h-4 transition-transform duration-300 group-open/inner:rotate-180" />
                        </summary>
                         <div className="mt-2 pl-4 space-y-3 text-xs">
                            <ol className="list-decimal list-inside space-y-2">
                                <li>No menu da planilha, vá em <code className="font-mono bg-slate-700 p-1 rounded">Extensões {'>'} Apps Script</code>.</li>
                                <li>Apague todo o código de exemplo no editor.</li>
                                <li>Cole o código abaixo no editor vazio:</li>
                            </ol>
                            <div className="relative ml-4">
                                <pre className="bg-slate-800 p-3 rounded-md text-xs overflow-x-auto max-h-40"><code>{SCRIPT_CODE}</code></pre>
                                <button onClick={handleCopy} className="absolute top-2 right-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors">
                                    {isCopied ? 'Copiado!' : 'Copiar'}
                                </button>
                            </div>
                            <p className="pl-4">Clique no ícone de <strong>Salvar projeto</strong> (disquete) para salvar.</p>
                        </div>
                    </details>
                    <details className="group/inner pl-2">
                        <summary className="flex justify-between items-center font-semibold cursor-pointer text-slate-300 list-none [&::-webkit-details-marker]:hidden py-1">
                          <span>Passo 3: Publicar e Obter URL</span>
                           <ChevronDownIcon className="w-4 h-4 transition-transform duration-300 group-open/inner:rotate-180" />
                        </summary>
                        <ol className="list-decimal list-inside space-y-1 mt-2 pl-4 text-xs">
                            <li>No editor de script, clique em <code className="font-mono bg-slate-700 p-1 rounded">Implantar {'>'} Nova implantação</code>.</li>
                            <li>Clique no ícone de engrenagem e escolha <code className="font-mono bg-slate-700 p-1 rounded">App da Web</code>.</li>
                            <li>Em "Quem pode acessar", selecione <code className="font-mono bg-slate-700 p-1 rounded">Qualquer pessoa</code>.</li>
                            <li>Clique em <code className="font-mono bg-slate-700 p-1 rounded">Implantar</code> e autorize o acesso.</li>
                            <li>Copie a <code className="font-mono bg-slate-700 p-1 rounded">URL do app da Web</code> e cole no campo abaixo.</li>
                        </ol>
                    </details>
                  </div>
              </details>
          </div>
          
          <form onSubmit={handleSubmit} className="pt-4">
              <label htmlFor="web-app-url" className="block text-sm font-medium text-slate-300 mb-2">
                URL do App da Web (Para o evento: <span className="text-indigo-400">{currentEventId}</span>)
              </label>
              <div className="relative">
                <input
                  id="web-app-url"
                  type="url"
                  value={webAppUrl}
                  onChange={(e) => setWebAppUrl(e.target.value)}
                  placeholder="Cole a URL do seu script implantado aqui"
                  className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 pl-4 pr-12 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  required
                />
                 <button type="button" onClick={() => setIsScannerOpen(true)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-indigo-400" title="Escanear QR Code de conexão">
                    <BarcodeIcon className="h-6 w-6"/>
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                 <InfoIcon className="w-3 h-3" />
                 Esta conexão será salva automaticamente no seu dispositivo.
              </p>

              {connectionError && <p className="text-red-400 text-sm mt-2 bg-red-900/20 p-2 rounded">{connectionError}</p>}
          </form>
      </main>
      <footer className="p-4 border-t border-slate-700 flex justify-between items-center flex-shrink-0">
        <button onClick={() => setView('choice')} className="text-slate-400 hover:text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm">
            &larr; Voltar
        </button>
        <button
          onClick={handleSubmit}
          disabled={isConnecting || !webAppUrl.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-md transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isConnecting ? 'Conectando...' : 'Conectar e Carregar Dados'}
          {isConnecting && <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>}
        </button>
      </footer>
    </>
  );

  const renderReconnectView = () => (
    <>
        <main className="p-8 space-y-6 flex-grow flex flex-col justify-center">
            <div className="text-center">
                <InfoIcon className="w-12 h-12 text-sky-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white">Conectar Novamente</h3>
                <p className="text-slate-400 mt-2 max-w-md mx-auto">
                    Parece que você precisa inserir a URL da sua planilha novamente. Isso pode acontecer se você estiver usando a navegação anônima ou se os dados do navegador foram limpos.
                </p>
                <div className="mt-4 inline-block px-4 py-1 rounded-full bg-slate-700/50 border border-slate-600 text-sm text-slate-300">
                    Evento Atual: <strong className="text-indigo-300">{currentEventId}</strong>
                </div>
            </div>
            
            <div className="bg-indigo-900/50 border border-indigo-700 p-6 rounded-lg text-center mt-4">
                <h4 className="font-semibold text-lg text-white">✨ Para não ter que repetir isso:</h4>
                <p className="text-indigo-200 mt-2 mb-4 text-sm">Instale o aplicativo na sua tela inicial! Ele salvará sua conexão permanentemente e funcionará como um app de verdade.</p>
                <button
                    onClick={onInstallAttempt}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 w-full max-w-xs mx-auto">
                    <DownloadIcon className="w-5 h-5" />
                    Instalar Aplicativo
                </button>
            </div>
            
            <form onSubmit={handleSubmit} className="pt-4">
                <label htmlFor="web-app-url-reconnect" className="block text-sm font-medium text-slate-300 mb-2">
                    URL do App da Web
                </label>
                 <div className="relative">
                    <input
                        id="web-app-url-reconnect"
                        type="url"
                        value={webAppUrl}
                        onChange={(e) => setWebAppUrl(e.target.value)}
                        placeholder="Cole a URL da sua planilha aqui"
                        className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 pl-4 pr-12 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        required
                    />
                     <button type="button" onClick={() => setIsScannerOpen(true)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-indigo-400" title="Escanear QR Code de conexão">
                        <BarcodeIcon className="h-6 w-6"/>
                    </button>
                 </div>
                {connectionError && <p className="text-red-400 text-sm mt-2 bg-red-900/20 p-2 rounded">{connectionError}</p>}
            </form>
        </main>
        <footer className="p-4 border-t border-slate-700 flex justify-between items-center flex-shrink-0">
            <div className="flex gap-3">
                 <button onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('mode');
                    window.history.pushState({}, '', url.toString());
                    setView('choice');
                }} className="text-slate-400 hover:text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm border border-transparent hover:border-slate-600">
                    &larr; Voltar
                </button>
                <button onClick={onSwitchEvent} className="text-indigo-400 hover:text-indigo-300 font-semibold py-2 px-4 rounded-md transition-colors text-sm flex items-center gap-2">
                    <UsersIcon className="w-4 h-4" /> Trocar Evento
                </button>
            </div>
           
            <button
                onClick={handleSubmit}
                disabled={isConnecting || !webAppUrl.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-md transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isConnecting ? 'Conectando...' : 'Conectar'}
                {isConnecting && <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>}
            </button>
        </footer>
    </>
);


  const renderContent = () => {
    switch(view) {
        case 'choice':
            return renderChoiceView();
        case 'online-setup':
            return renderOnlineSetupView();
        case 'reconnect':
            return renderReconnectView();
        default:
            return renderChoiceView();
    }
  }


  return (
    <div className="fixed inset-0 bg-slate-900 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <header className="p-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Configuração do PDV</h2>
        </header>
        {renderContent()}
      </div>
      {isScannerOpen && <BarcodeScannerModal onScan={handleScanSuccess} onClose={() => setIsScannerOpen(false)} title="Escaneie o QR Code de Conexão" />}
    </div>
  );
};

export default SetupModal;