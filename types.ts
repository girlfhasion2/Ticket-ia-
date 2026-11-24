export interface Person {
  id: string;
  name: string;
  /** Si es un amigo de la app: su id de usuario. Sin él, es un nombre libre. */
  userId?: string;
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

export interface Category {
  id: string;
  user_id?: string;
  name: string;
  created_at?: string;
}

export type TicketStatus = 'borrador' | 'repartido' | 'pagado';

export interface Ticket {
  id: string;
  merchant: string;
  date: string;
  totalAmount: number;
  categoryId?: string;
  status?: TicketStatus;
  imageBase64?: string;
  participants: Person[];
  lines: TicketLine[];
  discardedLines: TicketLine[]; // Nuevo: para elementos quitados del cálculo
  createdAt: number;
}

export type SortField = 'date' | 'name' | 'amount';
export type SortDirection = 'asc' | 'desc';

export interface TicketSortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface AppState {
  view: 'list' | 'detail' | 'people' | 'settings' | 'friends' | 'shared';
  selectedTicketId?: string;
}
