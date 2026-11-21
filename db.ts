import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseReady } from './src/lib/supabase';
import { Ticket, Category } from './types';

const DEFAULT_CATEGORY_NAMES = ['Restaurante', 'Casa', 'Viaje', 'Evento'] as const;
const seedingInFlight = new Map<string, Promise<Category[]>>();

interface TicketRow {
  id: string;
  user_id: string;
  data: Ticket;
  created_at?: string;
}

function formatDbError(
  action: string,
  error: { code?: string; message?: string; hint?: string },
  table: 'tickets' | 'categories' = 'tickets'
): Error {
  const code = error.code || '';
  const msg = error.message || 'Error desconocido de Supabase.';

  if (code === '42501' || msg.toLowerCase().includes('permission denied')) {
    return new Error(
      `Permisos insuficientes en Supabase (${action}). Ejecuta en el SQL Editor de Supabase: GRANT USAGE ON SCHEMA public TO authenticated; GRANT ALL ON TABLE public.${table} TO authenticated;`
    );
  }

  if (code === '42P01' || code === 'PGRST205') {
    return new Error(
      `La tabla "${table}" no existe en Supabase (${action}). Crea la tabla con el esquema SQL proporcionado.`
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
    throw new Error('Debes iniciar sesión para acceder a tus datos.');
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
    throw formatDbError('obtener los tickets', error, 'tickets');
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
      throw formatDbError('cargar el ticket', error, 'tickets');
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
      throw formatDbError('crear el ticket', error, 'tickets');
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
      throw formatDbError('guardar el ticket', error, 'tickets');
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
      throw formatDbError('eliminar el ticket', error, 'tickets');
    }
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { client, userId } = await getReadyClientAndUserId();
    const { error } = await client
      .from('tickets')
      .delete()
      .in('id', ids)
      .eq('user_id', userId);

    if (error) {
      throw formatDbError('eliminar los tickets', error, 'tickets');
    }
  }

  async clear(): Promise<void> {
    const { client, userId } = await getReadyClientAndUserId();
    const { error } = await client
      .from('tickets')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw formatDbError('borrar los tickets', error, 'tickets');
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

function getSeedStorageKey(userId: string): string {
  return `ticketsplit_categories_seeded_${userId}`;
}

function markCategoriesSeeded(userId: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(getSeedStorageKey(userId), '1');
    }
  } catch {
    // Ignore storage errors
  }
}

function wasCategoriesSeeded(userId: string): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(getSeedStorageKey(userId)) === '1';
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

class SupabaseCategoriesStore {
  async seedDefaults(): Promise<Category[]> {
    const { client, userId } = await getReadyClientAndUserId();

    const existingPromise = seedingInFlight.get(userId);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async () => {
      const { data: existing, error: fetchError } = await client
        .from('categories')
        .select('id, user_id, name, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        throw formatDbError('obtener las categorías', fetchError, 'categories');
      }

      if (existing && existing.length > 0) {
        markCategoriesSeeded(userId);
        return existing as Category[];
      }

      const payload = DEFAULT_CATEGORY_NAMES.map((name) => ({
        user_id: userId,
        name,
      }));

      const { data: inserted, error: insertError } = await client
        .from('categories')
        .insert(payload)
        .select('id, user_id, name, created_at');

      if (insertError) {
        throw formatDbError('crear las categorías iniciales', insertError, 'categories');
      }

      markCategoriesSeeded(userId);
      return (inserted as Category[]) || [];
    })().finally(() => {
      seedingInFlight.delete(userId);
    });

    seedingInFlight.set(userId, promise);
    return promise;
  }

  async toArray(): Promise<Category[]> {
    const { client, userId } = await getReadyClientAndUserId();
    const { data, error } = await client
      .from('categories')
      .select('id, user_id, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw formatDbError('obtener las categorías', error, 'categories');
    }

    const categories = (data as Category[] | null) || [];
    if (categories.length === 0 && !wasCategoriesSeeded(userId)) {
      return this.seedDefaults();
    }

    if (categories.length > 0) {
      markCategoriesSeeded(userId);
    }

    return categories;
  }

  async add(name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('El nombre de la categoría no puede estar vacío.');
    }

    const { client, userId } = await getReadyClientAndUserId();
    const { data, error } = await client
      .from('categories')
      .insert({
        user_id: userId,
        name: trimmed,
      })
      .select('id, user_id, name, created_at')
      .single<Category>();

    if (error || !data) {
      throw formatDbError(
        'crear la categoría',
        error || { message: 'No se recibió respuesta.' },
        'categories'
      );
    }

    markCategoriesSeeded(userId);
    return data;
  }

  async update(id: string, name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('El nombre de la categoría no puede estar vacío.');
    }

    const { client, userId } = await getReadyClientAndUserId();
    const { data, error } = await client
      .from('categories')
      .update({ name: trimmed })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, user_id, name, created_at')
      .single<Category>();

    if (error || !data) {
      throw formatDbError(
        'actualizar la categoría',
        error || { message: 'No se encontró la categoría.' },
        'categories'
      );
    }

    return data;
  }

  async delete(id: string): Promise<void> {
    const { client, userId } = await getReadyClientAndUserId();
    const { error } = await client
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw formatDbError('eliminar la categoría', error, 'categories');
    }

    // Clear categoryId from any tickets referencing the deleted category
    try {
      const tickets = await fetchUserTickets();
      const affected = tickets.filter((t) => t.categoryId === id);
      if (affected.length > 0) {
        await Promise.all(
          affected.map((t) => {
            const { categoryId: _removed, ...rest } = t;
            return client
              .from('tickets')
              .upsert(
                { id: t.id, user_id: userId, data: rest },
                { onConflict: 'id' }
              );
          })
        );
      }
    } catch {
      // Non-fatal if cleanup fails
    }
  }
}

export const db = {
  tickets: new SupabaseTicketsStore(),
  categories: new SupabaseCategoriesStore(),
};
