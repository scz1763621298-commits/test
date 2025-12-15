import React, { useState, useRef, useEffect } from 'react';
import { Experience } from './components/Experience';
import { AppMode } from './types';

// --- IndexedDB Configuration ---
const DB_NAME = 'ChristmasMemoryDB';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

// Helper: Initialize/Open Database
const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
};

// Helper: Save File to Database
const saveFileToDB = async (file: File) => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ file, timestamp: Date.now() });
    } catch (err) {
        console.error("Failed to save image", err);
    }
};

// Helper: Load All Files from Database
const loadFilesFromDB = async (): Promise<File[]> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result;
                // Extract the File objects
                resolve(results.map((item: any) => item.file));
            };
        });
    } catch (err) {
        console.error("Failed to load images", err);
        return [];
    }
};

function App() {
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // 1. Load persisted images on mount
  useEffect(() => {
      loadFilesFromDB().then((files) => {
          if (files.length > 0) {
              const urls = files.map(file => URL.createObjectURL(file));
              setUploadedImages(urls);
          }
          setIsDbLoaded(true); // Mark DB interaction as done
      });
  }, []);

  // 2. Handle new uploads: Update State AND Save to DB
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const files = Array.from(event.target.files);
      
      // Create URLs for immediate display
      const newImages = files.map(file => URL.createObjectURL(file));
      setUploadedImages(prev => [...prev, ...newImages]);

      // Save to IndexedDB in background
      for (const file of files) {
          await saveFileToDB(file);
      }
    }
  };

  const handleCameraReady = (video: HTMLVideoElement) => {
    setCameraReady(true);
  };

  const handleError = (msg: string) => {
      setErrorMsg(msg);
  };

  // Only remove loading screen when Camera is ready AND DB has finished loading
  useEffect(() => {
      if (cameraReady && isDbLoaded) {
          setTimeout(() => setIsLoading(false), 1000);
      }
  }, [cameraReady, isDbLoaded]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-gold font-serif">
      {/* 3D Experience */}
      <Experience 
        uploadedImages={uploadedImages} 
        onCameraReady={handleCameraReady}
        onError={handleError}
      />

      {/* Loading Screen / Error Screen */}
      <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-1000 ${(!isLoading && !errorMsg) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        
        {errorMsg ? (
            <div className="text-center p-8 border border-red-500/50 rounded-lg bg-red-900/20 max-w-md">
                <div className="text-red-500 text-5xl mb-4">⚠️</div>
                <h2 className="text-xl text-red-500 mb-2 font-bold uppercase tracking-widest">Initialization Failed</h2>
                <p className="text-red-300 text-sm">{errorMsg}</p>
                <p className="text-gray-500 text-xs mt-4">If you are in a restricted network region, please ensure you have VPN enabled or download the 'hand_landmarker.task' file locally.</p>
                <button 
                    onClick={() => window.location.reload()}
                    className="mt-6 px-6 py-2 bg-red-800 hover:bg-red-700 text-white rounded uppercase text-xs tracking-widest transition-colors"
                >
                    Retry
                </button>
            </div>
        ) : (
            <>
                <div className="w-16 h-16 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h1 className="text-2xl text-yellow-500 tracking-widest uppercase">Loading Magic...</h1>
                {!cameraReady && <p className="text-gray-500 mt-2 text-sm">Waiting for Camera Access...</p>}
                {cameraReady && !isDbLoaded && <p className="text-gray-500 mt-2 text-sm">Restoring Memories...</p>}
            </>
        )}
      </div>

      {/* UI Overlay */}
      <div className={`absolute inset-0 z-40 pointer-events-none transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        
        {/* Upload Control - Hidden ONLY if images exist (either from DB or fresh upload) */}
        {uploadedImages.length === 0 && isDbLoaded && !errorMsg && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-auto">
              <label className="group relative cursor-pointer flex items-center justify-center px-8 py-3 overflow-hidden rounded-full bg-white/5 border border-yellow-500/30 backdrop-blur-md transition-all hover:bg-yellow-500/10 hover:border-yellow-500">
                  <span className="relative text-yellow-500 tracking-widest text-xs uppercase group-hover:text-yellow-300 transition-colors">
                      Add Memories (Batch Upload)
                  </span>
                  <input 
                      type="file" 
                      accept="image/*" 
                      multiple // ALLOWS BULK UPLOAD
                      className="hidden" 
                      onChange={handleFileUpload}
                  />
                  <div className="absolute inset-0 rounded-full border border-yellow-500 opacity-0 scale-110 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500"></div>
              </label>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;