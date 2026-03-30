import React, { useState, useEffect } from 'react';
import { X, Lock, Delete } from 'lucide-react';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminPinModal({ isOpen, onClose, onSuccess }: AdminPinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === '4334') {
        onSuccess();
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setPin(prev => (prev.length < 4 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
        setError(false);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePadClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-sm shadow-2xl max-w-sm w-full p-8 relative text-center">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-[#0055A4]" />
        </div>
        <h2 className="text-xl font-black uppercase tracking-widest text-slate-900 mb-2">Admin Access</h2>
        <p className="text-sm text-slate-500 mb-6">Enter PIN to switch to Admin role.</p>
        
        <div className="flex justify-center gap-3 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div 
              key={i} 
              className={`w-4 h-4 rounded-full border-2 transition-colors ${
                pin.length > i 
                  ? error ? 'bg-rose-500 border-rose-500' : 'bg-[#0055A4] border-[#0055A4]' 
                  : 'border-slate-300 bg-transparent'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handlePadClick(num.toString())}
              className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 text-xl font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors flex items-center justify-center mx-auto"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            onClick={() => handlePadClick('0')}
            className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 text-xl font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors flex items-center justify-center mx-auto"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 text-xl font-bold text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors flex items-center justify-center mx-auto"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
