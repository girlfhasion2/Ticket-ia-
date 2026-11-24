import { supabaseReady } from './src/lib/supabase';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'added_to_ticket'
  | 'member_joined'
  | 'payment_sent'
  | 'payment_confirmed'
  | 'payment_reopened'
  | 'payment_reminder';

export interface AppNotification {
  id: string;
  type: NotificationType;
  actorId: string | null;
  actorName: string;
  ticketId: string | null;
  merchant: string | null;
  friendshipId: string | null;
  /** Solo en avisos con acciones: cómo se resolvió. */
  resolved: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Avisos que piden una respuesta y, mientras no se resuelven, siguen reclamando atención. */
export const ACTIONABLE_TYPES: NotificationType[] = ['friend_request', 'payment_sent'];

export const needsAttention = (n: AppNotification): boolean =>
  !n.readAt || (n.resolved === null && ACTIONABLE_TYPES.includes(n.type));

function friendlyError(error: { message?: string; code?: string }): Error {
  const msg = error.message || '';
  const code = error.code || '';
  if (
    code === 'PGRST202' ||
    code === '42883' ||
    code === '42P01' ||
    msg.includes('Could not find the function') ||
    msg.includes('does not exist')
  ) {
    return new Error(
      'El buzón aún no está activado en el servidor (falta ejecutar la migración 005 en Supabase).'
    );
  }
  return new Error(msg || 'No se pudo completar la operación.');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await supabaseReady;
  const { data, error } = await client.rpc(fn, args);
  if (error) throw friendlyError(error);
  return data as T;
}

export const notificationsService = {
  async list(): Promise<AppNotification[]> {
    const rows = await rpc<
      {
        id: string;
        type: NotificationType;
        actor_id: string | null;
        actor_name: string | null;
        ticket_id: string | null;
        data: { merchant?: string; friendship_id?: string } | null;
        resolved: string | null;
        read_at: string | null;
        created_at: string;
      }[]
    >('list_notifications', { p_limit: 60 });
    return (rows || []).map((r) => ({
      id: r.id,
      type: r.type,
      actorId: r.actor_id,
      actorName: r.actor_name || 'Alguien',
      ticketId: r.ticket_id,
      merchant: r.data?.merchant ?? null,
      friendshipId: r.data?.friendship_id ?? null,
      resolved: r.resolved,
      readAt: r.read_at,
      createdAt: r.created_at,
    }));
  },

  async markRead(id: string): Promise<void> {
    await rpc<void>('mark_notification_read', { p_id: id });
  },

  async markAllRead(): Promise<void> {
    await rpc<void>('mark_all_notifications_read');
  },

  async attentionCount(): Promise<number> {
    const n = await rpc<number>('notification_attention_count');
    return typeof n === 'number' ? n : 0;
  },
};
