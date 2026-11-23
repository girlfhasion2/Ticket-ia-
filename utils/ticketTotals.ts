import { Ticket } from '../types';

export interface PersonItem {
  description: string;
  /** Fracción de unidades en texto: "1", "1/2", "1 + 1/3" */
  quantityLabel: string;
  amount: number;
}

export interface TicketTotals {
  totals: Record<string, number>;
  items: Record<string, PersonItem[]>;
  pending: { lineId: string; description: string; units: number }[];
}

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
};

const fractionLabel = (num: number, den: number): string => {
  const g = gcd(num, den);
  const n = num / g;
  const d = den / g;
  const whole = Math.floor(n / d);
  const rem = n % d;
  if (rem === 0) return `${whole}`;
  if (whole === 0) return `${rem}/${d}`;
  return `${whole} + ${rem}/${d}`;
};

/**
 * Importe y productos de cada persona. Misma lógica que usa la pantalla de reparto
 * del propietario, para que ambos vean las mismas cifras.
 */
export function computeTicketTotals(ticket: Ticket): TicketTotals {
  const totals: Record<string, number> = {};
  const acc: Record<string, Map<string, { description: string; num: number; den: number; amount: number }>> = {};
  ticket.participants.forEach((p) => {
    totals[p.id] = 0;
    acc[p.id] = new Map();
  });
  const pending: TicketTotals['pending'] = [];

  ticket.lines.forEach((line) => {
    const assigned = line.assignments.reduce(
      (s, a) => (a.personIds.length > 0 ? s + a.units : s),
      0
    );
    const remaining = line.quantity - assigned;
    if (remaining > 0) {
      pending.push({ lineId: line.id, description: line.description, units: remaining });
    }
    line.assignments.forEach((asgn) => {
      if (asgn.personIds.length === 0 || asgn.units <= 0) return;
      const perPerson = (asgn.units * line.unitPrice) / asgn.personIds.length;
      const addNum = Number.isInteger(asgn.units) ? asgn.units : Math.round(asgn.units * 100);
      const addDen = Number.isInteger(asgn.units)
        ? asgn.personIds.length
        : 100 * asgn.personIds.length;
      asgn.personIds.forEach((pid) => {
        totals[pid] = (totals[pid] || 0) + perPerson;
        if (!acc[pid]) acc[pid] = new Map();
        const ex = acc[pid].get(line.id);
        if (ex) {
          const rawNum = ex.num * addDen + addNum * ex.den;
          const rawDen = ex.den * addDen;
          const g = gcd(rawNum, rawDen);
          ex.num = rawNum / g;
          ex.den = rawDen / g;
          ex.amount += perPerson;
        } else {
          const g = gcd(addNum, addDen);
          acc[pid].set(line.id, {
            description: line.description,
            num: addNum / g,
            den: addDen / g,
            amount: perPerson,
          });
        }
      });
    });
  });

  const items: Record<string, PersonItem[]> = {};
  Object.keys(acc).forEach((pid) => {
    items[pid] = Array.from(acc[pid].values()).map((v) => ({
      description: v.description,
      quantityLabel: fractionLabel(v.num, v.den),
      amount: v.amount,
    }));
  });

  return { totals, items, pending };
}
