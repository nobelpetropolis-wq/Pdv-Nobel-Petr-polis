import { GoogleGenAI, Type } from "@google/genai";
import { Book } from '../types';

const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const bookSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'O título completo do livro.' },
    price: { type: Type.NUMBER, description: 'Um preço de varejo sugerido para o livro em Reais (BRL).' }
  },
  required: ['title', 'price']
};

export async function fetchBookDetailsByISBN(isbn: string): Promise<Omit<Book, 'isbn' | 'quantity'>> {
  if (!ai) {
    throw new Error("Serviço de IA não configurado. Por favor, adicione uma Chave de API se desejar usar a busca automática.");
  }
  const prompt = `Busque as informações para o livro com o ISBN: ${isbn}. Encontre o título e sugira um preço de varejo em BRL (Reais). Se o ISBN for inválido ou o livro não for encontrado, a resposta deve ser vazia.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: bookSchema,
        thinkingConfig: { thinkingBudget: 0 }
      },
    });

    const text = response.text;
    if (!text) {
        throw new Error("A API não retornou dados para o ISBN fornecido.");
    }
    const jsonText = text.trim();
    
    const bookData = JSON.parse(jsonText);

    if (typeof bookData.title !== 'string' || typeof bookData.price !== 'number') {
        throw new Error("Os dados recebidos da API estão em um formato inválido.");
    }

    return {
      title: bookData.title,
      price: bookData.price,
    };
  } catch (error) {
    console.error("Erro ao buscar detalhes do livro com Gemini:", error);
    if (error instanceof Error && error.message.includes("API não retornou dados")) {
        throw new Error(`Não foram encontrados detalhes online para o ISBN ${isbn}.`);
    }
    throw new Error("Falha na comunicação com o serviço de busca de livros.");
  }
}

export async function parseInvoiceFromImage(base64DataUri: string): Promise<Array<Book & { quantity: number }>> {
    if (!ai) {
        throw new Error("Serviço de IA não configurado. Por favor, adicione uma Chave de API para usar a leitura de Notas Fiscais.");
    }
    // Schema estrito para garantir que a IA retorne exatamente o que precisamos para popular o estoque
    const invoiceSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                isbn: { type: Type.STRING, description: "O código EAN ou ISBN do item (geralmente 13 dígitos). Se não houver, deixe vazio." },
                title: { type: Type.STRING, description: "O título ou descrição do livro/produto." },
                quantity: { type: Type.NUMBER, description: "A quantidade comprada deste item." },
                price: { type: Type.NUMBER, description: "O valor unitário do item em Reais (BRL)." }
            },
            required: ["isbn", "title", "quantity", "price"]
        }
    };

    const prompt = `
        Analise este documento de Nota Fiscal (DANFE ou Cupom).
        Extraia a lista de livros/produtos comprados.
        Ignore taxas, fretes, ou itens que não sejam produtos de venda.
        Se o código EAN/ISBN não estiver explícito, tente identificá-lo pelo código do produto, mas priorize códigos de 13 dígitos.
        Corrija nomes de livros que estejam muito abreviados se for óbvio, caso contrário mantenha como está.
    `;

    // Detectar MIME Type dinamicamente (pode ser image/jpeg, image/png ou application/pdf)
    const mimeTypeMatch = base64DataUri.match(/^data:(.*);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
    
    // Remover o prefixo para enviar apenas o payload base64 puro
    const base64Data = base64DataUri.replace(/^data:.*;base64,/, "");

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: mimeType, data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: invoiceSchema,
                // thinkingConfig não é necessário aqui, queremos velocidade
            }
        });

        const text = response.text;
        if (!text) {
            throw new Error("A IA não conseguiu extrair dados do arquivo.");
        }

        const items = JSON.parse(text);
        
        if (!Array.isArray(items)) {
             throw new Error("Formato de resposta inválido da IA.");
        }

        return items.map((item: any) => ({
            isbn: item.isbn || "",
            title: item.title || "Item Desconhecido",
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0
        }));

    } catch (error) {
        console.error("Erro ao processar nota fiscal:", error);
        throw new Error("Não foi possível ler a nota fiscal. Se for PDF, verifique se não está protegido por senha. Se for foto, tente uma mais nítida.");
    }
}