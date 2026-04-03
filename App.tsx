import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Book, PaymentMethod, Sale } from './types';
import { BookIcon, CashIcon, CardIcon, PixIcon, TrashIcon, InventoryIcon, CloudIcon, CloudOffIcon, ChartIcon, RefreshIcon, InfoIcon, BarcodeIcon, CloseIcon, DownloadIcon, MoreVerticalIcon, ShareIcon, ExternalLinkIcon, ClipboardIcon, ChevronDownIcon, UsersIcon } from './components/Icons';
import CashierModal from './components/CashierModal';
import InventoryModal from './components/InventoryModal';
import SetupModal from './components/SetupModal';
import DashboardModal from './components/DashboardModal';
import ConfirmationModal from './components/ConfirmationModal';
import LoadingOverlay from './components/LoadingOverlay';
import BarcodeScannerModal from './components/BarcodeScannerModal';
import EventSelectionModal from './components/EventSelectionModal';
import * as sheetService from './services/googleSheetsService';
import { saveToStorage, loadFromStorage, clearEventStorage } from './utils/storage';
import { fetchBookDetailsByISBN } from './services/geminiService';

type NotificationType = 'info' | 'success' | 'error';
interface Notification {
  message: string;
  type: NotificationType;
}
type OperatingMode = 'online' | 'offline' | 'undetermined';
interface ConfirmationState {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// InnerApp component contains all the logic for a specific eventId
// When eventId changes, this component is completely unmounted and remounted by the parent Wrapper
const InnerApp: React.FC<{ currentEventId: string; onSwitchEvent: (id: string) => void }> = ({ currentEventId, onSwitchEvent }) => {
  // Mode & Connection State
  const [operatingMode, setOperatingMode] = useState<OperatingMode>(() => loadFromStorage<OperatingMode>('operatingMode', 'undetermined', currentEventId));
  const [webAppUrl, setWebAppUrl] = useState<string | null>(() => loadFromStorage('webAppUrl', null, currentEventId));
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  // UI State
  const [notification, setNotification] = useState<Notification | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCashierModalOpen, setIsCashierModalOpen] = useState<boolean>(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState<boolean>(false);
  const [isDashboardModalOpen, setIsDashboardModalOpen] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isInstallHelpOpen, setIsInstallHelpOpen] = useState<boolean>(false);
  const [isIframeBreakoutHelpOpen, setIsIframeBreakoutHelpOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState<boolean>(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [isbn, setIsbn] = useState<string>('');
  const [isRunningInIframe, setIsRunningInIframe] = useState(false);


  // App Data State (todos inicializados com currentEventId) with Safety Checks
  const [cart, setCart] = useState<Book[]>(() => {
      const stored = loadFromStorage('cart', [], currentEventId);
      return Array.isArray(stored) ? stored : [];
  });
  
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [sellerName, setSellerName] = useState<string>(() => loadFromStorage('sellerName', '', currentEventId));
  const [customerName, setCustomerName] = useState<string>('');
  const [customerCpf, setCustomerCpf] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [discountPercentage, setDiscountPercentage] = useState<string>('');
  
  const [completedSales, setCompletedSales] = useState<Sale[]>(() => {
      const stored = loadFromStorage('completedSales', [], currentEventId);
      return Array.isArray(stored) ? stored : [];
  });

  const [inventory, setInventory] = useState<Omit<Book, 'quantity'>[]>(() => {
      // Se modo offline, carrega do storage local namespace, senão vazio
      const mode = loadFromStorage<OperatingMode>('operatingMode', 'undetermined', currentEventId);
      if (mode === 'offline') {
          const stored = loadFromStorage('inventory', [], currentEventId);
          return Array.isArray(stored) ? stored : [];
      }
      return [];
  });

  const [salesHistory, setSalesHistory] = useState<Sale[]>(() => {
      const mode = loadFromStorage<OperatingMode>('operatingMode', 'undetermined', currentEventId);
      if (mode === 'offline') {
          const stored = loadFromStorage('salesHistory', [], currentEventId);
          return Array.isArray(stored) ? stored : [];
      }
      return [];
  });
  
  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), []);

  useEffect(() => {
    // Detect if running in an iframe to adjust installation prompt
    if (window.self !== window.top) {
      setIsRunningInIframe(true);
    }
  }, []);

  const showNotification = (message: string, type: NotificationType = 'info', duration: number = 5000) => {
    setNotification({ message, type });
    const timer = setTimeout(() => setNotification(null), duration);
    return () => clearTimeout(timer);
  };
  
  const handleInstallAttempt = () => {
    if (isRunningInIframe) {
      setIsIframeBreakoutHelpOpen(true);
    } else {
      setIsInstallHelpOpen(true);
    }
  };

