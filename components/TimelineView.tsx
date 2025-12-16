import React, { useMemo, useState } from 'react';
import { TimelineEvent, EntityCategory, MedicalFact } from '../types';

interface TimelineViewProps {
  events: TimelineEvent[]; // These are now "Daily Entries"
  onFactClick?: (fact: MedicalFact, parentEvent: TimelineEvent) => void;
  prose?: string; // Optional prose to display
}

const categoryColors: Record<EntityCategory, string> = {
  [EntityCategory.DIAGNOSIS]: '#ef4444', // Red
  [EntityCategory.TREATMENT]: '#22c55e', // Green
  [EntityCategory.SYMPTOM]: '#f59e0b', // Amber
  [EntityCategory.LAB_RESULT]: '#3b82f6', // Blue
  [EntityCategory.MEDICATION]: '#8b5cf6', // Violet
  [EntityCategory.ADMINISTRATIVE]: '#94a3b8', // Slate
  [EntityCategory.OTHER]: '#64748b', // Slate
};

export const TimelineView: React.FC<TimelineViewProps> = ({ events, onFactClick, prose }) => {
  const [viewMode, setViewMode] = useState<'TIMELINE' | 'JSON' | 'PROSE'>('TIMELINE');

  // Sort events by date
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  if (events.length === 0 && !prose) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p>Upload and process documents to generate a chronology.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      
      {/* Controls Header */}
      <div className="flex justify-between items-center mb-2">
         <h3 className="text-sm font-semibold text-slate-700">Timeline Visualization</h3>
         <div className="flex space-x-2">
            <button 
              onClick={() => setViewMode(viewMode === 'PROSE' ? 'TIMELINE' : 'PROSE')}
              className={`text-xs px-3 py-1 rounded-md transition-colors flex items-center border ${
                viewMode === 'PROSE' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Prose Summary
            </button>
            <button 
              onClick={() => setViewMode(viewMode === 'JSON' ? 'TIMELINE' : 'JSON')}
              className={`text-xs px-3 py-1 rounded-md transition-colors flex items-center border ${
                viewMode === 'JSON' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              {viewMode === 'JSON' ? 'View Timeline' : 'View Extracted JSON'}
            </button>
         </div>
      </div>

      {viewMode === 'JSON' ? (
        <div className="flex-1 overflow-auto bg-slate-900 rounded-lg p-4 shadow-inner">
          <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
            {JSON.stringify(events, null, 2)}
          </pre>
        </div>
      ) : viewMode === 'PROSE' ? (
        <div className="flex-1 overflow-auto bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
           <div className="prose prose-sm max-w-none text-slate-700">
             <h4 className="text-lg font-semibold mb-4 text-slate-800">Document Prose Summary</h4>
             {prose ? (
               <div className="whitespace-pre-wrap">{prose}</div>
             ) : (
               <div className="text-slate-400 italic">No prose summary available for this selection.</div>
             )}
           </div>
        </div>
      ) : (
        <>
          {/* List of Daily Entries */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {sortedEvents.map((event) => (
              <div key={event.id} className="relative pl-6 border-l-2 border-slate-200 last:border-l-0 pb-2">
                
                {/* Date Header Indicator */}
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white bg-slate-400 shadow-sm z-10" />
                
                <div className="mb-4">
                  <span className="text-sm font-bold text-slate-600 uppercase tracking-wider bg-slate-100 px-2 py-1 rounded">
                    {event.date}
                  </span>
                </div>

                {/* Card for the Day/Encounter */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                   {/* Header Summary */}
                   <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                      <h4 className="text-md font-semibold text-slate-800">{event.summary}</h4>
                      <div className="text-xs text-slate-400 flex items-center">
                         <span className="mr-2">{event.sourceDocumentName}</span>
                         {event.umlsEntities && event.umlsEntities.length > 0 && (
                           <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">
                             {event.umlsEntities.length} Tags
                           </span>
                         )}
                      </div>
                   </div>
                   
                   {/* Facts List */}
                   <div className="p-4">
                      <ul className="space-y-3">
                        {event.facts.map((fact, idx) => (
                          <li key={idx} className="flex items-start group">
                             {/* Bullet Dot */}
                             <div 
                               className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0 mr-3" 
                               style={{ backgroundColor: categoryColors[fact.category] }}
                               title={fact.category}
                             />
                             
                             <div className="flex-1">
                                <div className="text-sm text-slate-700 leading-relaxed">
                                  {fact.time && <span className="font-mono text-xs text-slate-500 mr-2">[{fact.time}]</span>}
                                  {fact.detail}
                                </div>
                                <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wide border px-1 rounded">
                                    {fact.category}
                                  </span>
                                  {fact.pageNumber && (
                                    <button
                                      onClick={() => onFactClick && onFactClick(fact, event)}
                                      className="text-[10px] text-blue-600 font-medium hover:underline bg-blue-50 px-1.5 rounded flex items-center"
                                    >
                                      Ref: Page {fact.pageNumber}
                                      {fact.quote && (
                                        <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                      )}
                                    </button>
                                  )}
                                </div>
                             </div>
                          </li>
                        ))}
                      </ul>
                   </div>
                </div>

              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};