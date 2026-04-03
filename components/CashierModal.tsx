import React, { useMemo, useState, useEffect } from 'react';
import { Sale, PaymentMethod } from '../types';
import { CloseIcon, PrintIcon, CashIcon, PixIcon, CardIcon, ArchiveIcon, SparklesIcon, DownloadIcon } from './Icons';

interface CashierModalProps {
  sales: Sale[];
  onClose: () => void;
  onArchive: () => void;
}

const CashierModal: React.FC<CashierModalProps> = ({ sales, onClose, onArchive }) => {
  const [isFinished, setIsFinished] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const report = useMemo(() => {
    return sales.reduce((acc, sale) => {
      acc.totalRevenue += sale.total;
      acc.totalDiscounts += sale.discountAmount || 0;
      acc.totalItems += sale.items.reduce((sum, item) => sum + item.quantity, 0);

      switch (sale.paymentMethod) {
        case PaymentMethod.CASH:
          acc.cashTotal += sale.total;
          break;
        case PaymentMethod.PIX:
          acc.pixTotal += sale.total;
          break;
        case PaymentMethod.CARD:
          acc.cardTotal += sale.total;
          break;
      }

      return acc;
    }, {
      totalRevenue: 0,
      totalItems: 0,
      totalDiscounts: 0,
      cashTotal: 0,
      pixTotal: 0,
      cardTotal: 0,
    });
  }, [sales]);

  const productSummary = useMemo(() => {
    const summary: Record<string, { title: string, quantity: number, total: number }> = {};
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const key = item.isbn || item.title;
        if (!summary[key]) {
          summary[key] = {
            title: item.title,
            quantity: 0,
            total: 0
          };
        }
        summary[key].quantity += item.quantity;
        summary[key].total += (item.price * item.quantity); // Gross total
      });
    });
    return Object.entries(summary).map(([key, value]) => ({ isbn: key, ...value }));
  }, [sales]);

  // Limpeza do URL do blob ao desmontar para evitar vazamento de memória
  useEffect(() => {
    return () => {
        if (downloadUrl) {
            URL.revokeObjectURL(downloadUrl);
        }
    };
  }, [downloadUrl]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const reportHtml = `
        <html>
          <head>
            <title>Fechamento de Caixa - Evento</title>
            <style>
              body { font-family: sans-serif; margin: 2rem; color: #333; }
              h1, h2 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 1rem; margin-bottom: 2rem; }
              th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .total-row { font-weight: bold; background-color: #f9f9f9; }
              .currency { text-align: right; }
              .center { text-align: center; }
              .print-only { display: block; }
              .client-info { font-size: 0.85em; color: #555; }
              .item-list { list-style: none; padding: 0; margin: 0; font-size: 0.9em; }
              .item-list li { padding-bottom: 2px; }
              @media print {
                 .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>Fechamento de Caixa (Evento)</h1>
            <p><strong>Data de Fechamento:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            
            <h2>1. Resumo Financeiro</h2>
            <table>
              <tr><th>Receita Total (Líquida)</th><td class="currency">R$ ${report.totalRevenue.toFixed(2)}</td></tr>
              <tr><th>Total de Itens Vendidos</th><td>${report.totalItems}</td></tr>
            </table>

            <h3>Totais por Forma de Pagamento</h3>
            <table>
              <tr><th>Método</th><th class="currency">Valor</th></tr>
              <tr><td>Dinheiro</td><td class="currency">R$ ${report.cashTotal.toFixed(2)}</td></tr>
              <tr><td>Pix</td><td class="currency">R$ ${report.pixTotal.toFixed(2)}</td></tr>
              <tr><td>Cartão</td><td class="currency">R$ ${report.cardTotal.toFixed(2)}</td></tr>
            </table>

            <h2>2. Consolidado de Produtos (Para Baixa/Lançamento)</h2>
            <p style="font-size: 0.9em; color: #666;">Utilize esta lista para lançar as vendas agrupadas no sistema oficial.</p>
            <table>
              <thead>
                <tr>
                  <th>ISBN / Código</th>
                  <th>Título do Livro</th>
                  <th class="center">Qtd. Total</th>
                  <th class="currency">Valor Bruto Total</th>
                </tr>
              </thead>
              <tbody>
                ${productSummary.map(item => `
                  <tr>
                    <td>${item.isbn}</td>
                    <td>${item.title}</td>
                    <td class="center"><strong>${item.quantity}</strong></td>
                    <td class="currency">R$ ${item.total.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <h2>3. Detalhamento das Vendas (Transações)</h2>
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Itens Vendidos (ISBN)</th>
                  <th>Pagamento</th>
                  <th>Dados p/ Nota Fiscal</th>
                  <th class="currency">Total</th>
                </tr>
              </thead>
              <tbody>
                ${sales.map(sale => {
                  let clientInfoHtml = '<span style="color: #999;">-</span>';
                  if (sale.customerName || sale.customerCpf) {
                      const parts = [];
                      if (sale.customerName) parts.push(`<b>${sale.customerName}</b>`);
                      if (sale.customerCpf) parts.push(`CPF: ${sale.customerCpf}`);
                      if (sale.customerPhone) parts.push(`Tel: ${sale.customerPhone}`);
                      clientInfoHtml = `<div class="client-info">${parts.join('<br>')}</div>`;
                  }

                  const itemsHtml = `
                    <ul class="item-list">
                      ${sale.items.map(i => `<li>${i.quantity}x [${i.isbn}] ${i.title}</li>`).join('')}
                    </ul>
                  `;

                  return `
                  <tr>
                    <td>${sale.date.toLocaleTimeString('pt-BR')}</td>
                    <td>${itemsHtml}</td>
                    <td>${sale.paymentMethod}</td>
                    <td>${clientInfoHtml}</td>
                    <td class="currency">R$ ${sale.total.toFixed(2)}</td>
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

      printWindow.document.write(reportHtml);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
  };
  
  const generateCSVUrl = (): string | null => {
    try {
      const separator = ';'; // Ponto e vírgula para Excel PT-BR
      const headers = ['ID Venda', 'Data', 'Hora', 'Vendedor', 'Cliente Nome', 'Cliente CPF', 'Cliente Telefone', 'Itens (Qtd x [ISBN] Título)', 'Qtde Itens', 'Forma Pagamento', 'Subtotal (R$)', 'Desconto (%)', 'Desconto (R$)', 'Total (R$)'];
      
      const rows = sales.map(sale => {
        // Formata os itens para ficarem legíveis em uma célula, agora COM ISBN
        const itemsStr = sale.items
            .map(item => `${item.quantity}x [${item.isbn}] ${item.title}`)
            .join(' | ');

        const rowData = [
          sale.id.substring(0, 8),
          sale.date.toLocaleDateString('pt-BR'),
          sale.date.toLocaleTimeString('pt-BR'),
          sale.sellerName || 'N/A',
          sale.customerName || '',
          sale.customerCpf || '',
          sale.customerPhone || '',
          itemsStr,
          sale.items.reduce((sum, item) => sum + item.quantity, 0).toString(),
          sale.paymentMethod,
          (sale.subtotal || sale.total).toFixed(2).replace('.', ','),
          (sale.discountPercentage || 0).toFixed(2).replace('.', ','),
          (sale.discountAmount || 0).toFixed(2).replace('.', ','),
          sale.total.toFixed(2).replace('.', ',')
        ];

        return rowData.map(field => {
            const stringField = String(field);
            if (stringField.includes(separator) || stringField.includes('"') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        }).join(separator);
      });

      const csvContent = '\uFEFF' + [headers.join(separator), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("Erro na geração do CSV", e);
      return null;
    }
  }

  const triggerDownload = (url: string) => {
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.setAttribute("href", url);
      link.setAttribute("download", `relatorio_vendas_evento_${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }

  const handleArchive = async () => {
    if (sales.length === 0) {
      alert("Nenhuma venda para arquivar.");
      return;
    }
    
    setIsGenerating(true);

    // Pequeno delay para garantir que o UI mostre o estado de "carregando" antes de travar na geração do arquivo
    setTimeout(() => {
        const url = generateCSVUrl();
        if (url) {
            setDownloadUrl(url);
            triggerDownload(url);
        } else {
            alert("Erro ao gerar o arquivo, mas você poderá finalizar o caixa.");
        }
        setIsGenerating(false);
        setIsFinished(true); // Muda para a tela de sucesso
    }, 500);
  };

  const handleFinishAndReset = () => {
      onArchive(); // Chama a função do App.tsx que limpa o array sales
  };

  if (isFinished) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-8 flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
                    <SparklesIcon className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Período Finalizado!</h2>
                <p className="text-slate-400 mb-6">
                    As vendas foram arquivadas. Se o download não começou automaticamente, clique no botão abaixo.
                </p>
                
                <div className="bg-slate-700/50 rounded-lg p-4 w-full mb-6">
                    <p className="text-sm text-slate-400">Total do Período</p>
                    <p className="text-3xl font-bold text-emerald-400">R$ {report.totalRevenue.toFixed(2)}</p>
                </div>

                <div className="space-y-3 w-full">
                    {downloadUrl && (
                        <button 
                            onClick={() => triggerDownload(downloadUrl)}
                            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                            <DownloadIcon className="w-4 h-4" /> Baixar Relatório Novamente
                        </button>
                    )}

                    <button 
                        onClick={handleFinishAndReset}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg">
                        Iniciar Novo Período
                    </button>
                </div>
            </div>
        </div>
      )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-2 sm:p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        <header className="p-4 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Fechamento de Caixa (Atual)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="p-4 sm:p-6 flex-grow overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <h3 className="text-slate-400 text-sm font-medium">Receita Total do Período</h3>
              <p className="text-3xl font-bold text-emerald-400">R$ {report.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <h3 className="text-slate-400 text-sm font-medium">Livros Vendidos no Período</h3>
              <p className="text-3xl font-bold text-sky-400">{report.totalItems}</p>
            </div>
          </div>
          
          <div className="space-y-4 mb-8">
              <h3 className="text-lg font-semibold text-slate-300 border-b border-slate-700 pb-2">Totais por Pagamento</h3>
              <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-md">
                  <span className="font-medium text-slate-300">Dinheiro</span>
                  <span className="font-semibold text-white">R$ {report.cashTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-md">
                  <span className="font-medium text-slate-300">Pix</span>
                  <span className="font-semibold text-white">R$ {report.pixTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-md">
                  <span className="font-medium text-slate-300">Cartão</span>
                  <span className="font-semibold text-white">R$ {report.cardTotal.toFixed(2)}</span>
              </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-4">
              Consolidado de Produtos (Para Baixa)
            </h3>
            <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
               <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left text-slate-400">
                      <thead className="text-xs text-slate-300 uppercase bg-slate-700/80">
                          <tr>
                              <th className="px-4 py-2">ISBN / Código</th>
                              <th className="px-4 py-2">Título</th>
                              <th className="px-4 py-2 text-center">Qtd</th>
                              <th className="px-4 py-2 text-right">Total</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                          {productSummary.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/50">
                                  <td className="px-4 py-2 font-mono text-indigo-300">{item.isbn}</td>
                                  <td className="px-4 py-2 text-white truncate max-w-[150px] sm:max-w-[250px]" title={item.title}>{item.title}</td>
                                  <td className="px-4 py-2 text-center font-bold text-white">{item.quantity}</td>
                                  <td className="px-4 py-2 text-right font-mono">R$ {item.total.toFixed(2)}</td>
                              </tr>
                          ))}
                      </tbody>
                   </table>
               </div>
               {productSummary.length === 0 && <p className="text-center p-4">Nenhum produto vendido.</p>}
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-4">
              Histórico Detalhado (Sessão Atual)
            </h3>
            <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
              {sales.length > 0 ? (
                [...sales].reverse().map(sale => {
                  const Icon = {
                    [PaymentMethod.CASH]: CashIcon,
                    [PaymentMethod.PIX]: PixIcon,
                    [PaymentMethod.CARD]: CardIcon
                  }[sale.paymentMethod];

                  const hasClientInfo = sale.customerName || sale.customerCpf || sale.customerPhone;

                  return (
                    <div key={sale.id} className="bg-slate-700/50 p-3 rounded-lg flex items-start justify-between gap-4">
                      <div className="flex-shrink-0 pt-1">
                          <Icon className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="flex-grow min-w-0">
                          <div className="font-semibold text-white">
                            {sale.items.map((i, idx) => (
                                <div key={idx} className="truncate" title={`${i.quantity}x [${i.isbn}] ${i.title}`}>
                                    <span className="text-indigo-300 font-mono text-xs mr-1">[{i.isbn}]</span>
                                    {i.quantity}x {i.title}
                                </div>
                            ))}
                          </div>
                          <div className="mt-1">
                            <p className="text-xs text-slate-400">
                                {sale.date.toLocaleString('pt-BR')}
                            </p>
                            {hasClientInfo && (
                                <div className="mt-1 p-2 bg-slate-800/50 rounded border border-slate-700/50">
                                    {sale.customerName && <p className="text-xs text-indigo-300 font-bold">👤 {sale.customerName}</p>}
                                    {sale.customerCpf && <p className="text-xs text-slate-400 font-mono">CPF: {sale.customerCpf}</p>}
                                    {sale.customerPhone && <p className="text-xs text-slate-400 font-mono">Tel: {sale.customerPhone}</p>}
                                </div>
                            )}
                          </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                          <p className="font-bold font-mono text-lg text-emerald-400">R$ {sale.total.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-slate-500 text-center py-8">Nenhuma venda registrada neste período.</p>
              )}
            </div>
          </div>
        </main>

        <footer className="p-4 border-t border-slate-700 grid grid-cols-2 gap-4 flex-shrink-0">
          <button 
            onClick={handlePrint}
            className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
            <PrintIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Imprimir Relatório</span>
            <span className="sm:hidden">Imprimir</span>
          </button>
          <button 
            onClick={handleArchive}
            disabled={sales.length === 0 || isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed">
            {isGenerating ? (
                <>
                    <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                    <span>Gerando...</span>
                </>
            ) : (
                <>
                    <ArchiveIcon className="w-5 h-5" />
                    <span>Baixar e Zerar</span>
                </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CashierModal;