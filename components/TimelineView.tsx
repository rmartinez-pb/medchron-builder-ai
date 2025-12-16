import React, { useMemo, useState } from 'react';
import { TimelineEvent, EntityCategory } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TimelineViewProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
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

export const TimelineView: React.FC<TimelineViewProps> = ({ events, onEventClick }) => {
  const [filter, setFilter] = useState<EntityCategory | 'ALL'>('ALL');
  const [showJson, setShowJson] = useState(false);

  // Sort events by date
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (filter === 'ALL') return sortedEvents;
    return sortedEvents.filter(e => e.category === filter);
  }, [sortedEvents, filter]);

  // Prepare chart data (events per category)
  const chartData = useMemo(() => {
    const counts = events.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.values(EntityCategory).map(cat => ({
      name: cat,
      count: counts[cat] || 0,
      color: categoryColors[cat]
    })).filter(d => d.count > 0);
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p>Upload and process documents to generate a chronology.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Controls Header */}
      <div className="flex justify-between items-center mb-2">
         <h3 className="text-sm font-semibold text-slate-700">Timeline Visualization</h3>
         <div className="flex space-x-2">
            <button 
              onClick={() => setShowJson(!showJson)}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-md transition-colors flex items-center border border-slate-200"
            >
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              {showJson ? 'View Timeline' : 'View Extracted JSON'}
            </button>
         </div>
      </div>

      {showJson ? (
        <div className="flex-1 overflow-auto bg-slate-900 rounded-lg p-4 shadow-inner">
          <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
            {JSON.stringify(events, null, 2)}
          </pre>
        </div>
      ) : (
        <>
          {/* Stats / Chart */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-none">
             <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                     <XAxis type="number" hide />
                     <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                     <Tooltip cursor={{fill: 'transparent'}} />
                     <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                     </Bar>
                  </BarChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Filters */}
          <div className="flex space-x-2 overflow-x-auto pb-2 flex-none">
            <button 
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border hover:bg-slate-50'}`}
            >
              All
            </button>
            {Object.values(EntityCategory).map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                  filter === cat 
                    ? 'text-white border-transparent' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                style={{ backgroundColor: filter === cat ? categoryColors[cat] : undefined }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {filteredEvents.map((event) => (
              <div key={event.id} className="flex group relative pl-6 pb-6 border-l-2 border-slate-200 last:border-l-0 last:pb-0">
                {/* Dot */}
                <div 
                  className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10"
                  style={{ backgroundColor: categoryColors[event.category] }}
                />
                
                <div 
                  onClick={() => onEventClick && onEventClick(event)}
                  className={`flex-1 bg-white p-4 rounded-lg border border-slate-100 shadow-sm transition-all relative ${onEventClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300' : ''}`}
                >
                   <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{event.date} {event.time && `• ${event.time}`}</span>
                        <h4 className="text-md font-semibold text-slate-800 mt-1">{event.summary}</h4>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <span 
                          className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide"
                        >
                          {event.category}
                        </span>
                        {event.pageNumber && (
                           <span className="text-[10px] text-blue-500 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                             Pg {event.pageNumber}
                           </span>
                        )}
                      </div>
                   </div>
                   <p className="text-sm text-slate-600 mb-3 leading-relaxed">{event.details}</p>
                   
                   {/* UMLS Tags */}
                   {event.umlsEntities && event.umlsEntities.length > 0 && (
                     <div className="flex flex-wrap gap-1 mb-3">
                        {event.umlsEntities.map((entity, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">
                            {entity}
                          </span>
                        ))}
                     </div>
                   )}

                   <div className="flex items-center justify-between mt-2">
                     <div className="flex items-center text-xs text-slate-400 bg-slate-50 p-1.5 rounded">
                       <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                       </svg>
                       {event.sourceDocumentName}
                     </div>
                     {onEventClick && (
                       <div className="text-xs text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                         View Source &rarr;
                       </div>
                     )}
                   </div>
                </div>
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-8">No events found for this category.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};