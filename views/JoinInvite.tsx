import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, UserCheck } from 'lucide-react';
import { sharingService, InvitePreview } from '../sharingService';

interface JoinInviteProps {
  token: string;
  /** Se unió (o ya estaba dentro): abrir el ticket compartido. */
  onJoined: (ticketId: string) => void;
  /** El enlace es de un ticket propio: abrirlo como propietario. */
  onOpenOwn: (ticketId: string) => void;
  onCancel: () => void;
}

const NONE = '__none__';

const JoinInvite: React.FC<JoinInviteProps> = ({ token, onJoined, onOpenOwn, onCancel }) => {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    sharingService
      .previewInvite(token)
      .then((p) => {
        if (!active) return;
        setPreview(p);
        if (p.isOwner) onOpenOwn(p.ticketId);
        else if (p.alreadyMember) onJoined(p.ticketId);
      })
      .catch((e: any) => {
        if (active) setError(e?.message || 'No se pudo abrir la invitación.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const join = async () => {
    if (!preview || choice === null) return;
    setBusy(true);
    try {
      const id = await sharingService.joinViaInvite(token, choice === NONE ? null : choice);
      onJoined(id);
    } catch (e: any) {
      setError(e?.message || 'No se pudo unir al ticket.');
      // Refresca la lista por si alguien acaba de elegir ese nombre.
      try {
        setPreview(await sharingService.previewInvite(token));
        setChoice(null);
      } catch {
        /* ignorar */
      }
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gray-50 shadow-xl overflow-y-auto">
      <div className="p-5 pt-10 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-3">
            <UserCheck size={26} />
          </div>
          <h1 className="text-xl font-black text-gray-900">Te han invitado a un ticket</h1>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <RefreshCw size={24} className="animate-spin text-indigo-600" />
          </div>
        )}

        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-bold flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {!loading && preview && !preview.isOwner && !preview.alreadyMember && (
          <>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <div className="text-base font-black text-gray-900">{preview.merchant}</div>
              <div className="text-xs font-bold text-gray-500 mt-1">
                {preview.date ? `${preview.date} · ` : ''}de {preview.ownerName}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                ¿Quién eres?
              </div>
              <div className="space-y-2">
                {preview.participants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={p.taken}
                    onClick={() => setChoice(p.id)}
                    className={`w-full flex items-center justify-between rounded-2xl border-2 px-4 py-3 text-left ${
                      choice === p.id
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-100 bg-white'
                    } ${p.taken ? 'opacity-40' : ''}`}
                  >
                    <span className="text-sm font-black text-gray-900">{p.name}</span>
                    {p.taken && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Ya elegido
                      </span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setChoice(NONE)}
                  className={`w-full rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold ${
                    choice === NONE ? 'border-indigo-600 bg-indigo-50 text-gray-900' : 'border-gray-100 bg-white text-gray-600'
                  }`}
                >
                  No estoy en la lista
                </button>
              </div>
              <p className="text-[11px] font-semibold text-gray-400 mt-2">
                Verás el reparto completo, pero solo {preview.ownerName} puede editarlo. Si no estás en la
                lista, {preview.ownerName} podrá vincularte después.
              </p>
            </div>

            <button
              type="button"
              onClick={join}
              disabled={busy || choice === null}
              className="w-full bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl py-3.5 disabled:opacity-40"
            >
              Unirme al ticket
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="w-full text-[11px] font-black uppercase tracking-widest text-gray-500 py-2"
        >
          {error && !preview ? 'Volver a la app' : 'Ahora no'}
        </button>
      </div>
    </div>
  );
};

export default JoinInvite;
