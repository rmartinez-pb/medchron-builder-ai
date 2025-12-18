import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Uploader } from './components/Uploader';
import { TimelineView } from './components/TimelineView';
import { Spinner } from './components/Spinner';
import { ProcessedDocument, ProcessingStatus, TimelineEvent, MedicalFact, ViewerItem, MedicalCase } from './types';
import { generateDocumentProse, extractEntitiesFromProse } from './services/geminiService';
import { exportChronologyToDocx } from './services/docxService';

const CONCURRENCY_LIMIT = 2;
const STORAGE_KEY = 'medchrons_v1_cases';

const App: React.FC = () => {
  // State for all cases persisted in LocalStorage
  const [cases, setCases] = useState<MedicalCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Viewer State (Session only, depends on File objects)
  const [viewingItem, setViewingItem] = useState<ViewerItem | null>(null);
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);

  // 1. Initial Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: MedicalCase[] = JSON.parse(saved);
        // Revive Date objects
        const revived = parsed.map(c => ({
          ...c,
          createdAt: new Date(c.createdAt),
          documents: c.documents.map(d => ({
            ...d,
            uploadDate: new Date(d.uploadDate)
          }))
        }));
        setCases(revived);
      } catch (e) {
        console.error("Failed to load cases", e);
      }
    }
  }, []);

  // 2. Persistence to LocalStorage (efficiently stripping non-serializable File objects)
  useEffect(() => {
    const storageData = cases.map(c => ({
      ...c,
      documents: c.documents.map(({ rawFile, ...rest }) => rest)
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
  }, [cases]);

  // Derive Active Data
  const activeCase = useMemo(() => 
    cases.find(c => c.id === activeCaseId) || null
  , [cases, activeCaseId]);

  const activeCaseEvents: TimelineEvent[] = useMemo(() => {
    if (!activeCase) return [];
    return activeCase.documents
      .filter(d => d.status === ProcessingStatus.COMPLETED && d.entities)
      .flatMap(d => 
        (d.entities || []).map(e => ({
          ...e,
          sourceDocumentId: d.id,
          sourceDocumentName: d.name,
          id: uuidv4()
        }))
      );
  }, [activeCase]);

  // Queue Processing Loop
  useEffect(() => {
    if (!activeCaseId) return;
    const currentCase = cases.find(c => c.id === activeCaseId);
    if (!currentCase) return;

    const processingCount = currentCase.documents.filter(d => 
      d.status === ProcessingStatus.GENERATING_PROSE || 
      d.status === ProcessingStatus.EXTRACTING_ENTITIES
    ).length;

    if (processingCount < CONCURRENCY_LIMIT) {
      const nextDoc = currentCase.documents.find(d => d.status === ProcessingStatus.QUEUED);
      if (nextDoc && nextDoc.rawFile) {
        processDocument(activeCaseId, nextDoc.id, nextDoc.rawFile);
      }
    }
  }, [cases, activeCaseId]);

  const processDocument = async (caseId: string, docId: string, file: File) => {
    const updateDoc = (status: ProcessingStatus, updates: Partial<ProcessedDocument> = {}) => {
      setCases(prev => prev.map(c => {
        if (c.id !== caseId) return c;
        return {
          ...c,
          documents: c.documents.map(d => d.id === docId ? { ...d, status, ...updates } : d)
        };
      }));
    };

    try {
      updateDoc(ProcessingStatus.GENERATING_PROSE);
      const prose = await generateDocumentProse(file);
      
      updateDoc(ProcessingStatus.EXTRACTING_ENTITIES, { proseDescription: prose });
      const entities = await extractEntitiesFromProse(prose);

      updateDoc(ProcessingStatus.COMPLETED, { entities });
    } catch (err) {
      console.error(err);
      updateDoc(ProcessingStatus.ERROR, { error: "Processing failed." });
    }
  };

  const handleCreateCase = () => {
    const name = window.prompt("Case Name (e.g., Client Name - Matter #):");
    if (!name) return;
    
    const newCase: MedicalCase = {
      id: uuidv4(),
      name,
      createdAt: new Date(),
      documents: []
    };
    setCases(prev => [newCase, ...prev]);
    setActiveCaseId(newCase.id);
  };

  const handleFilesSelected = useCallback((files: File[]) => {
    if (!activeCaseId) return;

    const newDocs: ProcessedDocument[] = files.map(file => ({
      id: uuidv4(),
      name: file.name,
      type: file.type,
      size: file.size,
      uploadDate: new Date(),
      status: ProcessingStatus.QUEUED,
      rawFile: file
    }));

    setCases(prev => prev.map(c => 
      c.id === activeCaseId ? { ...c, documents: [...c.documents, ...newDocs] } : c
    ));
  }, [activeCaseId]);

  const handleDeleteCase = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Delete this case and all extracted chronology data?")) {
      setCases(prev => prev.filter(c => c.id !== id));
      if (activeCaseId === id) setActiveCaseId(null);
    }
  };

  const handleFactClick = (fact: MedicalFact, parentEvent: TimelineEvent) => {
    if (!activeCase) return;
    const sourceDoc = activeCase.documents.find(d => d.id === parentEvent.sourceDocumentId);
    
    // Check if we have the file in current session
    if (sourceDoc && sourceDoc.rawFile) {
      if (viewingDocUrl) URL.revokeObjectURL(viewingDocUrl);
      setViewingDocUrl(URL.createObjectURL(sourceDoc.rawFile));
      setViewingItem({
        date: parentEvent.date,
        summary: fact.detail,
        category: fact.category,
        sourceDocumentId: parentEvent.sourceDocumentId,
        sourceDocumentName: parentEvent.sourceDocumentName,
        pageNumber: fact.pageNumber,
        quote: fact.quote
      });
    } else {
      alert("Source file is not in browser memory. To use the viewer, please re-upload the file to this case.");
    }
  };

  const handleExport = async () => {
    const selectedDoc = activeCase?.documents.find(d => d.id === selectedDocId);
    const eventsToExport = selectedDoc && selectedDoc.entities 
      ? selectedDoc.entities.map(e => ({...e, sourceDocumentId: selectedDoc.id, sourceDocumentName: selectedDoc.name, id: uuidv4()}))
      : activeCaseEvents;

    if (eventsToExport.length === 0) return;
    
    setIsExporting(true);
    try {
      const title = selectedDoc ? `Chronology: ${selectedDoc.name}` : `Master Chronology: ${activeCase?.name}`;
      await exportChronologyToDocx(eventsToExport, title);
    } catch (e) {
      alert("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const selectedDocument = activeCase?.documents.find(d => d.id === selectedDocId);

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-20 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center space-x-3">
          <div className="w-10 h-10 bg-medical-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">MedChrons</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {!activeCaseId ? (
            <div className="space-y-4">
              <button 
                onClick={handleCreateCase}
                className="w-full flex items-center justify-center space-x-2 bg-medical-600 hover:bg-medical-700 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span>New Case</span>
              </button>

              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Case History</h3>
              {cases.map(c => (
                <div 
                  key={c.id}
                  onClick={() => setActiveCaseId(c.id)}
                  className="group p-4 bg-white border border-slate-200 rounded-xl hover:border-medical-300 hover:bg-medical-50/50 transition-all cursor-pointer shadow-sm relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-medical-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-sm font-bold text-slate-800 truncate" title={c.name}>{c.name}</div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        {c.documents.length} Files
                      </div>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteCase(e, c.id)}
                      className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              {cases.length === 0 && (
                <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm text-slate-400">No cases yet. Create your first medical chronology case.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <button 
                onClick={() => { setActiveCaseId(null); setSelectedDocId(null); }}
                className="flex items-center text-xs font-bold text-medical-600 hover:bg-medical-50 px-2 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                All Cases
              </button>

              <div className="px-1">
                <h2 className="text-lg font-bold text-slate-800 leading-tight mb-4">{activeCase.name}</h2>
                <Uploader onFilesSelected={handleFilesSelected} />
              </div>

              <div className="space-y-2 mt-6">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Case Documents</h3>
                {activeCase.documents.map(doc => (
                  <div 
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id === selectedDocId ? null : doc.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                      selectedDocId === doc.id 
                        ? 'bg-medical-50 border-medical-500 shadow-sm' 
                        : 'bg-white border-slate-200 hover:border-medical-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-slate-700 truncate w-40" title={doc.name}>{doc.name}</span>
                      <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                        doc.status === ProcessingStatus.COMPLETED ? 'bg-green-50 text-green-600 border-green-100' :
                        doc.status === ProcessingStatus.ERROR ? 'bg-red-50 text-red-600 border-red-100' :
                        'bg-blue-50 text-blue-600 border-blue-100 animate-pulse'
                      }`}>
                        {doc.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {activeCase ? (
          <>
            <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-10">
              <div className="min-w-0 flex items-center space-x-4">
                {selectedDocId && (
                  <button 
                    onClick={() => setSelectedDocId(null)}
                    className="p-2 bg-slate-50 hover:bg-medical-50 border border-slate-200 hover:border-medical-200 rounded-lg text-medical-600 transition-all shadow-sm group active:scale-95"
                    title="Return to Master Chronology"
                  >
                    <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <div className="min-w-0">
                  <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    <span>Case View</span>
                    <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    <span className="text-medical-600">{selectedDocId ? 'Single Document' : 'Master Chronology'}</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-800 truncate">
                    {selectedDocument ? selectedDocument.name : activeCase.name}
                  </h2>
                </div>
              </div>

              <div className="flex items-center space-x-6">
                {!selectedDocId && activeCase.documents.length > 0 && (
                   <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 bg-medical-50 border border-medical-100 rounded-lg">
                      <svg className="w-4 h-4 text-medical-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      <span className="text-xs font-bold text-medical-700">Combined View</span>
                   </div>
                )}
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold text-slate-700">
                    {selectedDocument 
                      ? `${(selectedDocument.entities || []).reduce((acc, e) => acc + e.facts.length, 0)} Facts` 
                      : `${activeCaseEvents.reduce((acc, e) => acc + e.facts.length, 0)} Combined Facts`
                    }
                  </div>
                  <div className="text-[10px] text-slate-400">Total Extracted Events</div>
                </div>
                <button 
                  onClick={handleExport}
                  disabled={isExporting || activeCaseEvents.length === 0}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center space-x-2 transition-all shadow-lg active:scale-95 disabled:opacity-30"
                >
                  {isExporting ? <Spinner className="w-4 h-4" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                  <span>{isExporting ? 'Exporting...' : 'Export Chronology'}</span>
                </button>
              </div>
            </header>

            <div className="flex-1 p-8 overflow-hidden bg-slate-50 relative">
              <div className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="flex-1 p-6 overflow-hidden">
                  <TimelineView 
                    events={selectedDocument 
                      ? (selectedDocument.entities || []).map(e => ({...e, sourceDocumentId: selectedDocument.id, sourceDocumentName: selectedDocument.name, id: uuidv4()}))
                      : activeCaseEvents
                    } 
                    onFactClick={handleFactClick}
                    prose={selectedDocument ? selectedDocument.proseDescription : undefined}
                  />
                </div>
              </div>

              {/* Viewer Side Panel */}
              {viewingItem && viewingDocUrl && (
                <div className="absolute inset-y-0 right-0 w-[45%] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-in slide-in-from-right duration-300">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-md sticky top-0">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-medical-100 text-medical-700 uppercase">{viewingItem.category}</span>
                        <span className="text-[10px] font-bold text-slate-400">{viewingItem.date}</span>
                      </div>
                      <button onClick={() => { setViewingItem(null); setViewingDocUrl(null); }} className="text-slate-400 hover:text-slate-900 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg leading-tight mb-2">{viewingItem.summary}</h3>
                    <div className="text-[10px] font-medium text-slate-500 flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      {viewingItem.sourceDocumentName} {viewingItem.pageNumber && `• Page ${viewingItem.pageNumber}`}
                    </div>
                  </div>
                  <div className="flex-1 bg-slate-100 overflow-hidden">
                    <iframe src={viewingDocUrl} className="w-full h-full border-none" title="Doc Preview" />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-32 h-32 bg-medical-50 rounded-full flex items-center justify-center mb-8 border border-medical-100 shadow-inner">
              <svg className="w-16 h-16 text-medical-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">Select a Medical Case</h2>
            <p className="max-w-md text-slate-500 text-lg leading-relaxed">
              Open an existing case or create a new one to begin processing medical records into structured chronologies.
            </p>
            <button 
              onClick={handleCreateCase}
              className="mt-8 bg-medical-600 hover:bg-medical-700 text-white px-8 py-3 rounded-2xl font-bold shadow-lg transition-all active:scale-95"
            >
              Start New Case
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;