import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export function QRScannerModal({ isOpen, onClose, onScanSuccess }: QRScannerModalProps) {
  const [error, setError] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError('');
      const timer = setTimeout(() => {
        const html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 20, // Higher FPS for smoother scanning
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            html5QrCode.stop().then(() => {
              onScanSuccess(decodedText);
              onClose();
            }).catch(console.error);
          },
          (errorMessage) => {
            // ignore continuous scanning errors
          }
        ).catch(err => {
          console.error(err);
          setError('Could not access camera. Please ensure permissions are granted.');
        });
      }, 100);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current && scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(console.error);
        }
      };
    }
  }, [isOpen, onScanSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between text-white z-20 bg-gradient-to-b from-black/80 to-transparent pt-safe">
        <h2 className="text-lg font-bold uppercase tracking-widest flex items-center gap-2 drop-shadow-md">
          <Camera className="w-5 h-5" />
          Scan Barcode
        </h2>
        <button onClick={onClose} className="p-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 transition-colors border border-white/20">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Scanner Container */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-rose-400 z-20 bg-black/80 rounded-lg mx-4">
            <p>{error}</p>
          </div>
        ) : (
          <>
            {/* The video container */}
            <div 
              id="qr-reader" 
              className="absolute inset-0 w-full h-full [&>div]:!w-full [&>div]:!h-full [&>div]:!border-none [&_video]:!object-cover [&_video]:!w-full [&_video]:!h-full"
            ></div>
            
            {/* Custom Targeting Box Overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-[#0055A4]/50 rounded-lg relative shadow-[0_0_0_4000px_rgba(0,0,0,0.6)]">
                {/* Corner markers - Shimano Blue */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#0055A4] rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#0055A4] rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#0055A4] rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#0055A4] rounded-br-lg"></div>
                
                {/* Scanning animation line */}
                <div className="absolute top-0 left-0 w-full h-0.5 bg-[#0055A4] shadow-[0_0_8px_2px_rgba(0,85,164,0.5)] animate-scan"></div>
              </div>
            </div>
          </>
        )}
        
        {/* Footer Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-8 text-center z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pb-safe">
          <p className="text-white/80 text-[10px] font-black uppercase tracking-widest mb-2">Align barcode within the frame</p>
          <p className="text-[#0055A4] text-xs font-mono font-bold">SYSTEM READY</p>
        </div>
      </div>
    </div>
  );
}
