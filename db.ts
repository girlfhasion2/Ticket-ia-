import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseReady } from './src/lib/supabase';
import { Ticket } from './types';

interface TicketRow {
  id: string;
  user_id: string;
  data: Ticket;
  created_at?: string;
}

function formatDbError(
  action: string,
  error: { code?: string; message?: string; hint?: string }
): Error {
  const code = error.code || '';
  const msg = error.message || 'Error desconocido de Supabase.';

  if (code === '42501' || msg.toLowerCase().includes('permission denied')) {
    return new Error(
      `Permisos insuficientes en Supabase (${action}). Ejecuta en el SQL Editor de Supabase: GRANT USAGE ON SCHEMA public TO authenticated; GRANT ALL ON TABLE public.tickets TO authenticated;`
    );
  }

  if (code === '42P01' || code === 'PGRST205') {
    return new Error(
      `La tabla "tickets" no existe en Supabase (${action}). Crea la tabla con el esquema SQL proporcionado.`
    );
  }

  return new Error(`Error al ${action}: ${msg}`);
}

async function getReadyClientAndUserId(): Promise<{
  client: SupabaseClient;
  userId: string;
}> {
  const client = await supabaseReady;
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error('Debes iniciar sesión para acceder a tus tickets.');
  }

  return { client, userId: user.id };
}

function sortTicketsByField(
  tickets: Ticket[],
  field: keyof Ticket,
  descending: boolean
): Ticket[] {
  return [...tickets].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];

    let cmp = 0;
    if (typeof valA === 'number' && typeof valB === 'number') {
      cmp = valA - valB;
    } else {
      cmp = String(valA ?? '').localeCompare(String(valB ?? ''));
    }

    return descending ? -cmp : cmp;
  });
}

async function fetchUserTickets(): Promise<Ticket[]> {
  const { client, userId } = await getReadyClientAndUserId();
  const { data, error } = await client
    .from('tickets')
    .select('data')
    .eq('user_id', userId);

  if (error) {
    throw formatDbError('obtener los tickets', error);
  }

  return ((data as Pick<TicketRow, 'data'>[] | null) || []).map((row) => row.data);
}

class SupabaseTicketsStore {
  async get(id: string): Promise<Ticket | undefined> {
    const { client, userId } = await getReadyClientAndUserId();
    const { data, error } = await client
      .from('tickets')
      .select('data')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle<Pick<TicketRow, 'data'>>();

    if (error) {
      throw formatDbError('cargar el ticket', error);
    }

    return data?.data;
  }

  async add(ticket: Ticket): Promise<string> {
    const { client, userId } = await getReadyClientAndUserId();
    const { error } = await client.from('tickets').insert({
      id: ticket.id,
      user_id: userId,
      data: ticket,
    });

    if (error) {
      throw formatDbError('crear el ticket', error);
    }

    return ticket.id;
  }

  async put(ticket: Ticket): Promise<string> {
    const { client, userId } = await getReadyClientAndUserId();
    const { error } = await client.from('tickets').upsert(
      {
        id: ticket.id,
        user_id: userId,
        data: ticket,
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw formatDbError('guardar el ticket', error);
    }

    return ticket.id;
  }

  async delete(id: string): Promise<void> {
    const { client, userId } = await getReadyClientAndUserId();
    const { error } = await client
      .from('tickets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw formatDbError('eliminar el ticket', error);
    }
  }

  async clear(): Promise<void> {
    const { client, userId } = await getReadyClientAndUserId();
    const { error } = await client
      .from('tickets')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw formatDbError('borrar los tickets', error);
    }
  }

  async toArray(): Promise<Ticket[]> {
    return fetchUserTickets();
  }

  orderBy(field: keyof Ticket) {
    return {
      toArray: async (): Promise<Ticket[]> => {
        const items = await fetchUserTickets();
        return sortTicketsByField(items, field, false);
      },
      reverse: () => ({
        toArray: async (): Promise<Ticket[]> => {
          const items = await fetchUserTickets();
          return sortTicketsByField(items, field, true);
        },
      }),
    };
  }
}

export const db = {
  tickets: new SupabaseTicketsStore(),
};
