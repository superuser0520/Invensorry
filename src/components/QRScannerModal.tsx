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

        // Request highest resolution camera
        const config = { 
          fps: 10, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdgePercentage = 0.7; // 70% of the smallest edge
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
            return {
              width: qrboxSize,
              height: qrboxSize
            };
          },
          aspectRatio: 1.0 
        };

        html5QrCode.start(
          { 
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }, // Force rear camera with high resolution
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
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex flex-col z-50">
      <div className="flex items-center justify-between p-4 text-white z-10">
        <h2 className="text-lg font-bold uppercase tracking-widest flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Scan Barcode
        </h2>
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        <div className="w-full max-w-md bg-black rounded-lg overflow-hidden relative shadow-2xl border border-white/10 flex items-center justify-center min-h-[300px]">
          {error ? (
            <div className="p-8 text-center text-rose-400">
              <p>{error}</p>
            </div>
          ) : (
            <div id="qr-reader" className="w-full"></div>
          )}
        </div>
        <p className="text-white/50 mt-8 text-sm uppercase tracking-widest text-center">
          Align QR code within the frame<br/>
          <span className="text-xs opacity-70 normal-case mt-2 block">Using device rear camera</span>
        </p>
      </div>
    </div>
  );
}
