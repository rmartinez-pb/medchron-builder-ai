import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Uploader } from './components/Uploader';
import { TimelineView } from './components/TimelineView';
import { Spinner } from './components/Spinner';
import { ProcessedDocument, ProcessingStatus, TimelineEvent } from './types';
import { generateDocumentProse, extractEntitiesFromProse } from './services/geminiService';
import { exportChronologyToDocx } from './services/docxService';

const CONCURRENCY_LIMIT = 2;

const App: React.FC = () => {
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Document Viewer State
  const [viewingEvent, setViewingEvent] = useState<TimelineEvent | null>(null);
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);

  // Derived state: All events from all completed documents
  const allEvents: TimelineEvent[] = useMemo(() => documents
    .filter(d => d.status === ProcessingStatus.COMPLETED && d.entities)
    .flatMap(d => 
      (d.entities || []).map(e => ({
        ...e,
        sourceDocumentId: d.id,
        sourceDocumentName: d.name,
        id: uuidv4()
      }))
    ), [documents]);

  // Queue Processing Effect
  useEffect(() => {
    const processingCount = documents.filter(d => 
      d.status === ProcessingStatus.GENERATING_PROSE || 
      d.status === ProcessingStatus.EXTRACTING_ENTITIES
    ).length;

    if (processingCount < CONCURRENCY_LIMIT) {
      const nextDoc = documents.find(d => d.status === ProcessingStatus.QUEUED);
      if (nextDoc && nextDoc.rawFile) {
        processDocument(nextDoc.id, nextDoc.rawFile);
      }
    }
  }, [documents]);

  // Clean up object URLs when viewing event changes
  useEffect(() => {
    return () => {
      if (viewingDocUrl) {
        URL.revokeObjectURL(viewingDocUrl);
      }
    };
  }, [viewingDocUrl]);

  const processDocument = async (docId: string, file: File) => {
    try {
      // Step 1: Generate Prose
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: ProcessingStatus.GENERATING_PROSE } : d));
      const prose = await generateDocumentProse(file);
      
      // Update with prose
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, proseDescription: prose, status: ProcessingStatus.EXTRACTING_ENTITIES } : d));

      // Step 2: Extract Entities
      const entities = await extractEntitiesFromProse(prose);

      // Complete
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, entities, status: ProcessingStatus.COMPLETED } : d));

    } catch (err) {
      console.error(err);
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: ProcessingStatus.ERROR, error: "Processing failed. Please try again." } : d));
    }
  };

  const handleFilesSelected = useCallback((files: File[]) => {
    const newDocs: ProcessedDocument[] = files.map(file => ({
      id: uuidv4(),
      name: file.name,
      type: file.type,
      size: file.size,
      uploadDate: new Date(),
      status: ProcessingStatus.QUEUED,
      rawFile: file
    }));

    setDocuments(prev => [...prev, ...newDocs]);
  }, []);

  const handleResetCase = () => {
    if (documents.length > 0 && !window.confirm("Start a new case? All current documents and extracted data will be removed.")) {
      return;
    }
    setDocuments([]);
    setSelectedDocId(null);
    setViewingEvent(null);
  };

  const handleDeleteDocument = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (window.confirm("Remove this document?")) {
      setDocuments(prev => prev.filter(d => d.id !== docId));
      if (selectedDocId === docId) {
        setSelectedDocId(null);
      }
    }
  };

  const handleEventClick = (event: TimelineEvent) => {
    // Find the original document file
    const sourceDoc = documents.find(d => d.id === event.sourceDocumentId);
    if (sourceDoc && sourceDoc.rawFile) {
      if (viewingDocUrl) URL.revokeObjectURL(viewingDocUrl);
      const url = URL.createObjectURL(sourceDoc.rawFile);
      setViewingDocUrl(url);
      setViewingEvent(event);
    }
  };

  const closeViewer = () => {
    setViewingEvent(null);
    if (viewingDocUrl) {
      URL.revokeObjectURL(viewingDocUrl);
      setViewingDocUrl(null);
    }
  };

  const handleExport = async () => {
    if (allEvents.length === 0) return;
    setIsExporting(true);
    try {
      const exportEvents = selectedDocument && selectedDocument.entities 
        ? selectedDocument.entities.map(e => ({...e, sourceDocumentId: selectedDocument.id, sourceDocumentName: selectedDocument.name, id: uuidv4()}))
        : allEvents;
      
      const title = selectedDocument ? `Chronology: ${selectedDocument.name}` : 'Master Medical Chronology';
      
      await exportChronologyToDocx(exportEvents, title);
    } catch (error) {
      console.error("Export failed", error);
      alert("Failed to export document.");
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusColor = (status: ProcessingStatus) => {
    switch (status) {
      case ProcessingStatus.COMPLETED: return 'text-green-600 bg-green-50 border-green-100';
      case ProcessingStatus.ERROR: return 'text-red-600 bg-red-50 border-red-100';
      case ProcessingStatus.QUEUED: return 'text-slate-500 bg-slate-50 border-slate-100 border-dashed';
      case ProcessingStatus.IDLE: return 'text-slate-500 bg-slate-50 border-slate-100';
      default: return 'text-blue-600 bg-blue-50 border-blue-100';
    }
  };

  const getStatusLabel = (status: ProcessingStatus) => {
    switch (status) {
      case ProcessingStatus.QUEUED: return 'Queued';
      case ProcessingStatus.UPLOADING: return 'Queueing...';
      case ProcessingStatus.GENERATING_PROSE: return 'Analyzing...';
      case ProcessingStatus.EXTRACTING_ENTITIES: return 'Extracting...';
      case ProcessingStatus.COMPLETED: return 'Processed';
      case ProcessingStatus.ERROR: return 'Failed';
      default: return 'Pending';
    }
  };

  const selectedDocument = documents.find(d => d.id === selectedDocId);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-lg z-10 shrink-0">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-medical-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              M
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">MedChrons Builder</h1>
              {/* <span className="text-[10px] text-slate-400 font-medium">AI Case Builder</span> */}
            </div>
          </div>
          {documents.length > 0 && (
            <button 
              onClick={handleResetCase}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              title="Start New Case"
            >
              New Case
            </button>
          )}
        </div>

        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <Uploader onFilesSelected={handleFilesSelected} />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mt-2 mb-1 flex justify-between items-center">
            <span>Case Documents</span>
            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px]">{documents.length}</span>
          </h3>
          {documents.map(doc => (
            <div 
              key={doc.id}
              onClick={() => setSelectedDocId(doc.id === selectedDocId ? null : doc.id)}
              className={`group relative p-3 rounded-lg border transition-all cursor-pointer ${
                selectedDocId === doc.id 
                  ? 'bg-medical-50 border-medical-500 shadow-sm' 
                  : 'bg-white border-slate-200 hover:border-medical-200'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-medium text-slate-700 truncate w-40" title={doc.name}>{doc.name}</span>
                <div className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStatusColor(doc.status)}`}>
                   {getStatusLabel(doc.status)}
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2">
                {(doc.status === ProcessingStatus.GENERATING_PROSE || doc.status === ProcessingStatus.EXTRACTING_ENTITIES) ? (
                  <div className="flex items-center text-xs text-blue-600">
                    <Spinner className="w-3 h-3 text-blue-600 mr-2" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400">
                    {doc.uploadDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                )}
                
                <button 
                  onClick={(e) => handleDeleteDocument(e, doc.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                  title="Remove document"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {documents.length === 0 && (
             <div className="text-center py-10 px-4">
                <p className="text-sm text-slate-400">No documents in this case.</p>
                <p className="text-xs text-slate-300 mt-1">Upload files to begin.</p>
             </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm z-10">
           <div className="flex items-center">
             <h2 className="text-lg font-semibold text-slate-800">
               {selectedDocument ? `Document: ${selectedDocument.name}` : 'Case Master Chronology'}
             </h2>
           </div>
           <div className="flex items-center space-x-4">
              <div className="text-sm text-slate-500">
                  {selectedDocument 
                    ? `${selectedDocument.entities?.length || 0} Events` 
                    : `${allEvents.length} Events Total`
                  }
              </div>
              {allEvents.length > 0 && (
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Spinner className="w-4 h-4 text-white" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Export .DOCX</span>
                    </>
                  )}
                </button>
              )}
           </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-6 relative">
           {selectedDocument ? (
             // Single Document Detail View
             <div className="h-full flex flex-col md:flex-row gap-6">
                {/* Prose Column */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 font-medium text-slate-700 flex justify-between items-center">
                    <span>AI Prose Summary</span>
                    <button onClick={() => setSelectedDocId(null)} className="text-xs text-blue-600 hover:underline">View Master Timeline</button>
                  </div>
                  <div className="p-6 overflow-y-auto leading-relaxed text-slate-700 text-sm">
                     {selectedDocument.proseDescription ? (
                       <div className="whitespace-pre-wrap prose prose-sm max-w-none">
                         {selectedDocument.proseDescription}
                       </div>
                     ) : (
                       <div className="flex items-center justify-center h-40 text-slate-400 italic">
                         {selectedDocument.status === ProcessingStatus.ERROR ? 'Analysis failed.' : 'Analysis pending...'}
                       </div>
                     )}
                  </div>
                </div>
                
                {/* Extracted Entities for this Doc */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                   <div className="p-4 border-b border-slate-100 bg-slate-50 font-medium text-slate-700">
                    Extracted Facts ({selectedDocument.entities?.length || 0})
                   </div>
                   <div className="flex-1 overflow-hidden p-4">
                      <TimelineView 
                        events={(selectedDocument.entities || []).map(e => ({...e, sourceDocumentId: selectedDocument.id, sourceDocumentName: selectedDocument.name, id: uuidv4()}))} 
                        onEventClick={handleEventClick}
                      />
                   </div>
                </div>
             </div>
           ) : (
             // Master Chronology View
             <div className="h-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 font-medium text-slate-700 flex justify-between">
                  <span>Master Timeline (Consolidated)</span>
                  <span className="text-xs font-normal text-slate-400">Events are sorted chronologically across all case documents</span>
                </div>
                <div className="flex-1 p-6 overflow-hidden">
                   <TimelineView events={allEvents} onEventClick={handleEventClick} />
                </div>
             </div>
           )}
        </div>

        {/* Document Viewer Side Panel */}
        {viewingEvent && viewingDocUrl && (
          <div className="absolute inset-y-0 right-0 w-1/2 bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-[slideIn_0.3s_ease-out]">
            {/* Panel Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                   <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">{viewingEvent.category}</span>
                   <span className="text-xs text-slate-500">{viewingEvent.date}</span>
                </div>
                <h3 className="font-semibold text-slate-800 text-lg leading-tight">{viewingEvent.summary}</h3>
                <div className="text-xs text-slate-500 mt-1 flex items-center">
                   <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                   {viewingEvent.sourceDocumentName} {viewingEvent.pageNumber && ` • Page ${viewingEvent.pageNumber}`}
                </div>
              </div>
              <button onClick={closeViewer} className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-200">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Verbatim Quote Section */}
            {viewingEvent.quote && (
              <div className="p-4 bg-yellow-50 border-b border-yellow-100">
                <p className="text-xs font-bold text-yellow-700 uppercase mb-1">Verbatim Quote</p>
                <p className="text-sm text-slate-700 italic border-l-4 border-yellow-300 pl-3 py-1">
                  "{viewingEvent.quote}"
                </p>
              </div>
            )}

            {/* Document Iframe */}
            <div className="flex-1 bg-slate-100 relative overflow-hidden">
               {viewingEvent.sourceDocumentName.toLowerCase().endsWith('.pdf') ? (
                 <iframe 
                   src={`${viewingDocUrl}#page=${viewingEvent.pageNumber || 1}`}
                   className="w-full h-full"
                   title="Document Viewer"
                 />
               ) : (
                 <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                   <img src={viewingDocUrl} alt="Evidence" className="max-w-full max-h-full shadow-lg rounded" />
                 </div>
               )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;