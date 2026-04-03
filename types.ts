export interface Book {
  isbn: string;
  title: string;
  price: number;
  quantity: number;
}

export enum PaymentMethod {
  CASH = 'Dinheiro',
  PIX = 'Pix',
  CARD = 'Cartão',
}

export interface Sale {
  id: string;
  items: Book[];
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  total: number; // This is the final total (subtotal - discountAmount)
  paymentMethod: PaymentMethod;
  sellerName: string;
  customerName?: string;
  customerCpf?: string;
  customerPhone?: string;
  date: Date;
}