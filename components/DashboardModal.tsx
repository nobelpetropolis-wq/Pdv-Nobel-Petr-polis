import React, { useMemo } from 'react';
import { Sale, PaymentMethod, Book } from '../types';
import { CloseIcon, BookIcon, CashIcon, PixIcon, CardIcon } from './Icons';

interface DashboardModalProps {
  salesHistory: Sale[];
  inventory: Omit<Book, 'quantity'>[];
  onClose: () => void;
}

const DashboardModal: React.FC<DashboardModalProps> = ({ salesHistory, inventory, onClose }) => {

  const stats = useMemo(() => {
    if (!salesHistory || salesHistory.length === 0) {
      return {
        totalRevenue: 0,
        totalSales: 0,
        averageTicket: 0,
        totalBooksSold: 0,
        paymentMethodCounts: { [PaymentMethod.CASH]: 0, [PaymentMethod.PIX]: 0, [PaymentMethod.CARD]: 0 },
        topSellers: [],
      };
    }

    const totalRevenue = salesHistory.reduce((acc, sale) => acc + sale.total, 0);
    const totalSales = salesHistory.length;
    const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    const paymentMethodCounts = salesHistory.reduce((acc, sale) => {
      acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
      return acc;
    }, {} as Record<PaymentMethod, number>);
    
    const bookSales = new Map<string, { title: string, quantity: number, revenue: number }>();
    let totalBooksSold = 0;

    salesHistory.forEach(sale => {
      const discountMultiplier = 1 - ((sale.discountPercentage || 0) / 100);
      sale.items.forEach(item => {
        totalBooksSold += item.quantity;
        const title = item.title || `Desconhecido (ISBN: ${item.isbn})`;
        
        const itemRevenue = (item.price * item.quantity) * discountMultiplier;

        const existing = bookSales.get(item.isbn);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += itemRevenue;
        } else {
          bookSales.set(item.isbn, {
            title,
            quantity: item.quantity,
            revenue: itemRevenue,
          });
        }
      });
    });

    const topSellers = [...bookSales.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

    return {
      totalRevenue,
      totalSales,
      averageTicket,
      totalBooksSold,
      paymentMethodCounts,
      topSellers
    };

  }, [salesHistory, inventory]);
  
  const StatCard: React.FC<{ title: string; value: string; subtext?: string }> = ({ title, value, subtext }) => (
    <div className="bg-slate-700/50 p-4 rounded-lg">
      <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
      <p className="text-3xl font-bold text-white">{value}</p>
      {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Dashboard de Vendas</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="p-6 flex-grow overflow-y-auto space-y-8">
          {salesHistory.length === 0 ? (
            <div className="text-center py-24 text-slate-500">
                <BookIcon className="mx-auto h-16 w-16 mb-4"/>
                <p>Nenhuma venda registrada no histórico.</p>
                <p className="text-sm">Realize uma venda para ver os dados aqui.</p>
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Receita Total" value={`R$ ${stats.totalRevenue.toFixed(2)}`} />
                <StatCard title="Total de Vendas" value={`${stats.totalSales}`} />
                <StatCard title="Ticket Médio" value={`R$ ${stats.averageTicket.toFixed(2)}`} />
                <StatCard title="Livros Vendidos" value={`${stats.totalBooksSold}`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Top Sellers */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-300 mb-4">Livros Mais Vendidos</h3>
                  <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                    {stats.topSellers.length > 0 ? stats.topSellers.map(book => (
                        <div key={book.title} className="flex justify-between items-center text-sm">
                            <span className="text-slate-200 truncate pr-4" title={book.title}>{book.title}</span>
                            <div className="flex items-center gap-4">
                                <span className="font-mono text-slate-400 text-xs">R$ {book.revenue.toFixed(2)}</span>
                                <span className="font-bold text-white bg-indigo-500/50 rounded-full px-2 py-0.5 text-xs w-10 text-center">{book.quantity}</span>
                            </div>
                        </div>
                    )) : <p className="text-slate-500 text-sm text-center py-4">Nenhum livro vendido ainda.</p>}
                  </div>
                </div>

                {/* Sales by Payment Method */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-300 mb-4">Receita por Pagamento</h3>
                   <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
                       {[PaymentMethod.CASH, PaymentMethod.PIX, PaymentMethod.CARD].map(method => {
                           const Icon = { [PaymentMethod.CASH]: CashIcon, [PaymentMethod.PIX]: PixIcon, [PaymentMethod.CARD]: CardIcon }[method];
                           const value = stats.paymentMethodCounts[method] || 0;
                           const percentage = stats.totalRevenue > 0 ? (value / stats.totalRevenue) * 100 : 0;
                           return (
                               <div key={method}>
                                   <div className="flex justify-between items-center mb-1 text-sm">
                                       <div className="flex items-center gap-2">
                                           <Icon className="w-4 h-4 text-slate-400" />
                                           <span className="text-slate-300">{method}</span>
                                       </div>
                                       <span className="font-semibold text-white">R$ {value.toFixed(2)}</span>
                                   </div>
                                   <div className="w-full bg-slate-600 rounded-full h-2.5">
                                       <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                   </div>
                               </div>
                           )
                       })}
                   </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default DashboardModal;
