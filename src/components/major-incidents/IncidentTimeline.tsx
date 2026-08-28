import React, { useState } from 'react';
import { Activity } from 'lucide-react';
import type { MajorIncidentRecord } from '../../types/app';

interface IncidentTimelineProps {
  incident: MajorIncidentRecord;
  onAddEntry: (miId: string, message: string) => void;
}

export default function IncidentTimeline({ incident, onAddEntry }: IncidentTimelineProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAddEntry(incident.id, text);
    setText('');
  };

  return (
    <div className="p-4 lg:p-6 overflow-y-auto flex flex-col min-h-0 bg-surface">
      <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-error" /> Emergency Milestone Timeline
        </h4>
        <span className="text-[10px] bg-error-light text-error-dark font-bold px-1.5 py-0.5 rounded">REAL-TIME TRACKING</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-1">
        {incident.timeline.length === 0 ? (
          <p className="text-xs text-text-muted italic text-center py-10">No milestones posted. Type below to create an entry.</p>
        ) : (
          incident.timeline.slice().reverse().map((entry) => (
            <div key={entry.id} className="relative pl-6 border-l-2 border-border text-xs">
              <div className="absolute -left-[6px] top-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface shadow" aria-hidden="true"></div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-text-primary">{entry.author}</span>
                <span className="text-overline bg-surface text-text-muted px-1 rounded uppercase tracking-wider font-bold">{entry.role}</span>
                <span className="text-overline text-text-muted ml-auto font-mono">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
              <p className="text-text-primary leading-relaxed bg-surface p-2 rounded border border-border font-medium">{entry.message}</p>
            </div>
          ))
        )}
      </div>
      <div className="pt-4 border-t border-border shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="timeline-input" className="sr-only">Add incident update</label>
          <input id="timeline-input" type="text" placeholder="Add incident update bulletin (e.g. restoration confirmed)..." value={text} onChange={(e) => setText(e.target.value)}
            className="flex-1 border border-border rounded p-2.5 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-medium" />
          <button type="submit" className="px-4 bg-accent hover:bg-accent-light text-[#fff] font-semibold text-xs rounded transition cursor-pointer shrink-0">Post Entry</button>
        </form>
      </div>
    </div>
  );
}
