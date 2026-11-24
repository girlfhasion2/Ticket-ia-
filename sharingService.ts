import { supabaseReady } from './src/lib/supabase';
import { Ticket } from './types';

export interface TicketMember {
  userId: string;
  displayName: string;
  participantId: string | null;
  joinedAt: string;
}

export interface ParticipantLabel {
  participantId: string;
  displayName: string;
  /** Apodo que quien mira tiene guardado para esa persona. */
  alias: string | null;
}

export type PaymentStatus = 'pending' | 'sent' | 'confirmed';

export interface SharedTicket {
  ticketId: string;
  ownerId: string;
  ownerName: string;
  myParticipantId: string | null;
  myPaymentStatus: PaymentStatus;
  lastReminderAt: string | null;
  ticket: Ticket;
}

export interface OwnedMember {
  userId: string;
  displayName: string;
  participantId: string | null;
  status: PaymentStatus;
  lastReminderAt: string | null;
}

/** Un ticket mío que he compartido, con el estado de pago de cada miembro. */
export interface OwnedSharedTicket {
  ticketId: string;
  ticket: Ticket;
  members: OwnedMember[];
}

export interface InvitePreview {
  ticketId: string;
  merchant: string;
  date: string;
  ownerName: string;
  isOwner: boolean;
  alreadyMember: boolean;
  participants: { id: string; name: string; taken: boolean }[];
}

const PENDING_INVITE_KEY = 'ticketia_pending_invite';

export const pendingInvite = {
  get(): string | null {
    try {
      return window.localStorage.getItem(PENDING_INVITE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      window.localStorage.setItem(PENDING_INVITE_KEY, token);
    } catch {
      /* sin almacenamiento */
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(PENDING_INVITE_KEY);
    } catch {
      /* sin almacenamiento */
    }
  },
};

export const buildInviteUrl = (token: string): string =>
  `${window.location.origin}/?invite=${encodeURIComponent(token)}`;

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
      'Compartir tickets aún no está activado en el servidor (falta ejecutar la migración en Supabase).'
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

type SharedRow = {
  ticket_id: string;
  owner_id: string;
  owner_name: string;
  my_participant_id: string | null;
  my_payment_status: PaymentStatus;
  last_reminder_at: string | null;
  data: Ticket;
};

const toShared = (r: SharedRow): SharedTicket => ({
  ticketId: r.ticket_id,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  myParticipantId: r.my_participant_id,
  myPaymentStatus: r.my_payment_status || 'pending',
  lastReminderAt: r.last_reminder_at,
  ticket: r.data,
});

export const sharingService = {
  // ----- Propietario -----
  async getActiveInvite(ticketId: string): Promise<string | null> {
    return rpc<string | null>('get_active_ticket_invite', { p_ticket: ticketId });
  },

  async createInvite(ticketId: string): Promise<string> {
    return rpc<string>('create_ticket_invite', { p_ticket: ticketId, p_days: 14 });
  },

  async revokeInvites(ticketId: string): Promise<void> {
    await rpc<void>('revoke_ticket_invites', { p_ticket: ticketId });
  },

  async listMembers(ticketId: string): Promise<TicketMember[]> {
    const rows = await rpc<
      { user_id: string; display_name: string; participant_id: string | null; joined_at: string }[]
    >('list_ticket_members', { p_ticket: ticketId });
    return (rows || []).map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      participantId: r.participant_id,
      joinedAt: r.joined_at,
    }));
  },

  async getParticipantLabels(ticketId: string): Promise<ParticipantLabel[]> {
    const rows = await rpc<
      { participant_id: string; display_name: string; alias: string | null }[]
    >('get_ticket_participant_labels', { p_ticket: ticketId });
    return (rows || []).map((r) => ({
      participantId: r.participant_id,
      displayName: r.display_name,
      alias: r.alias,
    }));
  },

  async linkMember(ticketId: string, userId: string, participantId: string | null): Promise<void> {
    await rpc<void>('link_ticket_member', {
      p_ticket: ticketId,
      p_user: userId,
      p_participant: participantId,
    });
  },

  async removeMember(ticketId: string, userId: string): Promise<void> {
    await rpc<void>('remove_ticket_member', { p_ticket: ticketId, p_user: userId });
  },

  // ----- Invitado -----
  async previewInvite(token: string): Promise<InvitePreview> {
    const r = await rpc<{
      ticket_id: string;
      merchant: string | null;
      date: string | null;
      owner_name: string;
      is_owner: boolean;
      already_member: boolean;
      participants: { id: string; name: string; taken: boolean }[];
    }>('get_invite_preview', { p_token: token });
    return {
      ticketId: r.ticket_id,
      merchant: r.merchant || 'Ticket sin nombre',
      date: r.date || '',
      ownerName: r.owner_name,
      isOwner: r.is_owner,
      alreadyMember: r.already_member,
      participants: r.participants || [],
    };
  },

  async joinViaInvite(token: string, participantId: string | null): Promise<string> {
    return rpc<string>('join_ticket_via_invite', { p_token: token, p_participant: participantId });
  },

  async listSharedTickets(): Promise<SharedTicket[]> {
    const rows = await rpc<SharedRow[]>('list_shared_tickets');
    return (rows || []).map(toShared);
  },

  async listOwnedSharedTickets(): Promise<OwnedSharedTicket[]> {
    const rows = await rpc<
      {
        ticket_id: string;
        data: Ticket;
        members:
          | {
              user_id: string;
              display_name: string;
              participant_id: string | null;
              status: PaymentStatus;
              last_reminder_at: string | null;
            }[]
          | null;
      }[]
    >('list_owned_shared_tickets');
    return (rows || []).map((r) => ({
      ticketId: r.ticket_id,
      ticket: r.data,
      members: (r.members || []).map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        participantId: m.participant_id,
        status: m.status || 'pending',
        lastReminderAt: m.last_reminder_at,
      })),
    }));
  },

  // ----- Pagos -----
  async markPaymentSent(ticketId: string): Promise<void> {
    await rpc<void>('mark_payment_sent', { p_ticket: ticketId });
  },

  async undoPaymentSent(ticketId: string): Promise<void> {
    await rpc<void>('undo_payment_sent', { p_ticket: ticketId });
  },

  async confirmPayment(ticketId: string, userId: string): Promise<void> {
    await rpc<void>('confirm_payment', { p_ticket: ticketId, p_user: userId });
  },

  async reopenPayment(ticketId: string, userId: string): Promise<void> {
    await rpc<void>('reopen_payment', { p_ticket: ticketId, p_user: userId });
  },

  async remindPayment(ticketId: string, userId: string): Promise<void> {
    await rpc<void>('remind_payment', { p_ticket: ticketId, p_user: userId });
  },

  async getSharedTicket(ticketId: string): Promise<SharedTicket | null> {
    const rows = await rpc<SharedRow[]>('get_shared_ticket', { p_ticket: ticketId });
    return rows && rows.length > 0 ? toShared(rows[0]) : null;
  },
};
