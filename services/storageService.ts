
import LZString from 'lz-string';
import { MedicalCase } from '../types';

const DB_NAME = 'MedChronsStorage';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const STORE_DATA = 'metadata';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES);
      }
      if (!db.objectStoreNames.contains(STORE_DATA)) {
        db.createObjectStore(STORE_DATA);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const storageService = {
  /**
   * Saves the entire cases array.
   * Compresses the JSON string before storing.
   */
  saveCases: async (cases: MedicalCase[]) => {
    const db = await getDB();
    // Strip rawFile before saving JSON to keep the JSON store lightweight
    const serializableData = cases.map(c => ({
      ...c,
      documents: c.documents.map(({ rawFile, ...rest }) => rest)
    }));
    
    const jsonString = JSON.stringify(serializableData);
    const compressed = LZString.compressToUTF16(jsonString);
    
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DATA, 'readwrite');
      const store = tx.objectStore(STORE_DATA);
      store.put(compressed, 'cases_list');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Loads and decompresses the cases array.
   */
  loadCases: async (): Promise<MedicalCase[]> => {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_DATA, 'readonly');
      const store = tx.objectStore(STORE_DATA);
      const request = store.get('cases_list');
      
      request.onsuccess = () => {
        const compressed = request.result;
        if (!compressed) return resolve([]);
        
        try {
          const jsonString = LZString.decompressFromUTF16(compressed);
          if (!jsonString) return resolve([]);
          
          const parsed: MedicalCase[] = JSON.parse(jsonString);
          // Revive Dates
          const revived = parsed.map(c => ({
            ...c,
            createdAt: new Date(c.createdAt),
            documents: c.documents.map(d => ({
              ...d,
              uploadDate: new Date(d.uploadDate)
            }))
          }));
          resolve(revived);
        } catch (e) {
          console.error("Decompression/Parse failed", e);
          resolve([]);
        }
      };
      request.onerror = () => resolve([]);
    });
  },

  /**
   * Saves a binary file (PDF/Image) to IndexedDB.
   */
  saveFile: async (id: string, file: File) => {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      tx.objectStore(STORE_FILES).put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieves a binary file from IndexedDB.
   */
  getFile: async (id: string): Promise<File | null> => {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const request = tx.objectStore(STORE_FILES).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  },

  /**
   * Deletes a file from the database.
   */
  deleteFile: async (id: string) => {
    const db = await getDB();
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).delete(id);
  }
};
