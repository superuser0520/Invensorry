import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export function QRScannerModal({ isOpen, onClose, onScanSuccess }: QRScannerModalProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const onScanSuccessRef = useRef(onScanSuccess);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
    onCloseRef.current = onClose;
  }, [onScanSuccess, onClose]);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the DOM element is ready
      const timer = setTimeout(() => {
        scannerRef.current = new Html5QrcodeScanner(
          "qr-reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false
        );
        
        scannerRef.current.render(
          (decodedText) => {
            if (scannerRef.current) {
              scannerRef.current.clear().then(() => {
                onScanSuccessRef.current(decodedText);
                onCloseRef.current();
              }).catch(console.error);
            }
          },
          (errorMessage) => {
            // Ignore parse errors as they happen continuously during scanning
          }
        );
      }, 100);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          scannerRef.current.clear().catch(console.error);
        }
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-md w-full p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-black uppercase tracking-widest text-slate-900 mb-4 text-center">Scan QR Code</h2>
        <div id="qr-reader" className="w-full overflow-hidden rounded-sm"></div>
      </div>
    </div>
  );
}
