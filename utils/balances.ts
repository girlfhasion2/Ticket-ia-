import { OwnedSharedTicket, PaymentStatus, SharedTicket } from '../sharingService';
import { computeTicketTotals } from './ticketTotals';

/** 'theyOwe': la otra persona me debe a mí. 'iOwe': yo le debo a ella. */
export type DebtDirection = 'theyOwe' | 'iOwe';

export interface BalanceEntry {
  ticketId: string;
  merchant: string;
  date: string;
  amount: number;
  direction: DebtDirection;
  status: PaymentStatus;
  lastReminderAt: string | null;
}

export interface PersonBalance {
  userId: string;
  displayName: string;
  entries: BalanceEntry[];
}

const EPS = 0.005;

/** Una deuda sigue abierta hasta que el propietario la confirma. */
export const isOpen = (e: BalanceEntry): boolean => e.status !== 'confirmed';

/**
 * Deudas entre yo y cada persona, a partir de los tickets que he compartido
 * y los que han compartido conmigo. Se supone que quien creó el ticket lo pagó.
 */
export function buildBalances(
  owned: OwnedSharedTicket[],
  shared: SharedTicket[]
): Map<string, PersonBalance> {
  const map = new Map<string, PersonBalance>();
  const bucket = (userId: string, displayName: string): PersonBalance => {
    let b = map.get(userId);
    if (!b) {
      b = { userId, displayName, entries: [] };
      map.set(userId, b);
    }
    return b;
  };

  owned.forEach((o) => {
    const { totals } = computeTicketTotals(o.ticket);
    o.members.forEach((m) => {
      if (!m.participantId) return;
      const amount = totals[m.participantId];
      if (amount === undefined || amount <= EPS) return;
      bucket(m.userId, m.displayName).entries.push({
        ticketId: o.ticketId,
        merchant: o.ticket.merchant || 'Ticket sin nombre',
        date: o.ticket.date,
        amount,
        direction: 'theyOwe',
        status: m.status,
        lastReminderAt: m.lastReminderAt,
      });
    });
  });

  shared.forEach((s) => {
    if (!s.myParticipantId || !s.ownerId) return;
    const amount = computeTicketTotals(s.ticket).totals[s.myParticipantId];
    if (amount === undefined || amount <= EPS) return;
    bucket(s.ownerId, s.ownerName).entries.push({
      ticketId: s.ticketId,
      merchant: s.ticket.merchant || 'Ticket sin nombre',
      date: s.ticket.date,
      amount,
      direction: 'iOwe',
      status: s.myPaymentStatus,
      lastReminderAt: s.lastReminderAt,
    });
  });

  map.forEach((b) => b.entries.sort((a, c) => (c.date || '').localeCompare(a.date || '')));
  return map;
}

export const sumOpen = (entries: BalanceEntry[], direction: DebtDirection): number =>
  entries
    .filter((e) => isOpen(e) && e.direction === direction)
    .reduce((s, e) => s + e.amount, 0);