  const handleSetMode = (mode: 'online' | 'offline') => {
      if (mode === 'offline') {
          const localInventory = loadFromStorage('inventory', [], currentEventId);
          if (Array.isArray(localInventory) && localInventory.length > 0) {
            setInventory(localInventory);
          } else {
              fetch('./data/books.json')
                .then(res => res.json())
                .then(seedData => {
                    const safeData = Array.isArray(seedData) ? seedData : [];
                    setInventory(safeData);
                    saveToStorage('inventory', safeData, currentEventId);
                })
                .catch(() => setInventory([]));
          }
          const history = loadFromStorage('salesHistory', [], currentEventId);
          setSalesHistory(Array.isArray(history) ? history : []);
      }
      setOperatingMode(mode);
      saveToStorage('operatingMode', mode, currentEventId);
  };

  const handleConnect = async (url: string) => {
    setConnectionStatus('connecting');
    setAppError(null);
    try {
      await sheetService.checkSheetConnection(url);
      let inventoryData = await sheetService.getInventory(url);
      
      // Safety check: Ensure inventoryData is an array
      if (!Array.isArray(inventoryData)) {
          console.warn('Dados de estoque inválidos recebidos da planilha. Iniciando vazio.');
          inventoryData = [];
      }

      if (inventoryData.length === 0) {
        console.log("Planilha de estoque vazia. Semeando com dados iniciais de books.json...");
        const response = await fetch('./data/books.json');
        if (response.ok) {
            const seedData: Omit<Book, 'quantity'>[] = await response.json();
            if (Array.isArray(seedData) && seedData.length > 0) {
                await sheetService.addBulkBooksToInventory(url, seedData);
                inventoryData = seedData;
            }
        }
      }

      setInventory(inventoryData);
      setWebAppUrl(url);
      saveToStorage('webAppUrl', url, currentEventId);
      setConnectionStatus('connected');
      handleSetMode('online'); // Switch to online mode upon successful connection
    } catch (error: any) {
      setConnectionStatus('error');
      setAppError(error.message || 'Falha ao conectar com a planilha. Verifique a URL e as permissões.');
    }
  };
  
  useEffect(() => {
    // Only attempt to auto-connect if we have a URL and are in online mode.
    if (operatingMode === 'online' && webAppUrl) {
      handleConnect(webAppUrl);
    }
    // The setup modal handles the case where mode is 'online' but URL is null.
  }, [operatingMode, webAppUrl]);

  useEffect(() => {
    saveToStorage('cart', cart, currentEventId);
  }, [cart, currentEventId]);
  
  useEffect(() => {
    saveToStorage('completedSales', completedSales, currentEventId);
  }, [completedSales, currentEventId]);
   
  useEffect(() => {
    saveToStorage('sellerName', sellerName, currentEventId);
  }, [sellerName, currentEventId]);

