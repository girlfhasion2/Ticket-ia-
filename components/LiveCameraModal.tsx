import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, RefreshCw, Check, RotateCcw, Images, AlertTriangle } from 'lucide-react';

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  onOpenGallery: () => void;
  onOpenNativeCamera: () => void;
}

const LiveCameraModal: React.FC<LiveCameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  onOpenGallery,
  onOpenNativeCamera,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream();
      setCameraError(null);
      setIsStarting(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsStarting(false);
        setCameraError(
          'Tu navegador no permite streaming de cámara en directo aquí. Puedes usar la cámara nativa del dispositivo o elegir una foto de tu galería.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.error('Live camera error:', err);
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setCameraError(
            'Permiso de cámara denegado. Permite el acceso a la cámara o selecciona una foto desde la galería.'
          );
        } else {
          setCameraError(
            'No se pudo iniciar la cámara en directo en este dispositivo. Puedes usar la cámara nativa o subir una foto de la galería.'
          );
        }
      } finally {
        setIsStarting(false);
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setCapturedPreview(null);
      setCameraError(null);
      return;
    }

    if (!capturedPreview) {
      startCamera(facingMode);
    }

    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, capturedPreview, startCamera, stopStream]);

  if (!isOpen) return null;

  const handleTakePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    stopStream();
    setCapturedPreview(dataUrl);
  };

  const handleRetake = () => {
    setCapturedPreview(null);
  };

  const handleConfirm = () => {
    if (!capturedPreview) return;
    const photo = capturedPreview;
    setCapturedPreview(null);
    stopStream();
    onCapture(photo);
  };

  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col max-w-2xl mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white z-10">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 active-scale transition-colors"
          aria-label="Cerrar cámara"
        >
          <X size={22} />
        </button>

        <span className="text-xs font-black uppercase tracking-widest text-white/90">
          {capturedPreview ? 'Revisar Foto' : 'Cámara en Directo'}
        </span>

        {!capturedPreview && !cameraError ? (
          <button
            type="button"
            onClick={handleSwitchCamera}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 active-scale transition-colors"
            aria-label="Cambiar cámara"
          >
            <RefreshCw size={20} />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* Viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-gray-950">
        {cameraError ? (
          <div className="p-6 max-w-sm text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <p className="text-sm text-gray-200 font-medium leading-relaxed">
              {cameraError}
            </p>
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNativeCamera();
                }}
                className="w-full py-3.5 px-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active-scale"
              >
                <Camera size={18} />
                Usar Cámara del Dispositivo
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGallery();
                }}
                className="w-full py-3.5 px-4 bg-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active-scale"
              >
                <Images size={18} />
                Elegir de la Galería
              </button>
            </div>
          </div>
        ) : capturedPreview ? (
          <img
            src={capturedPreview}
            alt="Vista previa del ticket"
            className="w-full h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Subtle receipt guide overlay */}
            <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-white/35 rounded-3xl flex items-end justify-center pb-4">
              <span className="bg-black/50 backdrop-blur-sm text-white/90 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                Encuadra el ticket completo
              </span>
            </div>
            {isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <RefreshCw className="animate-spin text-white" size={32} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Controls */}
      {!cameraError && (
        <div className="px-6 py-6 bg-black/90 flex items-center justify-between gap-4">
          {capturedPreview ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-4 rounded-2xl bg-white/15 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active-scale"
              >
                <RotateCcw size={18} />
                Repetir
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-[1.5] py-4 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active-scale"
              >
                <Check size={18} />
                Usar Foto
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGallery();
                }}
                className="flex flex-col items-center gap-1 text-white/80 hover:text-white active-scale px-3 py-1"
              >
                <Images size={24} />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Galería
                </span>
              </button>

              <button
                type="button"
                onClick={handleTakePhoto}
                disabled={isStarting}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active-scale disabled:opacity-40"
                aria-label="Capturar foto"
              >
                <div className="w-16 h-16 rounded-full bg-white" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNativeCamera();
                }}
                className="flex flex-col items-center gap-1 text-white/80 hover:text-white active-scale px-3 py-1"
              >
                <Camera size={24} />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Nativa
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveCameraModal;
