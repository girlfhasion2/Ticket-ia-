import { useCallback, useEffect, useMemo, useState } from 'react';
import { sharingService, OwnedSharedTicket, SharedTicket } from '../sharingService';
import { buildBalances, sumOpen, PersonBalance } from '../utils/balances';

export interface BalanceSummary {
  /** Total que otras personas me deben (solo deudas abiertas). */
  owedTotal: number;
  /** Total que yo debo (solo deudas abiertas). */
  oweTotal: number;
  /** Personas con importe abierto en cada dirección. */
  owedPeople: number;
  owePeople: number;
}

const EPS = 0.005;

/** Carga los tickets compartidos y calcula los saldos con cada persona. */
export function useBalances() {
  const [owned, setOwned] = useState<OwnedSharedTicket[]>([]);
  const [shared, setShared] = useState<SharedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ow, sh] = await Promise.all([
        sharingService.listOwnedSharedTickets(),
        sharingService.listSharedTickets(),
      ]);
      setOwned(ow);
      setShared(sh);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el balance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const balances = useMemo(() => buildBalances(owned, shared), [owned, shared]);

  const summary: BalanceSummary = useMemo(() => {
    let owedTotal = 0;
    let oweTotal = 0;
    let owedPeople = 0;
    let owePeople = 0;
    balances.forEach((b: PersonBalance) => {
      const owed = sumOpen(b.entries, 'theyOwe');
      const owe = sumOpen(b.entries, 'iOwe');
      owedTotal += owed;
      oweTotal += owe;
      if (owed > EPS) owedPeople += 1;
      if (owe > EPS) owePeople += 1;
    });
    return { owedTotal, oweTotal, owedPeople, owePeople };
  }, [balances]);

  return { balances, summary, loading, error, reload };
}