  const handleAddToCartByIsbn = async (isbnToAdd: string) => {
    const trimmedIsbn = isbnToAdd.trim();
    if (!trimmedIsbn) return;

    setIsLoading(true);

    const safeCart = Array.isArray(cart) ? cart : [];
    const safeInventory = Array.isArray(inventory) ? inventory : [];

    const existingCartItem = safeCart.find(item => item.isbn === trimmedIsbn);
    if (existingCartItem) {
        setCart(safeCart.map(item => item.isbn === trimmedIsbn ? { ...item, quantity: item.quantity + 1 } : item));
        setIsbn('');
        setIsLoading(false);
        return;
    }

    const inventoryItem = safeInventory.find(item => item.isbn === trimmedIsbn);
    if (inventoryItem) {
        setCart([...safeCart, { ...inventoryItem, quantity: 1 }]);
        setIsbn('');
        setIsLoading(false);
        return;
    }

    const handleConfirmFetch = async () => {
        setConfirmation(null);
        setBlockingMessage('Buscando detalhes do livro online...');
        try {
            const bookDetails = await fetchBookDetailsByISBN(trimmedIsbn);
            const newBook: Omit<Book, 'quantity'> = {
                isbn: trimmedIsbn,
                title: bookDetails.title,
                price: bookDetails.price
            };
            
            setBlockingMessage('Adicionando ao estoque...');
            await handleSaveToInventory(newBook); 
            
            setCart(currentCart => [...(Array.isArray(currentCart) ? currentCart : []), { ...newBook, quantity: 1 }]);
            showNotification(`'${newBook.title}' foi adicionado ao estoque e ao carrinho.`, 'success');
            setIsbn('');
        } catch (error: any) {
            showNotification(error.message || 'Não foi possível encontrar o livro online.', 'error');
        } finally {
            setBlockingMessage(null);
            setIsLoading(false);
        }
    };

    const handleCancelFetch = () => {
        setConfirmation(null);
        showNotification(`Operação cancelada.`, 'info');
        setIsLoading(false);
    };

    setConfirmation({
        message: `O livro com ISBN "${trimmedIsbn}" não está no estoque. Deseja buscar os detalhes online e adicioná-lo?`,
        onConfirm: handleConfirmFetch,
        onCancel: handleCancelFetch
    });
  };


  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAddToCartByIsbn(isbn);
  };

  const handleUpdateQuantity = (isbn: string, quantity: number) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    if (quantity <= 0) {
      setCart(safeCart.filter(item => item.isbn !== isbn));
    } else {
      setCart(safeCart.map(item => item.isbn === isbn ? { ...item, quantity } : item));
    }
  };

  const handleRemoveFromCart = (isbn: string) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    setCart(safeCart.filter(item => item.isbn !== isbn));
  };
  
  const subtotal = useMemo(() => (Array.isArray(cart) ? cart : []).reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  
  const discountAmount = useMemo(() => {
    const discount = parseFloat(discountPercentage);
    if (isNaN(discount) || discount <= 0) return 0;
    return (subtotal * discount) / 100;
  }, [discountPercentage, subtotal]);

  const finalTotal = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

  const change = useMemo(() => {
    if (paymentMethod !== PaymentMethod.CASH) return 0;
    const received = parseFloat(cashReceived) || 0;
    return received >= finalTotal ? received - finalTotal : 0;
  }, [cashReceived, finalTotal, paymentMethod]);

  const insufficientAmount = useMemo(() => {
    if (paymentMethod !== PaymentMethod.CASH || !cashReceived) return 0;
    const received = parseFloat(cashReceived) || 0;
    return received < finalTotal ? finalTotal - received : 0;
  }, [cashReceived, finalTotal, paymentMethod]);

  // Input Masking Helpers
  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '') // Remove non-digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1'); // Limit length
  };

  const formatPhone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerCpf(formatCPF(e.target.value));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerPhone(formatPhone(e.target.value));
  };

  const handleFinalizeSale = async () => {
    if (cart.length === 0 || !paymentMethod) {
      showNotification(cart.length === 0 ? 'O carrinho está vazio.' : 'Selecione uma forma de pagamento.', 'error');
      return;
    }
    
    setIsLoading(true);
    const newSale: Sale = {
      id: new Date().toISOString() + Math.random().toString(36).substring(2, 9),
      items: cart,
      subtotal: subtotal,
      discountPercentage: parseFloat(discountPercentage) || 0,
      discountAmount: discountAmount,
      total: finalTotal,
      paymentMethod,
      sellerName: sellerName.trim() || 'N/A',
      customerName: customerName.trim() || '',
      customerCpf: customerCpf.trim() || '',
      customerPhone: customerPhone.trim() || '',
      date: new Date(),
    };

    try {
        if(operatingMode === 'online' && connectionStatus === 'connected' && webAppUrl) {
            await sheetService.recordSale(webAppUrl, newSale);
        } else if (operatingMode === 'offline') {
            const safeHistory = Array.isArray(salesHistory) ? salesHistory : [];
            const updatedHistory = [...safeHistory, newSale];
            setSalesHistory(updatedHistory);
            saveToStorage('salesHistory', updatedHistory, currentEventId);
        }
        setCompletedSales(prevSales => [...(Array.isArray(prevSales) ? prevSales : []), newSale]);
        setCart([]);
        setPaymentMethod(null);
        setCashReceived('');
        setDiscountPercentage('');
        setCustomerName('');
        setCustomerCpf('');
        setCustomerPhone('');
        setLastSaleId(newSale.id);
        showNotification('Venda finalizada com sucesso!', 'success');
        setTimeout(() => setLastSaleId(null), 5000);
    } catch (error: any) {
        showNotification(`Erro ao registrar venda: ${error.message}`, 'error');
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleArchiveSales = () => {
    setCompletedSales([]);
    setIsCashierModalOpen(false);
    showNotification('Caixa reiniciado e vendas arquivadas com sucesso.', 'success');
  }

  const handleSaveToInventory = async (book: Omit<Book, 'quantity'>) => {
      const safeInventory = Array.isArray(inventory) ? inventory : [];
      let updatedInventory;
      const existingIndex = safeInventory.findIndex(b => b.isbn === book.isbn);
      
      if (operatingMode === 'online') {
          if (!webAppUrl) throw new Error("Não conectado à planilha.");
          if (existingIndex > -1) {
              await sheetService.deleteBookFromInventory(webAppUrl, book.isbn);
          }
          await sheetService.addBookToInventory(webAppUrl, book);
      }

      if (existingIndex > -1) {
          updatedInventory = [...safeInventory];
          updatedInventory[existingIndex] = book;
          showNotification('Livro atualizado com sucesso!', 'success');
      } else {
          updatedInventory = [...safeInventory, book];
          showNotification('Livro adicionado ao estoque!', 'success');
      }
      setInventory(updatedInventory);
      if (operatingMode === 'offline') saveToStorage('inventory', updatedInventory, currentEventId);
  }

  const handleDeleteFromInventory = async (isbn: string) => {
      if (operatingMode === 'online') {
        if (!webAppUrl) throw new Error("Não conectado à planilha.");
        await sheetService.deleteBookFromInventory(webAppUrl, isbn);
      }
      const safeInventory = Array.isArray(inventory) ? inventory : [];
      const updatedInventory = safeInventory.filter(b => b.isbn !== isbn);
      setInventory(updatedInventory);
      if (operatingMode === 'offline') saveToStorage('inventory', updatedInventory, currentEventId);
      showNotification('Livro removido do estoque.', 'success');
  }
  
  const handleBulkUpdateInventory = async (books: Omit<Book, 'quantity'>[]) => {
      const safeInventory = Array.isArray(inventory) ? inventory : [];
      const newBooks = books.filter(newBook => !safeInventory.some(existing => existing.isbn === newBook.isbn));
      if (newBooks.length === 0) {
        showNotification('Nenhum livro novo para adicionar (ISBNs já existentes).', 'info');
        return;
      }

      if (operatingMode === 'online') {
          if (!webAppUrl) throw new Error("Não conectado à planilha.");
          await sheetService.addBulkBooksToInventory(webAppUrl, newBooks);
      }
      
      const updatedInventory = [...safeInventory, ...newBooks];
      setInventory(updatedInventory);
      if (operatingMode === 'offline') saveToStorage('inventory', updatedInventory, currentEventId);
      showNotification(`${newBooks.length} livros adicionados com sucesso.`, 'success');
  }

  const handleSync = async () => {
    if (operatingMode !== 'online' || !webAppUrl) {
        showNotification("Modo offline não suporta sincronização.", "error");
        return;
    }
    setIsSyncing(true);
    try {
        const [invData, salesData] = await Promise.all([
            sheetService.getInventory(webAppUrl),
            sheetService.getSalesHistory(webAppUrl)
        ]);
        setInventory(Array.isArray(invData) ? invData : []);
        setSalesHistory(Array.isArray(salesData) ? salesData : []);
        showNotification("Dados sincronizados com a nuvem!", "success");
    } catch(error: any) {
        showNotification(`Falha na sincronização: ${error.message}`, "error");
    } finally {
        setIsSyncing(false);
    }
  }
  
  const handleFetchSalesHistory = async () => {
    setIsDashboardModalOpen(true);
    if (operatingMode !== 'online' || !webAppUrl) return;

    setIsLoading(true);
    try {
        const salesData = await sheetService.getSalesHistory(webAppUrl);
        setSalesHistory(Array.isArray(salesData) ? salesData : []);
      } catch (error: any) {
        console.error('Erro detalhado no histórico:', error);
        showNotification(`Erro ao buscar histórico: ${error.message}`, 'error');
        setSalesHistory([]);
      } finally {
        setIsLoading(false);
      }
  }

  const handleDisconnect = () => {
    if (window.confirm(`Você tem certeza que deseja desconectar o evento "${currentEventId}"? Isso limpará os dados locais deste evento.`)) {
      // Limpa apenas dados do evento atual
      clearEventStorage(currentEventId);
      window.location.reload();
    }
  };
  
  const handleScanSuccess = async (decodedText: string) => {
    setIsScannerOpen(false);
    await handleAddToCartByIsbn(decodedText);
  };

  const needsSetup = operatingMode === 'undetermined' || (operatingMode === 'online' && !webAppUrl);

  if (needsSetup) {
    return (
        <>
            <SetupModal
              onConnect={handleConnect}
              onSetMode={handleSetMode}
              isConnecting={connectionStatus === 'connecting'}
              connectionError={appError}
              initialMode={operatingMode}
              onInstallAttempt={handleInstallAttempt}
              isRunningInIframe={isRunningInIframe}
              currentEventId={currentEventId}
              onSwitchEvent={() => setIsEventModalOpen(true)}
           />
           {isEventModalOpen && (
              <EventSelectionModal 
                  currentEventId={currentEventId}
                  onClose={() => setIsEventModalOpen(false)}
                  onSelectEvent={onSwitchEvent}
              />
           )}
       </>
    );
  }
  
  const ConnectionStatusIndicator = () => {
    const statusMap = {
        connected: { Icon: CloudIcon, color: 'text-emerald-400', text: 'Conectado' },
        connecting: { Icon: CloudIcon, color: 'text-yellow-400', text: 'Conectando...' },
        error: { Icon: CloudOffIcon, color: 'text-red-400', text: 'Erro de Conexão' },
        disconnected: { Icon: CloudOffIcon, color: 'text-slate-500', text: 'Desconectado' },
    }
    const { Icon, color, text } = statusMap[connectionStatus];
    return (
        <div className={`flex items-center gap-2 text-sm ${color}`}>
            <Icon className="w-5 h-5" />
            <span className="hidden sm:inline">{text}</span>
        </div>
    );
  }

  const NotificationComponent = () => {
    if (!notification) return null;
    const colors = {
      info: 'bg-sky-500',
      success: 'bg-emerald-500',
      error: 'bg-red-500',
    };
    return (
      <div className={`fixed top-5 right-5 ${colors[notification.type]} text-white py-2 px-4 rounded-lg shadow-lg z-50`}>
        {notification.message}
      </div>
    );
  };
  
  const InstallHelpModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <header className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Como Instalar o Aplicativo</h2>
          <button onClick={() => setIsInstallHelpOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>
        <main className="p-6 text-slate-300">
          {isIOS ? (
            <div>
              <h3 className="font-semibold text-lg text-white mb-3">Para iPhone/iPad (iOS)</h3>
              <p className="mb-4">Siga estes passos no navegador Safari para adicionar o PDV à sua tela de início:</p>
              <ol className="space-y-4">
                <li className="flex items-center gap-4">
                  <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center">1</span>
                  <span>Toque no ícone de **Compartilhar** na barra de ferramentas do navegador.</span>
                  <ShareIcon className="w-8 h-8 text-sky-400 flex-shrink-0" />
                </li>
                <li className="flex items-center gap-4">
                  <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center">2</span>
                  <span>Role a lista de opções para baixo e toque em **"Adicionar à Tela de Início"**.</span>
                </li>
                 <li className="flex items-center gap-4">
                  <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center">3</span>
                  <span>Confirme o nome "Livraria PDV" e toque em **"Adicionar"**.</span>
                </li>
              </ol>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold text-lg text-white mb-3">Para Android (Chrome)</h3>
              <p className="mb-4">
                A opção "Instalar aplicativo" pode não aparecer. Use a opção **"Adicionar à tela inicial"** que sempre funciona:
              </p>
              <ol className="space-y-4">
                <li className="flex items-center gap-4">
                   <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center">1</span>
                   <span>Toque no menu de três pontos do navegador para abrir as opções.</span>
                   <MoreVerticalIcon className="w-8 h-8 text-sky-400 flex-shrink-0" />
                </li>
                <li className="flex items-center gap-4">
                   <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center">2</span>
                   <span>Procure e toque na opção **"Adicionar à tela inicial"**.</span>
                </li>
                <li className="flex items-center gap-4">
                  <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center">3</span>
                  <span>Confirme o nome do aplicativo e toque em "Adicionar".</span>
                </li>
              </ol>
            </div>
          )}
        </main>
        <footer className="p-4 bg-slate-900/50 rounded-b-lg text-center">
            <button onClick={() => setIsInstallHelpOpen(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
              Entendido
            </button>
        </footer>
      </div>
    </div>
  );
  
  const IframeBreakoutHelpModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <header className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Instalação (Passo 1 de 2)</h2>
          <button onClick={() => setIsIframeBreakoutHelpOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>
        <main className="p-6 text-slate-300">
           <p className="mb-4">
            Para instalar, primeiro precisamos abrir o app fora desta janela de preview.
          </p>
          <ol className="space-y-4">
            <li className="flex items-start gap-4">
              <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">1</span>
              <span><strong>Copie o endereço desta página</strong>, que está na barra de endereço na parte de cima do seu navegador.</span>
            </li>
            <li className="flex items-start gap-4">
              <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">2</span>
              <span>Abra uma <strong>nova aba</strong>, cole o endereço que você copiou e acesse a página.</span>
            </li>
            <li className="flex items-start gap-4">
              <span className="bg-slate-700 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">3</span>
              <span>Na nova página, clique no botão <strong className="text-indigo-300 inline-flex items-center gap-1"><DownloadIcon className="w-4 h-4 inline-block"/> Instalar App</strong> novamente para ir para o passo final.</span>
            </li>
          </ol>
        </main>
        <footer className="p-4 bg-slate-900/50 rounded-b-lg text-center">
          <button onClick={() => setIsIframeBreakoutHelpOpen(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
            Entendido
          </button>
        </footer>
      </div>
    </div>
  );

  const ConnectionShareModal = ({ url, onClose }: { url: string, onClose: () => void }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = () => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white"><CloseIcon className="w-6 h-6"/></button>
                <h3 className="text-xl font-bold text-white mb-2">Conectar Outro Dispositivo</h3>
                
                <p className="text-slate-400 text-sm mb-6">
                    Escaneie este QR Code <strong>dentro do aplicativo</strong> no outro dispositivo (na tela de configuração) para conectar.
                    <br/><br/>
                    <span className="text-red-400 text-xs">Atenção: Não escaneie com a câmera comum do celular, pois abrirá o navegador e dará erro. Use o botão de scanner do próprio App.</span>
                </p>

                <div className="bg-white p-4 rounded-lg mb-6 flex justify-center">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`} alt="QR Code da Conexão" className="w-48 h-48" />
                </div>

                <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 flex items-center gap-2">
                     <input readOnly value={url} className="bg-transparent text-slate-300 text-xs flex-grow outline-none font-mono truncate" />
                     <button onClick={handleCopy} className="text-indigo-400 hover:text-indigo-300 font-bold text-sm px-2">
                        {copied ? 'Copiado!' : 'Copiar'}
                     </button>
                </div>
            </div>
         </div>
    );
  };
  
  const isFinalizeDisabled = isLoading || cart.length === 0 || !paymentMethod || (paymentMethod === PaymentMethod.CASH && (parseFloat(cashReceived) || 0) < finalTotal);
  
  const selectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setCashReceived('');
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-slate-900 text-slate-200 overflow-hidden">
      {blockingMessage && <LoadingOverlay message={blockingMessage} />}
      {confirmation && <ConfirmationModal {...confirmation} />}
      {isCashierModalOpen && <CashierModal sales={completedSales} onClose={() => setIsCashierModalOpen(false)} onArchive={handleArchiveSales} />}
      {isInventoryModalOpen && <InventoryModal inventory={inventory} onClose={() => setIsInventoryModalOpen(false)} onSave={handleSaveToInventory} onDelete={handleDeleteFromInventory} onBulkUpdate={handleBulkUpdateInventory}/>}
      {isDashboardModalOpen && <DashboardModal salesHistory={salesHistory} inventory={inventory} onClose={() => setIsDashboardModalOpen(false)} />}
      {isScannerOpen && <BarcodeScannerModal onScan={handleScanSuccess} onClose={() => setIsScannerOpen(false)} />}
      {isInstallHelpOpen && <InstallHelpModal />}
      {isIframeBreakoutHelpOpen && <IframeBreakoutHelpModal />}
      {isShareModalOpen && webAppUrl && <ConnectionShareModal url={webAppUrl} onClose={() => setIsShareModalOpen(false)} />}
      {isEventModalOpen && (
          <EventSelectionModal 
              currentEventId={currentEventId}
              onClose={() => setIsEventModalOpen(false)}
              onSelectEvent={onSwitchEvent}
          />
      )}
      <NotificationComponent />
      
      <header className="bg-slate-800/80 backdrop-blur-sm shadow-md p-4 flex justify-between items-center z-40 flex-shrink-0">
        <div className="flex items-center gap-4">
            <BookIcon className="w-8 h-8 text-indigo-400" />
            <div className="flex flex-col min-w-0">
                 <h1 className="text-lg font-bold text-white sm:text-xl truncate">
                    PDV <span className="hidden sm:inline">Livraria (Eventos)</span>
                 </h1>
                 <button onClick={() => setIsEventModalOpen(true)} className="text-[10px] sm:text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors bg-slate-700/50 px-2 py-0.5 rounded-full mt-0.5 w-fit max-w-[120px]" title="Clique para trocar de evento">
                    <UsersIcon className="w-2.5 h-2.5 flex-shrink-0" /> <span className="truncate">Evento: <strong className="text-indigo-300 font-mono">{currentEventId}</strong></span>
                 </button>
            </div>
            
            {operatingMode === 'offline' && <div className="hidden lg:flex items-center gap-2 text-sm text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full"><CloudOffIcon className="w-4 h-4" /> <span>Offline</span></div>}
            {operatingMode === 'online' && <div className="hidden lg:block"><ConnectionStatusIndicator /></div>}
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
            {/* Action Buttons - Prioritized for mobile with labels */}
            <button onClick={() => setIsInventoryModalOpen(true)} className="flex flex-col sm:flex-row items-center justify-center gap-1 p-1.5 sm:p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors min-w-[50px] sm:min-w-0" title="Gerenciar Estoque">
                <InventoryIcon className="w-5 h-5" />
                <span className="text-[9px] sm:text-xs font-semibold uppercase">Estoque</span>
            </button>
            <button onClick={() => setIsCashierModalOpen(true)} className="flex flex-col sm:flex-row items-center justify-center gap-1 p-1.5 sm:p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors min-w-[50px] sm:min-w-0" title="Fechamento de Caixa">
                <CashIcon className="w-5 h-5 text-emerald-400" />
                <span className="text-[9px] sm:text-xs font-semibold uppercase">Caixa</span>
            </button>

            {/* Extra Menu for less frequent mobile actions */}
            <div className="relative group">
                <button className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                    <MoreVerticalIcon className="w-5 h-5" />
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="p-2 space-y-1">
                        <button onClick={handleFetchSalesHistory} className="w-full flex items-center gap-3 p-2 hover:bg-slate-700 rounded-md text-sm transition-colors">
                            <ChartIcon className="w-4 h-4" /> Dashboard
                        </button>
                        {operatingMode === 'online' && (
                            <>
                                <button onClick={() => setIsShareModalOpen(true)} className="w-full flex items-center gap-3 p-2 hover:bg-slate-700 rounded-md text-sm transition-colors">
                                    <ShareIcon className="w-4 h-4" /> Compartilhar
                                </button>
                                <button onClick={handleSync} className="w-full flex items-center gap-3 p-2 hover:bg-slate-700 rounded-md text-sm transition-colors">
                                    <RefreshIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> Sincronizar
                                </button>
                            </>
                        )}
                        <button onClick={handleInstallAttempt} className="w-full flex items-center gap-3 p-2 hover:bg-slate-700 rounded-md text-sm transition-colors">
                            <DownloadIcon className="w-4 h-4" /> Instalar App
                        </button>
                        <button onClick={() => setIsEventModalOpen(true)} className="sm:hidden w-full flex items-center gap-3 p-2 hover:bg-slate-700 rounded-md text-sm transition-colors">
                            <UsersIcon className="w-4 h-4" /> Trocar Evento
                        </button>
                        <hr className="border-slate-700 my-1" />
                        <button onClick={handleDisconnect} className="w-full flex items-center gap-3 p-2 hover:bg-red-900/30 text-red-400 rounded-md text-sm transition-colors">
                            <CloseIcon className="w-4 h-4" /> Desconectar
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </header>
      
      <main className="flex-grow flex flex-col md:flex-row overflow-hidden">
        {/* Left: Cart */}
        <section className="md:w-3/5 lg:w-2/3 flex flex-col p-4 bg-slate-900/50">
          <form onSubmit={handleFormSubmit} className="flex gap-2 mb-4">
            <div className="relative flex-grow">
                <input
                  type="text"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  placeholder="Digitar ou escanear ISBN do livro"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 pl-4 pr-12 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                 <button type="button" onClick={() => setIsScannerOpen(true)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-indigo-400" title="Escanear com a câmera">
                    <BarcodeIcon className="h-6 w-6"/>
                </button>
            </div>
            <button
              type="submit"
              disabled={isLoading || !isbn}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed"
            >
              {isLoading ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div> : 'Adicionar'}
            </button>
          </form>

          <div className="flex-grow overflow-y-auto pr-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 text-center">
                <BookIcon className="w-24 h-24 mb-4" />
                <p className="text-xl font-semibold">Seu carrinho está vazio</p>
                <p>Adicione livros usando o campo acima.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.isbn} className={`p-3 sm:p-4 rounded-lg flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-800 border ${lastSaleId ? 'border-transparent' : 'border-slate-700'}`}>
                    <div className="flex-grow min-w-0">
                      <p className="font-semibold text-white text-sm sm:text-base leading-tight" title={item.title}>{item.title}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-1">{item.isbn}</p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-slate-700/50 pt-2 sm:pt-0">
                        <div className="flex items-center gap-2">
                           <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleUpdateQuantity(item.isbn, parseInt(e.target.value) || 1)}
                                className="w-12 sm:w-16 bg-slate-900 border border-slate-700 rounded-md p-1.5 text-center text-white text-sm"
                            />
                            <span className="text-slate-500 text-xs sm:text-sm">x R$ {item.price.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <p className="min-w-[70px] sm:min-w-[90px] text-right font-bold text-base sm:text-lg text-emerald-400 font-mono">
                              R$ {(item.price * item.quantity).toFixed(2)}
                            </p>
                            <button onClick={() => handleRemoveFromCart(item.isbn)} className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Remover item">
                              <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        
        {/* Right: Payment - FIXED HEADER/FOOTER, SCROLLABLE BODY */}
        <section className="md:w-2/5 lg:w-1/3 flex flex-col h-full overflow-hidden bg-slate-800 shadow-lg border-l border-slate-700">
           
           {/* Fixed Header */}
           <div className="p-4 border-b border-slate-700 flex-shrink-0">
             <h2 className="text-2xl font-bold text-white">Pagamento</h2>
           </div>
           
           {/* Scrollable Middle Content */}
           <div className="flex-grow overflow-y-auto p-6 space-y-6">
               
               {/* Customer Data (Accordion) */}
               <details className="group bg-slate-700/30 rounded-lg border border-slate-700 overflow-hidden">
                   <summary className="flex justify-between items-center p-3 cursor-pointer text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                       <span>Dados do Cliente (Opcional)</span>
                       <ChevronDownIcon className="w-4 h-4 transition-transform duration-300 group-open:rotate-180" />
                   </summary>
                   <div className="p-3 space-y-3 border-t border-slate-700">
                     <div>
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Nome do Cliente"
                          className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                        />
                     </div>
                     <div>
                        <input
                          type="text"
                          value={customerCpf}
                          onChange={handleCpfChange}
                          placeholder="CPF (apenas números)"
                          maxLength={14}
                          className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 text-sm font-mono"
                        />
                     </div>
                     <div>
                        <input
                          type="text"
                          value={customerPhone}
                          onChange={handlePhoneChange}
                          placeholder="WhatsApp / Celular"
                          maxLength={15}
                          className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 text-sm font-mono"
                        />
                     </div>
                   </div>
               </details>
               
               {/* Seller */}
               <div>
                  <label htmlFor="sellerName" className="block text-sm font-medium text-slate-300 mb-1">Vendedor</label>
                  <input
                    type="text"
                    id="sellerName"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                    placeholder="Nome do vendedor"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              
              {/* Payment Methods */}
              <div className="space-y-3">
                  <h3 className="text-sm font-medium text-slate-300">Forma de Pagamento</h3>
                  <button onClick={() => selectPaymentMethod(PaymentMethod.CASH)} className={`w-full flex items-center gap-4 p-3 rounded-lg border-2 transition-all ${paymentMethod === PaymentMethod.CASH ? 'bg-emerald-500/10 border-emerald-500' : 'bg-slate-700/50 border-slate-700 hover:border-slate-600'}`}>
                    <CashIcon className={`w-6 h-6 ${paymentMethod === PaymentMethod.CASH ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className="font-semibold">Dinheiro</span>
                  </button>
                  <button onClick={() => selectPaymentMethod(PaymentMethod.PIX)} className={`w-full flex items-center gap-4 p-3 rounded-lg border-2 transition-all ${paymentMethod === PaymentMethod.PIX ? 'bg-sky-500/10 border-sky-500' : 'bg-slate-700/50 border-slate-700 hover:border-slate-600'}`}>
                    <PixIcon className={`w-6 h-6 ${paymentMethod === PaymentMethod.PIX ? 'text-sky-400' : 'text-slate-400'}`} />
                    <span className="font-semibold">Pix</span>
                  </button>
                  <button onClick={() => selectPaymentMethod(PaymentMethod.CARD)} className={`w-full flex items-center gap-4 p-3 rounded-lg border-2 transition-all ${paymentMethod === PaymentMethod.CARD ? 'bg-indigo-500/10 border-indigo-500' : 'bg-slate-700/50 border-slate-700 hover:border-slate-600'}`}>
                    <CardIcon className={`w-6 h-6 ${paymentMethod === PaymentMethod.CARD ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span className="font-semibold">Cartão</span>
                  </button>
                </div>

                {/* Cash Input */}
                {paymentMethod === PaymentMethod.CASH && (
                  <div>
                    <label htmlFor="cashReceived" className="block text-sm font-medium text-slate-300 mb-1">Valor Recebido (R$)</label>
                    <input
                      type="number"
                      id="cashReceived"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-xl font-mono text-right text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                )}
                
                {/* Discount Input (Moved here to save footer space) */}
                <div>
                   <label htmlFor="discount" className="block text-sm font-medium text-slate-300 mb-1">Desconto (%)</label>
                   <input
                      type="number"
                      id="discount"
                      value={discountPercentage}
                      onChange={(e) => setDiscountPercentage(e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg p-2 text-lg font-mono text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
          </div>

          {/* Fixed Footer */}
          <div className="p-4 bg-slate-800 border-t-2 border-slate-700 space-y-3 flex-shrink-0 z-10">
            <div className="flex justify-between text-lg">
              <span className="text-slate-300">Subtotal</span>
              <span className="font-semibold text-white font-mono">R$ {subtotal.toFixed(2)}</span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-lg text-red-400">
                <span>Desconto Aplicado</span>
                <span className="font-semibold font-mono">- R$ {discountAmount.toFixed(2)}</span>
              </div>
            )}

            {paymentMethod === PaymentMethod.CASH && (
              <>
                 {insufficientAmount > 0 && (
                    <div className="flex justify-between text-lg text-red-400">
                        <span className="font-semibold">Falta</span>
                        <span className="font-bold font-mono">R$ {insufficientAmount.toFixed(2)}</span>
                    </div>
                 )}
                 {change > 0 && (
                    <div className="flex justify-between text-xl text-emerald-400">
                        <span className="font-semibold">Troco</span>
                        <span className="font-bold font-mono">R$ {change.toFixed(2)}</span>
                    </div>
                 )}
              </>
            )}
             <div className="flex justify-between items-center text-3xl font-bold pt-2 border-t border-slate-700">
              <span className="text-slate-200">Total</span>
              <span className="text-emerald-400 font-mono">R$ {finalTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={handleFinalizeSale}
              disabled={isFinalizeDisabled}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-4 rounded-lg text-xl transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed shadow-lg"
            >
              Finalizar Venda
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

// Main wrapper to handle event switching without full page reload
const App: React.FC = () => {
    // Initial state from LocalStorage to avoid URL routing issues in previewers
    const [currentEventId, setCurrentEventId] = useState(() => {
        return localStorage.getItem('lastActiveEventId') || 'default';
    });

    const handleSwitchEvent = (newEventId: string) => {
        // Save to storage so it persists on reload
        localStorage.setItem('lastActiveEventId', newEventId);
        
        // Update state to trigger re-render of InnerApp with new key
        setCurrentEventId(newEventId);
    };

    // Using key={currentEventId} forces InnerApp to completely remount (re-run all useStates)
    // when the event changes, simulating a "clean slate" without a browser reload.
    return (
        <InnerApp 
            key={currentEventId} 
            currentEventId={currentEventId} 
            onSwitchEvent={handleSwitchEvent} 
        />
    );
};

export default App;