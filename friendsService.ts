import { supabaseReady } from './src/lib/supabase';

export interface MyProfile {
  id: string;
  displayName: string;
  friendCode: string;
  discoverableByEmail: boolean;
}

export interface Friend {
  friendId: string;
  displayName: string;
  alias: string | null;
  since: string | null;
}

export interface FriendRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  otherId: string;
  /** Solo se conoce el nombre en las solicitudes recibidas. */
  displayName: string | null;
  createdAt: string;
}

/** Nombre que se muestra: el apodo privado si existe, y si no, el nombre del otro. */
export const friendLabel = (f: Pick<Friend, 'alias' | 'displayName'>): string =>
  f.alias?.trim() || f.displayName;

function friendlyError(error: { message?: string; code?: string }): Error {
  const msg = error.message || '';
  const code = error.code || '';
  if (
    code === 'PGRST202' ||
    code === '42883' ||
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('Could not find the function') ||
    msg.includes('does not exist')
  ) {
    return new Error(
      'La parte de amigos aún no está activada en el servidor (falta ejecutar la migración en Supabase).'
    );
  }
  if (msg.includes('Demasiados intentos')) return new Error(msg);
  if (msg.includes('Solo puedes poner apodo')) return new Error(msg);
  return new Error(msg || 'No se pudo completar la operación.');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await supabaseReady;
  const { data, error } = await client.rpc(fn, args);
  if (error) throw friendlyError(error);
  return data as T;
}

export const friendsService = {
  async getMyProfile(): Promise<MyProfile | null> {
    const client = await supabaseReady;
    // La política de seguridad solo deja leer el perfil propio.
    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, friend_code, discoverable_by_email')
      .maybeSingle();
    if (error) throw friendlyError(error);
    if (!data) return null;
    return {
      id: data.id,
      displayName: data.display_name,
      friendCode: data.friend_code,
      discoverableByEmail: data.discoverable_by_email,
    };
  },

  async updateMyProfile(patch: {
    displayName?: string;
    discoverableByEmail?: boolean;
  }): Promise<void> {
    const client = await supabaseReady;
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error('Debes iniciar sesión.');
    const update: Record<string, unknown> = {};
    if (patch.displayName !== undefined) {
      const name = patch.displayName.trim().slice(0, 40);
      if (!name) throw new Error('El nombre no puede estar vacío.');
      update.display_name = name;
    }
    if (patch.discoverableByEmail !== undefined) {
      update.discoverable_by_email = patch.discoverableByEmail;
    }
    const { error } = await client.from('profiles').update(update).eq('id', auth.user.id);
    if (error) throw friendlyError(error);
  },

  async listFriends(): Promise<Friend[]> {
    const rows = await rpc<
      { friend_id: string; display_name: string; alias: string | null; since: string | null }[]
    >('list_friends');
    return (rows || []).map((r) => ({
      friendId: r.friend_id,
      displayName: r.display_name,
      alias: r.alias,
      since: r.since,
    }));
  },

  async listRequests(): Promise<FriendRequest[]> {
    const rows = await rpc<
      {
        id: string;
        direction: 'incoming' | 'outgoing';
        other_id: string;
        display_name: string | null;
        created_at: string;
      }[]
    >('list_friend_requests');
    return (rows || []).map((r) => ({
      id: r.id,
      direction: r.direction,
      otherId: r.other_id,
      displayName: r.display_name,
      createdAt: r.created_at,
    }));
  },

  /** La respuesta es siempre la misma exista o no la cuenta (a propósito). */
  async sendRequestByEmail(email: string): Promise<void> {
    await rpc<void>('send_friend_request', { p_email: email.trim(), p_code: null });
  },

  async sendRequestByCode(code: string): Promise<void> {
    await rpc<void>('send_friend_request', { p_email: null, p_code: code.trim() });
  },

  async respondToRequest(id: string, accept: boolean): Promise<void> {
    await rpc<void>('respond_friend_request', { p_id: id, p_accept: accept });
  },

  async removeFriend(friendId: string): Promise<void> {
    await rpc<void>('remove_friend', { p_friend: friendId });
  },

  async blockUser(userId: string): Promise<void> {
    await rpc<void>('block_user', { p_user: userId });
  },

  /** Texto vacío = quitar el apodo. */
  async setAlias(friendId: string, alias: string): Promise<void> {
    await rpc<void>('set_friend_alias', { p_friend: friendId, p_alias: alias });
  },
};
