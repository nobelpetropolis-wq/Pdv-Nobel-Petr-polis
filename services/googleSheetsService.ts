import { Book, Sale } from '../types';

// Este serviço agora se comunica com um Google Apps Script Web App, não com a API do Google Sheets diretamente.

async function post(webAppUrl: string, action: string, payload?: any): Promise<any> {
    try {
        const response = await fetch(webAppUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', 
            },
            body: JSON.stringify({ action, payload }),
            redirect: 'follow',
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`A comunicação com a planilha falhou (Status: ${response.status}). Verifique a URL do Web App e as permissões.`);
        }

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error('Erro ao parsear resposta do GAS:', text);
            throw new Error('A resposta da planilha não é um JSON válido. Verifique se o script foi implantado como App da Web acessível a qualquer pessoa.');
        }

        if (result.status === 'error') {
            throw new Error(result.message || 'Ocorreu um erro na execução do script da planilha.');
        }

        return result.data;
    } catch (error: any) {
        console.error(`Erro no fetch (${action}):`, error);
        if (error.message === 'Failed to fetch') {
            throw new Error('Falha na conexão (Failed to fetch). Verifique sua internet ou se a URL do Script está correta e implantada para "Qualquer Pessoa".');
        }
        throw error;
    }
}

export async function checkSheetConnection(webAppUrl: string): Promise<boolean> {
    await post(webAppUrl, 'checkConnection');
    return true;
}

export async function getInventory(webAppUrl: string): Promise<Omit<Book, 'quantity'>[]> {
    return post(webAppUrl, 'getInventory');
}

export async function addBookToInventory(webAppUrl: string, book: Omit<Book, 'quantity'>): Promise<void> {
    await post(webAppUrl, 'addBookToInventory', { book });
}

export async function addBulkBooksToInventory(webAppUrl: string, books: Omit<Book, 'quantity'>[]): Promise<void> {
    await post(webAppUrl, 'addBulkBooksToInventory', { books });
}

export async function recordSale(webAppUrl: string, sale: Sale): Promise<void> {
    // Dates are not directly JSON-serializable, convert to ISO string
    const serializableSale = { ...sale, date: sale.date.toISOString() };
    await post(webAppUrl, 'recordSale', { sale: serializableSale });
}

export async function deleteBookFromInventory(webAppUrl: string, isbn: string): Promise<void> {
    await post(webAppUrl, 'deleteBookFromInventory', { isbn });
}

export async function getSalesHistory(webAppUrl: string): Promise<Sale[]> {
    const sales = await post(webAppUrl, 'getSalesHistory');
    // As datas vêm como strings da planilha, precisamos convertê-las de volta para objetos Date.
    return sales.map((sale: any) => ({
        ...sale,
        date: new Date(sale.date)
    }));
}