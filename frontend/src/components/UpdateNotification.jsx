import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, X, AlertCircle, CheckCircle } from 'lucide-react';

const UpdateNotification = () => {
  const [updateStatus, setUpdateStatus] = useState(null); // 'available', 'downloading', 'downloaded', 'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onUpdateStatus((data) => {
        console.log('Update Status:', data);
        
        switch (data.status) {
          case 'available':
            setUpdateStatus('available');
            setUpdateInfo(data.info);
            setIsVisible(true);
            break;
          case 'progress':
            setUpdateStatus('downloading');
            setProgress(Math.round(data.progress.percent));
            setIsVisible(true);
            break;
          case 'downloaded':
            setUpdateStatus('downloaded');
            setUpdateInfo(data.info);
            setIsVisible(true);
            break;
          case 'error':
            setUpdateStatus('error');
            setError(data.error);
            setIsVisible(true);
            break;
          default:
            break;
        }
      });
    }
  }, []);

  const handleDownload = () => {
    if (window.electronAPI) {
      window.electronAPI.downloadUpdate();
    }
  };

  const handleRestart = () => {
    if (window.electronAPI) {
      window.electronAPI.quitAndInstall();
    }
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 bg-white dark:bg-gray-800 shadow-2xl rounded-xl p-6 border border-gray-100 dark:border-gray-700 z-50 max-w-sm w-full animate-fade-in-up transition-all duration-300 transform hover:scale-105">
      <div className="flex justify-between items-start mb-4">
        <h3 className="font-bold text-lg flex items-center gap-3 text-gray-800 dark:text-white">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
            <RefreshCw className={`w-5 h-5 text-blue-600 dark:text-blue-400 ${updateStatus === 'downloading' ? 'animate-spin' : ''}`} />
          </div>
          Actualización
        </h3>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      {updateStatus === 'available' && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
            <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">
              Nueva versión <span className="font-bold text-blue-600 dark:text-blue-400">{updateInfo?.version}</span> disponible.
            </p>
          </div>
          <button 
            onClick={handleDownload}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <Download className="w-4 h-4" />
            Descargar ahora
          </button>
        </div>
      )}

      {updateStatus === 'downloading' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm font-medium mb-1">
             <span className="text-gray-600 dark:text-gray-400">Descargando...</span>
             <span className="text-blue-600 dark:text-blue-400 font-bold">{progress}%</span>
          </div>
          
          <div className="relative w-full bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden shadow-inner border border-gray-200 dark:border-gray-600">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out" 
              style={{ width: `${progress}%` }}
            >
                <div className="absolute top-0 left-0 w-full h-full bg-white opacity-20 animate-pulse"></div>
            </div>
          </div>
          
          <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
            Por favor, espera mientras se descarga la actualización.
          </p>
        </div>
      )}

      {updateStatus === 'downloaded' && (
        <div className="space-y-4">
          <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg border border-green-100 dark:border-green-800 flex items-start gap-3">
             <div className="bg-green-100 dark:bg-green-800 rounded-full p-1 flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
             </div>
             <div>
                <p className="text-sm text-green-800 dark:text-green-300 font-bold">
                    ¡Descarga completada!
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                    Listo para instalar.
                </p>
             </div>
          </div>

          <button 
            onClick={handleRestart}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            Reiniciar e Instalar
          </button>
        </div>
      )}

      {updateStatus === 'error' && (
        <div className="space-y-4">
           <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg border border-red-100 dark:border-red-800 flex items-start gap-3">
             <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
             <div>
                <p className="text-sm font-bold text-red-800 dark:text-red-300">Error en la actualización</p>
                <p className="text-xs text-red-700 dark:text-red-400 break-words mt-1">{error}</p>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UpdateNotification;
