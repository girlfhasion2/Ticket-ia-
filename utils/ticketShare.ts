import { Ticket } from '../types';

/** Devuelve true si el reparto del ticket está completo (todo asignado y suma igual al total) */
export function computeRepartoCompleto(ticket: Ticket): boolean {
  const hasUnassigned = ticket.lines.some((line) => {
    const assigned = line.assignments.reduce((s, a) => s + a.units, 0);
    return line.quantity > assigned + 0.001;
  });
  if (hasUnassigned) return false;

  const totalRepartido = ticket.lines.reduce((sum, line) => {
    return (
      sum +
      line.assignments.reduce((s, a) => {
        if (a.personIds.length > 0) return s + a.units * line.unitPrice;
        return s;
      }, 0)
    );
  }, 0);

  return Math.abs(totalRepartido - ticket.totalAmount) < 0.02;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatShareQuantity(num: number, den: number): string {
  const g = gcd(num, den);
  const n = num / g;
  const d = den / g;
  const whole = Math.floor(n / d);
  const rem = n % d;
  if (rem === 0) return whole <= 1 ? '' : ` (x${whole})`;
  if (whole === 0) return ` (x${rem}/${d})`;
  return ` (x${whole}+${rem}/${d})`;
}

/** Construye el texto de compartir con el resumen del ticket */
export function buildShareText(ticket: Ticket): string {
  const merchantName =
    ticket.merchant &&
    ticket.merchant.trim() &&
    ticket.merchant.trim().toLowerCase() !== 'null'
      ? ticket.merchant.trim()
      : 'Sin nombre';

  const userTotals: Record<string, number> = {};
  const personAssignedItems: Record<
    string,
    Map<string, { description: string; num: number; den: number; amount: number }>
  > = {};

  ticket.participants.forEach((p) => {
    userTotals[p.id] = 0;
    personAssignedItems[p.id] = new Map();
  });

  ticket.lines.forEach((line) => {
    line.assignments.forEach((asgn) => {
      if (asgn.personIds.length === 0 || asgn.units <= 0) return;
      const groupTotal = asgn.units * line.unitPrice;
      const perPerson = groupTotal / asgn.personIds.length;
      const addNum = Number.isInteger(asgn.units) ? asgn.units : Math.round(asgn.units * 100);
      const addDen = Number.isInteger(asgn.units) ? asgn.personIds.length : 100 * asgn.personIds.length;

      asgn.personIds.forEach((pId) => {
        userTotals[pId] = (userTotals[pId] || 0) + perPerson;
        const existing = personAssignedItems[pId]?.get(line.id);
        if (existing) {
          const rawNum = existing.num * addDen + addNum * existing.den;
          const rawDen = existing.den * addDen;
          const g = gcd(rawNum, rawDen);
          existing.num = rawNum / g;
          existing.den = rawDen / g;
          existing.amount += perPerson;
        } else {
          const g = gcd(addNum, addDen);
          personAssignedItems[pId]?.set(line.id, {
            description: line.description,
            num: addNum / g,
            den: addDen / g,
            amount: perPerson,
          });
        }
      });
    });
  });

  const sections: string[] = [
    `${merchantName}`,
    `${ticket.date} - Total: ${ticket.totalAmount.toFixed(2)}EUR`,
  ];

  ticket.participants.forEach((p) => {
    const items = Array.from(personAssignedItems[p.id]?.values() || []);
    if (items.length === 0) return;
    const personLines = items.map(
      (item) =>
        `  - ${item.description}${formatShareQuantity(item.num, item.den)} - ${item.amount.toFixed(2)}EUR`
    );
    const total = (userTotals[p.id] || 0).toFixed(2);
    sections.push('', [`${p.name} - ${total}EUR`, ...personLines].join('\n'));
  });

  return sections.join('\n');
}

/** Abre la bandeja de compartir nativa del sistema (móvil) o copia al portapapeles como fallback */
export async function shareTicket(ticket: Ticket): Promise<void> {
  const text = buildShareText(ticket);
  if (navigator.share) {
    await navigator.share({ text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}
