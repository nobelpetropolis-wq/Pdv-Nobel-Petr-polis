import React, { useEffect, useRef } from 'react';
import { CloseIcon } from './Icons';

declare const Html5Qrcode: any;

interface BarcodeScannerModalProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
}

const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ onScan, onClose, title = "Aponte a câmera para o código" }) => {
    const scannerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!scannerRef.current) return;

        const html5QrCode = new Html5Qrcode(scannerRef.current.id);
        const qrCodeSuccessCallback = (decodedText: string, decodedResult: any) => {
            onScan(decodedText);
        };
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback, undefined)
          .catch((err: any) => {
            console.error("Falha ao iniciar o leitor de QR code", err);
            onClose();
          });

        return () => {
          html5QrCode.stop().catch((err: any) => console.error("Falha ao parar o scanner na limpeza.", err));
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col justify-center items-center z-[70]">
            <div className="relative w-full max-w-md bg-slate-800 rounded-lg p-4 shadow-xl">
                 <h3 className="text-center text-lg font-semibold mb-4 text-white">{title}</h3>
                 <div id="qr-reader" ref={scannerRef} className="w-full rounded-md overflow-hidden"></div>
                 <button onClick={onClose} className="absolute top-2 right-2 text-slate-400 hover:text-white transition-colors bg-slate-900/50 rounded-full p-1">
                     <CloseIcon className="w-6 h-6" />
                 </button>
            </div>
            <button onClick={onClose} className="mt-6 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                Cancelar
            </button>
        </div>
    );
};

export default BarcodeScannerModal;