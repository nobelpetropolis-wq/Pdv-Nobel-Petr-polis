import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../types';
import { CloseIcon, UploadIcon, TrashIcon, DownloadIcon, SparklesIcon, CameraIcon, ClipboardIcon } from './Icons';
import { fetchBookDetailsByISBN, parseInvoiceFromImage } from '../services/geminiService';

interface InventoryModalProps {
  inventory: Omit<Book, 'quantity'>[];
  onClose: () => void;
  onSave: (book: Omit<Book, 'quantity'>) => Promise<void>;
  onDelete: (isbn: string) => Promise<void>;
  onBulkUpdate: (books: Omit<Book, 'quantity'>[]) => Promise<void>;
}

type View = 'list' | 'edit' | 'import-map' | 'bulk-add' | 'import-invoice';
interface BulkResult {
  isbn: string;
  status: 'success' | 'error' | 'loading';
  data?: Omit<Book, 'quantity'>;
  error?: string;
}

const emptyBook: Omit<Book, 'quantity'> = { isbn: '', title: '', price: 0 };

const InventoryModal: React.FC<InventoryModalProps> = ({ inventory, onClose, onSave, onDelete, onBulkUpdate }) => {
  const [view, setView] = useState<View>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredInventory, setFilteredInventory] = useState<Omit<Book, 'quantity'>[]>([]);
  const [bookData, setBookData] = useState<Omit<Book, 'quantity'>>(emptyBook);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // CSV Import State
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState({ isbn: '', title: '', price: '' });
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invoice Import State
  const [invoiceFile, setInvoiceFile] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<Array<Book & { quantity: number }>>([]);
  const [isProcessingInvoice, setIsProcessingInvoice] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);


  // Bulk Add with AI State
  const [isbnsToFetch, setIsbnsToFetch] = useState('');
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  useEffect(() => {
    setModalError(null);
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    
    // Sort safely, handling potential missing titles or non-string values
    const sortedInventory = [...safeInventory].sort((a, b) => {
        const titleA = (a.title || '').toString();
        const titleB = (b.title || '').toString();
        return titleA.localeCompare(titleB);
    });

    if (searchTerm === '') {
      setFilteredInventory(sortedInventory);
    } else {
      const lowerSearch = searchTerm.toLowerCase();
      setFilteredInventory(
        sortedInventory.filter(book =>
          (book.title || '').toString().toLowerCase().includes(lowerSearch) ||
          (book.isbn || '').toString().toLowerCase().includes(lowerSearch)
        )
      );
    }
  }, [searchTerm, inventory]);

  const handleEdit = (book: Omit<Book, 'quantity'>) => {
    setBookData(book);
    setView('edit');
  };

  const handleAddNew = () => {
    setBookData(emptyBook);
    setView('edit');
  };
  
  const handleCancel = () => {
    setView('list');
    setBookData(emptyBook);
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({ isbn: '', title: '', price: '' });
    setImportError(null);
    setIsbnsToFetch('');
    setBulkResults([]);
    setIsBulkLoading(false);
    setModalError(null);
    setInvoiceFile(null);
    setInvoiceItems([]);
    setIsProcessingInvoice(false);
    setIsPdf(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
        await onSave(bookData);
        setView('list');
        setBookData(emptyBook);
    } catch(err: any) {
        const message = err instanceof Error ? err.message : String(err) || 'Ocorreu um erro desconhecido ao salvar o livro.';
        setModalError(message);
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDelete = async (isbn: string) => {
    if (window.confirm('Tem certeza que deseja remover este livro do estoque? Esta ação é irreversível.')) {
        try {
            await onDelete(isbn);
        } catch(err: any) {
            const message = err instanceof Error ? err.message : String(err) || 'Ocorreu um erro desconhecido ao deletar o livro.';
            alert(`Erro ao deletar: ${message}`);
        }
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const triggerCamera = () => {
      cameraInputRef.current?.click();
  }

  const robustlyParseFloat = (value: string): number => {
    if (!value) return 0;
    const cleanedValue = value.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(cleanedValue) || 0;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) {
        setImportError("Arquivo CSV inválido ou vazio. Precisa de um cabeçalho e pelo menos uma linha de dados.");
        return;
      }
      
      const headerLine = lines[0];
      let delimiter = ',';
      if (headerLine.split(';').length > headerLine.split(',').length) {
          delimiter = ';';
      }

      const headers = headerLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map(line => line.split(delimiter).map(field => field.trim().replace(/"/g, '')));
      
      setCsvHeaders(headers);
      setCsvRows(rows);
      setColumnMap({
          isbn: headers.find(h => h.toLowerCase().includes('isbn')) || '',
          title: headers.find(h => h.toLowerCase().includes('título') || h.toLowerCase().includes('title')) || '',
          price: headers.find(h => h.toLowerCase().includes('preço') || h.toLowerCase().includes('price')) || '',
      });
      setView('import-map');
    };
    reader.readAsText(file, 'ISO-8859-1');
    event.target.value = '';
  };

  const handleInvoiceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Check max size (e.g., 5MB)
      if (file.size > 5 * 1024 * 1024) {
          alert("O arquivo é muito grande. Tente usar um arquivo menor.");
          return;
      }

      const isPdfFile = file.type === 'application/pdf';
      setIsPdf(isPdfFile);

      const reader = new FileReader();
      reader.onload = (e) => {
          setInvoiceFile(e.target?.result as string);
          setView('import-invoice');
      }
      reader.readAsDataURL(file);
      event.target.value = '';
  }

  const processInvoice = async () => {
      if (!invoiceFile) return;
      setIsProcessingInvoice(true);
      setModalError(null);
      try {
          const extractedItems = await parseInvoiceFromImage(invoiceFile);
          if (extractedItems.length === 0) {
              setModalError("Nenhum item foi identificado no arquivo.");
          }
          setInvoiceItems(extractedItems);
      } catch (err: any) {
          setModalError(err.message || "Erro ao processar o arquivo.");
      } finally {
          setIsProcessingInvoice(false);
      }
  }

  const handleUpdateInvoiceItem = (index: number, field: keyof Book, value: any) => {
      const newItems = [...invoiceItems];
      newItems[index] = { ...newItems[index], [field]: value };
      setInvoiceItems(newItems);
  }

  const handleDeleteInvoiceItem = (index: number) => {
      const newItems = invoiceItems.filter((_, i) => i !== index);
      setInvoiceItems(newItems);
  }

  const handleConfirmInvoiceImport = async () => {
      // Filter out invalid items
      const validItems = invoiceItems.filter(item => item.title && item.price >= 0);
      if (validItems.length === 0) {
          setModalError("Não há itens válidos para importar.");
          return;
      }

      setIsSubmitting(true);
      try {
          // Prepare books for inventory update (ignoring quantity for now as the main app inventory structure handles 'Omit<Book, quantity>')
          // Note: In a real scenario, you might want to handle stock quantity updates differently (add to existing stock).
          // Current logic only adds/updates product definition (Title, Price) in the catalog.
          const booksToUpdate = validItems.map(({ isbn, title, price }) => ({ isbn, title, price }));
          
          await onBulkUpdate(booksToUpdate);
          handleCancel();
      } catch (err: any) {
           setModalError(err.message || "Erro ao salvar os itens.");
      } finally {
           setIsSubmitting(false);
      }
  }
  
  const handleConfirmImport = async () => {
    if (!columnMap.isbn || !columnMap.title || !columnMap.price) {
        setImportError("Mapeamento incompleto. ISBN, Título e Preço são obrigatórios.");
        return;
    }
    setImportError(null);
    setIsSubmitting(true);
    try {
        const isbnIndex = csvHeaders.indexOf(columnMap.isbn);
        const titleIndex = csvHeaders.indexOf(columnMap.title);
        const priceIndex = csvHeaders.indexOf(columnMap.price);

        const newBooks: Omit<Book, 'quantity'>[] = csvRows.map(row => ({
            isbn: row[isbnIndex] || '',
            title: row[titleIndex] || 'Sem Título',
            price: robustlyParseFloat(row[priceIndex] || '0'),
        })).filter(book => book.isbn && book.title && book.price > 0);

        await onBulkUpdate(newBooks);
        handleCancel();
    } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err) || 'Ocorreu um erro desconhecido durante a importação do CSV.';
        setImportError(message);
    } finally {
        setIsSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const header = "isbn,title,price\n";
    const example = "9788535914849,Brasil País do Futuro,59.90\n";
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(header + example);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "modelo_livros.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleBulkFetch = async () => {
    const isbns = [...new Set(isbnsToFetch.split(/[\s,]+/).filter(isbn => isbn.trim() !== ''))];
    if (isbns.length === 0) return;

    setIsBulkLoading(true);
    setBulkResults(isbns.map(isbn => ({ isbn, status: 'loading' })));

    const promises = isbns.map(async (isbn: string) => {
        const existing = (Array.isArray(inventory) ? inventory : []).find(b => String(b.isbn) === String(isbn));
        if (existing) {
            return { isbn, status: 'error', error: 'Já existe no estoque' } as BulkResult;
        }
        try {
            const bookDetails = await fetchBookDetailsByISBN(isbn);
            return { isbn, status: 'success', data: { isbn, ...bookDetails } } as BulkResult;
        } catch (err: any) {
             const message = err instanceof Error ? err.message : `Ocorreu um erro desconhecido ao buscar o livro (ISBN: ${isbn}).`;
            return { isbn, status: 'error', error: message } as BulkResult;
        }
    });

    const settledResults = await Promise.all(promises);
    setBulkResults(settledResults);
    setIsBulkLoading(false);
  };

  const handleConfirmBulkAdd = async () => {
    const booksToAdd = bulkResults
        .filter(r => r.status === 'success' && r.data)
        .map(r => r.data!);
    
    if (booksToAdd.length > 0) {
        setIsSubmitting(true);
        try {
            await onBulkUpdate(booksToAdd);
            handleCancel();
        } catch(err: any) {
            const message = err instanceof Error ? err.message : String(err) || 'Ocorreu um erro desconhecido ao adicionar os livros em lote.';
            setModalError(message);
        } finally {
            setIsSubmitting(false);
        }
    } else {
        handleCancel();
    }
  };

  const renderList = () => (
    <>
      <div className="p-3 sm:p-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <input type="text" placeholder="Buscar por título ou ISBN..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="flex-grow bg-slate-900 border border-slate-600 rounded-md px-3 sm:px-4 py-2 text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm sm:text-base" />
          <div className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
            <input type="file" ref={cameraInputRef} onChange={handleInvoiceFileChange} accept="image/*,application/pdf" className="hidden" />
            
            <button onClick={downloadTemplate} className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-2 rounded-md transition-colors text-xs flex flex-col sm:flex-row items-center justify-center gap-1" title="Baixar Modelo CSV">
                <DownloadIcon className="w-4 h-4" /> <span className="sm:inline">Modelo</span>
            </button>
            <button onClick={triggerFileUpload} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 px-2 rounded-md transition-colors text-xs flex flex-col sm:flex-row items-center justify-center gap-1" title="Importar CSV">
                <UploadIcon className="w-4 h-4" /> <span className="sm:inline">CSV</span>
            </button>
            <button onClick={triggerCamera} className="bg-sky-700 hover:bg-sky-800 text-white font-semibold py-2 px-2 rounded-md transition-colors text-xs flex flex-col sm:flex-row items-center justify-center gap-1" title="Importar Nota (Foto ou PDF)">
                <CameraIcon className="w-4 h-4" /> <span className="sm:inline">Nota</span>
            </button>
             <button onClick={() => setView('bulk-add')} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold py-2 px-2 rounded-md transition-colors text-xs flex flex-col sm:flex-row items-center justify-center gap-1" title="Adicionar lista de ISBNs com IA">
                <SparklesIcon className="w-4 h-4" /> <span className="sm:inline">IA</span>
            </button>
            <button onClick={handleAddNew} className="col-span-2 sm:col-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3 rounded-md transition-colors text-xs sm:text-sm">
                + Novo Livro
            </button>
          </div>
      </div>
      <div className="flex-grow overflow-auto">
        <table className="w-full text-[11px] sm:text-sm text-left text-slate-400">
            <thead className="text-[10px] sm:text-xs text-slate-300 uppercase bg-slate-700/50 sticky top-0">
                <tr>
                    <th scope="col" className="px-3 sm:px-6 py-2 sm:py-3 whitespace-nowrap">Título</th>
                    <th scope="col" className="px-3 sm:px-6 py-2 sm:py-3">ISBN</th>
                    <th scope="col" className="px-3 sm:px-6 py-2 sm:py-3 text-right">Preço</th>
                    <th scope="col" className="px-3 sm:px-6 py-2 sm:py-3 text-center min-w-[80px]">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
                {filteredInventory.map(book => (
                    <tr key={book.isbn} className="bg-slate-800 hover:bg-slate-700/50">
                        <th scope="row" className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-white max-w-[120px] sm:max-w-none truncate sm:whitespace-normal">{book.title}</th>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono text-[10px] sm:text-sm">{book.isbn}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-mono text-emerald-400">R$ {book.price.toFixed(2)}</td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                            <div className="flex items-center justify-center gap-3 sm:gap-4">
                                <button onClick={() => handleEdit(book)} className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">Editar</button>
                                <button onClick={() => handleDelete(book.isbn)} className="text-red-400 hover:text-red-300 transition-colors p-1"><TrashIcon className="w-4 h-4"/></button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {filteredInventory.length === 0 && <p className="text-center text-slate-500 py-8">Nenhum livro encontrado.</p>}
      </div>
    </>
  );
  
  const renderForm = () => (
    <div className="p-6 bg-slate-700/50 flex-grow flex flex-col">
        <h3 className="text-xl font-semibold text-white mb-4">{bookData.isbn && !emptyBook.isbn ? 'Editar Livro' : 'Adicionar Novo Livro'}</h3>
        <form onSubmit={handleSave} className="space-y-4 flex-grow flex flex-col">
            <div className='flex-grow'>
                <div>
                    <label htmlFor="isbn" className="block text-sm font-medium text-slate-400">ISBN</label>
                    <input type="text" id="isbn" value={bookData.isbn} onChange={e => setBookData({...bookData, isbn: e.target.value})} disabled={!!bookData.isbn && bookData !== emptyBook} required
                        className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white placeholder-slate-500 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-700" />
                </div>
                <div className='mt-4'>
                    <label htmlFor="title" className="block text-sm font-medium text-slate-400">Título</label>
                    <input type="text" id="title" value={bookData.title} onChange={e => setBookData({...bookData, title: e.target.value})} required
                        className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white placeholder-slate-500 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div className='mt-4'>
                    <label htmlFor="price" className="block text-sm font-medium text-slate-400">Preço</label>
                    <input type="number" step="0.01" id="price" value={bookData.price} onChange={e => setBookData({...bookData, price: parseFloat(e.target.value) || 0})} required
                        className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white placeholder-slate-500 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                 {modalError && <p className="text-red-400 text-sm mt-4 bg-red-900/50 p-3 rounded-md">{modalError}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-600 mt-4">
                <button type="button" onClick={handleCancel} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed w-32 text-center">
                    {isSubmitting ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mx-auto"></div> : 'Salvar'}
                </button>
            </div>
        </form>
    </div>
  );
  
  const renderImportMap = () => (
      <div className="p-6 flex-grow flex flex-col">
        <h3 className="text-xl font-semibold text-white mb-2">Mapear Colunas do CSV</h3>
        <p className="text-slate-400 mb-6">Associe as colunas da sua planilha aos campos do sistema para importar corretamente.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 flex-grow">
            {[
                { label: 'ISBN', key: 'isbn', required: true },
                { label: 'Título', key: 'title', required: true },
                { label: 'Preço', key: 'price', required: true },
            ].map(({ label, key, required }) => (
                <div key={key}>
                    <label htmlFor={`map-${key}`} className="block text-sm font-medium text-slate-300">
                        {label} {required && <span className="text-red-400">*</span>}
                    </label>
                    <select
                        id={`map-${key}`}
                        value={columnMap[key as keyof typeof columnMap]}
                        onChange={e => setColumnMap(prev => ({ ...prev, [key]: e.target.value }))}
                        className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="">Selecione uma coluna...</option>
                        {csvHeaders.map(header => <option key={header} value={header}>{header}</option>)}
                    </select>
                </div>
            ))}
        </div>
        
        {importError && <p className="text-red-400 text-sm mt-4">{importError}</p>}

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-700 mt-6">
            <button type="button" onClick={handleCancel} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">Cancelar Importação</button>
            <button type="button" onClick={handleConfirmImport} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-500 w-48 text-center">
                {isSubmitting ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mx-auto"></div> : 'Confirmar e Importar'}
            </button>
        </div>
      </div>
  );
  
  const renderInvoiceImport = () => (
      <div className="p-6 flex-grow flex flex-col h-full overflow-hidden">
        <h3 className="text-xl font-semibold text-white mb-2">Importar de Nota Fiscal (IA)</h3>
        {modalError && <p className="text-red-400 text-sm mb-4 bg-red-900/50 p-3 rounded-md">{modalError}</p>}
        
        {/* Step 1: Preview and Process */}
        {invoiceFile && invoiceItems.length === 0 && (
            <div className="flex flex-col flex-grow items-center justify-center gap-6">
                 <div className="relative max-h-[50vh] w-full max-w-lg overflow-hidden rounded-lg border border-slate-600 flex items-center justify-center bg-slate-900 p-4">
                     {isPdf ? (
                         <div className="text-center py-8">
                             <ClipboardIcon className="w-20 h-20 text-red-400 mx-auto mb-2" />
                             <p className="text-white font-semibold">Arquivo PDF Carregado</p>
                             <p className="text-slate-400 text-sm">Pronto para processamento</p>
                         </div>
                     ) : (
                        <img src={invoiceFile} alt="Preview da Nota" className="max-h-full max-w-full object-contain" />
                     )}
                 </div>
                 <div className="flex gap-4">
                     <button onClick={handleCancel} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">Cancelar</button>
                     <button onClick={processInvoice} disabled={isProcessingInvoice} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center gap-2">
                         {isProcessingInvoice ? (
                             <>
                                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                                Lendo arquivo...
                             </>
                         ) : (
                             <>
                                <SparklesIcon className="w-4 h-4" /> Processar Nota
                             </>
                         )}
                     </button>
                 </div>
            </div>
        )}

        {/* Step 2: Review Items */}
        {invoiceItems.length > 0 && (
            <div className="flex flex-col flex-grow overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                     <p className="text-slate-400 text-sm">A IA encontrou {invoiceItems.length} itens. Verifique os dados abaixo antes de importar.</p>
                </div>
                
                <div className="flex-grow overflow-y-auto border border-slate-700 rounded-md">
                     <table className="w-full text-sm text-left text-slate-400">
                         <thead className="text-xs text-slate-300 uppercase bg-slate-700/50 sticky top-0">
                             <tr>
                                 <th className="px-4 py-2">ISBN/EAN</th>
                                 <th className="px-4 py-2">Título</th>
                                 <th className="px-4 py-2 text-right">Preço</th>
                                 <th className="px-4 py-2 text-center">Qtd</th>
                                 <th className="px-4 py-2 text-center">X</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-700">
                             {invoiceItems.map((item, idx) => (
                                 <tr key={idx} className="hover:bg-slate-800/50">
                                     <td className="px-2 py-2">
                                         <input type="text" value={item.isbn} onChange={(e) => handleUpdateInvoiceItem(idx, 'isbn', e.target.value)}
                                            className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 outline-none text-slate-300 font-mono text-xs" />
                                     </td>
                                     <td className="px-2 py-2">
                                          <input type="text" value={item.title} onChange={(e) => handleUpdateInvoiceItem(idx, 'title', e.target.value)}
                                            className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 outline-none text-white font-medium" />
                                     </td>
                                     <td className="px-2 py-2 text-right">
                                           <input type="number" step="0.01" value={item.price} onChange={(e) => handleUpdateInvoiceItem(idx, 'price', parseFloat(e.target.value))}
                                            className="w-20 bg-transparent border-b border-transparent focus:border-indigo-500 outline-none text-right font-mono" />
                                     </td>
                                     <td className="px-2 py-2 text-center">
                                           <span className="text-white font-bold">{item.quantity}</span>
                                     </td>
                                     <td className="px-2 py-2 text-center">
                                         <button onClick={() => handleDeleteInvoiceItem(idx)} className="text-red-400 hover:text-red-300"><TrashIcon className="w-4 h-4" /></button>
                                     </td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                </div>

                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-700">
                    <button type="button" onClick={() => { setInvoiceItems([]); }} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">Voltar</button>
                    <button type="button" onClick={handleConfirmInvoiceImport} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-500 flex items-center gap-2" >
                         {isSubmitting ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mx-auto"></div> : `Confirmar e Importar`}
                    </button>
                </div>
            </div>
        )}
      </div>
  );

  const renderBulkAdd = () => (
    <div className="p-6 flex-grow flex flex-col">
        <h3 className="text-xl font-semibold text-white mb-2">Adicionar Livros em Lote com IA</h3>
        <p className="text-slate-400 mb-6">Cole uma lista de ISBNs abaixo. Nossa IA buscará os detalhes de cada livro para adicioná-los ao seu estoque.</p>

        {modalError && <p className="text-red-400 text-sm mb-4 bg-red-900/50 p-3 rounded-md">{modalError}</p>}
        {bulkResults.length === 0 ? (
            <div className="flex flex-col flex-grow">
                <textarea
                    value={isbnsToFetch}
                    onChange={(e) => setIsbnsToFetch(e.target.value)}
                    placeholder="Cole os ISBNs aqui, um por linha ou separados por vírgula."
                    className="w-full flex-grow bg-slate-900 border border-slate-600 rounded-md p-4 text-white placeholder-slate-500 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                    disabled={isBulkLoading}
                />
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-700">
                    <button type="button" onClick={handleCancel} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">Cancelar</button>
                    <button type="button" onClick={handleBulkFetch} disabled={isBulkLoading || !isbnsToFetch.trim()} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed flex items-center gap-2">
                        {isBulkLoading ? 'Buscando...' : 'Buscar Livros'}
                        {isBulkLoading && <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>}
                    </button>
                </div>
            </div>
        ) : (
            <div className="flex flex-col flex-grow">
                <h4 className="text-lg font-semibold text-slate-300 mb-4">Resultados da Busca</h4>
                <div className="flex-grow overflow-y-auto border border-slate-700 rounded-md">
                    <ul className="divide-y divide-slate-700">
                        {bulkResults.map(({ isbn, status, data, error }) => (
                            <li key={isbn} className="p-3 flex items-center justify-between gap-4">
                                <div className="flex-grow">
                                    <p className="font-mono text-xs text-slate-500">{isbn}</p>
                                    {status === 'loading' && <p className="text-sky-400">Buscando...</p>}
                                    {status === 'success' && data && <p className="font-semibold text-white">{data.title}</p>}
                                    {status === 'error' && <p className="font-semibold text-red-400">{error}</p>}
                                </div>
                                {status === 'success' && data && (
                                    <div className="text-right">
                                        <p className="font-mono text-emerald-400">R$ {data.price.toFixed(2)}</p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-700">
                    <button type="button" onClick={() => { setBulkResults([]); setIsbnsToFetch(''); }} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">Voltar</button>
                    <button type="button" onClick={handleConfirmBulkAdd} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-500" >
                         {isSubmitting ? <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mx-auto"></div> : `Adicionar ${bulkResults.filter(r => r.status === 'success').length} livros`}
                    </button>
                </div>
            </div>
        )}
    </div>
  );

  const renderContent = () => {
    switch (view) {
        case 'edit': return renderForm();
        case 'import-map': return renderImportMap();
        case 'bulk-add': return renderBulkAdd();
        case 'import-invoice': return renderInvoiceImport();
        case 'list':
        default: return renderList();
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Gerenciar Estoque</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-grow flex flex-col overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default InventoryModal;