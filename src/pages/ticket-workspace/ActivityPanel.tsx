import React from "react";
import {
  AlertTriangle,
  TrendingUp,
  FileText,
  Plus,
} from "lucide-react";

import type { TicketRecord, FileEvidence } from "../../types/app";
import { TicketPriority } from "../../types/app";
import { useApp } from "../../context/AppContext";
import { formatCurrency } from "../../lib/utils";
import { syncEvidenceUpload } from "../../lib/sync";
import { compressFiles } from "../../lib/imageCompression";
import WatcherPanel from "./WatcherPanel";

interface ActivityPanelProps {
  activeTicket: TicketRecord;
  now: number;
  activeTicketEvidence: FileEvidence[];
  selectedWatcherIds: Set<string>;
  setSelectedWatcherIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  newWatcherEmail: string;
  setNewWatcherEmail: (v: string) => void;
  setNotifyWatcherModal: (v: { isOpen: boolean; watcherEmail: string | null }) => void;
  setRemoveWatcherConfirm: (v: string | null) => void;
}

export default function ActivityPanel({
  activeTicket, now, activeTicketEvidence,
  selectedWatcherIds, setSelectedWatcherIds, newWatcherEmail, setNewWatcherEmail,
  setNotifyWatcherModal, setRemoveWatcherConfirm,
}: ActivityPanelProps) {
  const {
    tickets, auditLogs, setEvidence, showToast,
  } = useApp();

  return (
    <div className="hidden lg:flex lg:w-80 border-l border-border bg-surface-elevated flex-col shrink-0 min-h-0">
      <div className="flex flex-col h-full w-80 bg-surface-elevated overflow-y-auto">

        {/* Intelligence Section */}
        <div className="hidden lg:block shrink-0 border-b border-border">
          <div className="px-4 py-3 border-b border-border bg-surface">
            <h3 className="text-caption font-heading font-bold text-accent flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Intelligence</h3>
          </div>
          <div className="p-4 space-y-3">
            {(() => {
              const days: number[] = Array.from({ length: 30 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (29 - i));
                const dayStr = d.toISOString().slice(0, 10);
                return tickets.filter(t => {
                  const catMatch = t.category.toLowerCase().includes("duplicate");
                  const descMatch = t.description?.toLowerCase().includes("duplicate");
                  return (catMatch || descMatch) && t.createdAt.slice(0, 10) === dayStr;
                }).length;
              });
              const maxVal = Math.max(...days, 1);
              return (
                <div className="bg-surface rounded-lg p-3">
                  <p className="text-[10px] font-heading font-bold text-text-secondary uppercase tracking-wider mb-2">Duplicate Frequency (30d)</p>
                  <svg viewBox="0 0 200 60" className="w-full h-auto">
                    <defs>
                      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B0000" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#8B0000" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {days.map((v, i) => {
                      const x = (i / 29) * 190 + 5;
                      const y = 55 - (v / maxVal) * 48;
                      return <circle key={i} cx={x} cy={y} r="2" fill="#8B0000" opacity={0.7} />;
                    })}
                    <path
                      d={"M " + days.map((v, i) => {
                        const x = (i / 29) * 190 + 5;
                        const y = 55 - (v / maxVal) * 48;
                        return `${i === 0 ? "M" : "L"}${x},${y}`;
                      }).join(" ")}
                      fill="none"
                      stroke="#8B0000"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={"M " + days.map((v, i) => {
                        const x = (i / 29) * 190 + 5;
                        const y = 55 - (v / maxVal) * 48;
                        return `${i === 0 ? "M" : "L"}${x},${y}`;
                      }).join(" ") + " L195 55 L5 55 Z"}
                      fill="url(#chartFill)"
                    />
                    <line x1="5" y1="20" x2="195" y2="20" stroke="#DC2626" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.6" />
                    <text x="148" y="18" fontSize="6" fill="#DC2626" fontWeight="600">threshold</text>
                  </svg>
                </div>
              );
            })()}

            {(() => {
              const isHighSeverity =
                activeTicket.priority === TicketPriority.CRITICAL ||
                activeTicket.priority === TicketPriority.HIGH;
              const slaBreached = new Date(activeTicket.slaDeadline).getTime() < now;
              const cat = activeTicket.category.toLowerCase();
              let classification = "Standard Dispute";
              let confidence = "\u2014";
              if (cat.includes("duplicate")) { classification = "Duplicate Transaction"; confidence = "High"; }
              else if (cat.includes("timeout") || cat.includes("failure")) { classification = "Gateway Timeout"; confidence = "High"; }
              else if (cat.includes("refund")) { classification = "Refund Delay"; confidence = "Medium"; }
              else if (cat.includes("settlement")) { classification = "Settlement Gap"; confidence = "Medium"; }
              else if (cat.includes("chargeback")) { classification = "Chargeback"; confidence = "High"; }

              return (
                <>
                  {slaBreached && (
                    <div className="bg-error/5 border border-error/15 rounded-lg p-3 animate-slide-in">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3 h-3 text-error" />
                        <span className="text-[10px] font-heading font-bold text-error uppercase tracking-wider">SLA Breached</span>
                      </div>
                      <p className="text-[10px] text-text-secondary leading-relaxed">Immediate manual reversal required. High exposure risk.</p>
                    </div>
                  )}
                  <div className="bg-accent/5 border border-accent/10 rounded-lg p-3">
                    <p className="text-[10px] font-heading font-bold text-accent uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Pattern Analysis
                    </p>
                    <p className="text-xs text-text-primary font-medium">{classification}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Confidence: <span className="font-bold text-accent">{confidence}</span></p>
                    {isHighSeverity && (
                      <p className="text-[10px] text-text-muted mt-1">
                        {activeTicket.priority} severity, {activeTicket.amount ? formatCurrency(activeTicket.amount) : "Undefined"} exposure.
                      </p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Watchers & Notifications Section */}
        <WatcherPanel
          activeTicket={activeTicket}
          selectedWatcherIds={selectedWatcherIds}
          setSelectedWatcherIds={setSelectedWatcherIds}
          newWatcherEmail={newWatcherEmail}
          setNewWatcherEmail={setNewWatcherEmail}
          setNotifyWatcherModal={setNotifyWatcherModal}
          setRemoveWatcherConfirm={setRemoveWatcherConfirm}
        />

        {/* Audit Section */}
        <div className="flex flex-col shrink-0 border-b border-border">
          <div className="border-b border-border flex items-center px-4 bg-surface shrink-0 h-9">
            <span className="text-caption font-heading font-bold text-text-primary flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-accent" /> Audit</span>
          </div>
          <div className="p-3 bg-surface space-y-2">
            <div className="space-y-2">
              {auditLogs.filter(a => a.ticketId === activeTicket.id).slice(0, 4).map((a) => (
                <div key={a.id} className="flex gap-2 px-1">
                  <div className="w-1 h-1 rounded-full bg-border mt-1.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-text-primary text-xs">{a.action.replace(/_/g, " ")}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">{a.details}</p>
                    <p className="text-[11px] text-text-muted font-mono mt-0.5">{new Date(a.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Evidence Section */}
        <div className="p-3 bg-surface border-t border-border shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-text-muted font-medium flex items-center gap-1"><FileText className="w-3 h-3" /> Evidence ({activeTicketEvidence.length})</p>
            <label className="cursor-pointer text-[10px] font-heading font-bold text-accent hover:text-accent-light transition focus-ring flex items-center gap-1">
              <Plus className="w-3 h-3" /> {activeTicketEvidence.length > 0 ? "Add Another File" : "Select Files"}
              <input type="file" className="hidden" multiple accept=".pdf,.csv,.png,.jpg,.jpeg,.webp,.xlsx" onChange={async (e) => {
                const fileList = e.target.files;
                if (!fileList) return;
                const files = Array.from(fileList) as File[];
                if (e.target) e.target.value = "";
                showToast("Uploading evidence...", "info");
                const compressed = await compressFiles(files);
                const uploaded = [];
                for (const f of compressed) {
                  const ev = await syncEvidenceUpload(activeTicket.id, f);
                  if (ev) uploaded.push(ev);
                }
                if (uploaded.length > 0) {
                  setEvidence(prev => [...uploaded, ...prev]);
                  showToast(`${uploaded.length} evidence file(s) uploaded securely.`, "success");
                } else {
                  showToast("Evidence upload failed. Please try again.", "error");
                }
              }} />
            </label>
          </div>
          <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
            {activeTicketEvidence.length === 0 ? (
              <p className="text-[10px] text-text-muted italic">No evidence files attached yet.</p>
            ) : (
              activeTicketEvidence.map(ev => (
                <div key={ev.id} className="px-2 py-1.5 bg-surface-card rounded border border-border flex items-center gap-2 hover:border-accent/30 transition-colors min-w-0">
                  {ev.url ? (
                    <a href={ev.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0" title="Open in new tab">
                      {ev.fileType?.startsWith("image/") ? (
                        <img src={ev.url} alt={ev.fileName} className="w-6 h-6 rounded object-cover shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      )}
                      <span className="text-[10px] font-medium text-text-primary truncate max-w-[160px]">{ev.fileName}</span>
                    </a>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <span className="text-[10px] font-medium text-text-primary truncate">{ev.fileName}</span>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
