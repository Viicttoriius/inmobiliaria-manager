import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, X, AlertCircle } from 'lucide-react';

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
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 border border-blue-500 z-50 max-w-sm animate-fade-in-up">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-500" />
          Actualización Disponible
        </h3>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {updateStatus === 'available' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Nueva versión {updateInfo?.version} disponible.
          </p>
          <button 
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            Descargar Actualización
          </button>
        </div>
      )}

      {updateStatus === 'downloading' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Descargando... {progress}%
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {updateStatus === 'downloaded' && (
        <div className="space-y-3">
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">
            ¡Descarga completada!
          </p>
          <p className="text-xs text-gray-500">
            Reinicia la aplicación para aplicar los cambios.
          </p>
          <button 
            onClick={handleRestart}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reiniciar e Instalar
          </button>
        </div>
      )}

      {updateStatus === 'error' && (
        <div className="space-y-3">
           <div className="flex items-center gap-2 text-red-500 text-sm">
             <AlertCircle className="w-4 h-4" />
             <p>Error en la actualización</p>
           </div>
           <p className="text-xs text-gray-500 break-words">{error}</p>
        </div>
      )}
    </div>
  );
};

export default UpdateNotification;
