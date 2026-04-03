import React from 'react';

interface LoadingOverlayProps {
  message: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => (
  <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col justify-center items-center z-[60] text-white">
    <div className="w-12 h-12 border-4 border-t-transparent border-white rounded-full animate-spin mb-4"></div>
    <p className="text-lg font-semibold">{message}</p>
  </div>
);

export default LoadingOverlay;
