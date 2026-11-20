
export interface Person {
  id: string;
  name: string;
}

export interface Assignment {
  id: string;
  units: number;
  personIds: string[];
}

export interface TicketLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  assignments: Assignment[];
}

export interface Ticket {
  id: string;
  merchant: string;
  date: string;
  totalAmount: number;
  imageBase64?: string;
  participants: Person[];
  lines: TicketLine[];
  discardedLines: TicketLine[]; // Nuevo: para elementos quitados del cálculo
  createdAt: number;
}

export interface AppState {
  view: 'list' | 'detail' | 'people' | 'settings';
  selectedTicketId?: string;
}
