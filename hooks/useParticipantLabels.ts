import { useCallback, useEffect, useMemo, useState } from 'react';
import { Person } from '../types';
import { friendsService, Friend } from '../friendsService';
import { sharingService, ParticipantLabel } from '../sharingService';

/**
 * Nombre con el que ESTA persona ve a cada participante:
 *  1. el apodo que ella misma tiene guardado para esa persona,
 *  2. si es un amigo de la app (o alguien vinculado), el nombre de su perfil,
 *  3. si es un nombre libre, el nombre escrito en el ticket.
 * Es solo para mostrar: nunca se guarda en el ticket.
 */
export function useParticipantLabels(ticketId: string | undefined, participants: Person[]) {
  const [labels, setLabels] = useState<ParticipantLabel[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);

  const idsKey = participants.map((p) => `${p.id}:${p.userId || ''}`).join('|');

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      setLabels(await sharingService.getParticipantLabels(ticketId));
    } catch {
      /* sin migración o sin acceso: se usan los nombres del ticket */
    }
  }, [ticketId]);

  useEffect(() => {
    // El ticket se guarda un instante después de cambiar los participantes.
    const timer = window.setTimeout(load, 1200);
    return () => window.clearTimeout(timer);
  }, [load, idsKey]);

  useEffect(() => {
    let active = true;
    friendsService
      .listFriends()
      .then((f) => active && setFriends(f))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ticketId]);

  return useMemo(() => {
    const byParticipant = new Map<string, ParticipantLabel>(labels.map((l) => [l.participantId, l]));
    const byFriend = new Map<string, Friend>(friends.map((f) => [f.friendId, f]));
    return (p: Person): string => {
      const l = byParticipant.get(p.id);
      if (l?.alias) return l.alias;
      const f = p.userId ? byFriend.get(p.userId) : undefined;
      if (f?.alias) return f.alias;
      if (p.userId) return l?.displayName || f?.displayName || p.name;
      return p.name;
    };
  }, [labels, friends]);
}
