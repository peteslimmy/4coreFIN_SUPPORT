import React from "react";
import IntelligenceSection from "./IntelligenceSection";
import WatcherPanel from "./WatcherPanel";
import AuditTrailSection from "./AuditTrailSection";
import type { TicketRecord } from "../../types/app";

interface RightPanelProps {
  activeTicket: TicketRecord;
  selectedWatcherIds: Set<string>;
  setSelectedWatcherIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  newWatcherEmail: string;
  setNewWatcherEmail: (v: string) => void;
  setNotifyWatcherModal: (v: { isOpen: boolean; watcherEmail: string | null }) => void;
  setRemoveWatcherConfirm: (v: string | null) => void;
}

export default function RightPanel({
  activeTicket,
  selectedWatcherIds,
  setSelectedWatcherIds,
  newWatcherEmail,
  setNewWatcherEmail,
  setNotifyWatcherModal,
  setRemoveWatcherConfirm,
}: RightPanelProps) {
  return (
    <div className="space-y-4">
      {/* Intelligence Section */}
      <IntelligenceSection activeTicket={activeTicket} />
      
      {/* Divider */}
      <div className="h-px bg-border" />
      
      {/* Watchers Section */}
      <WatcherPanel
        activeTicket={activeTicket}
        selectedWatcherIds={selectedWatcherIds}
        setSelectedWatcherIds={setSelectedWatcherIds}
        newWatcherEmail={newWatcherEmail}
        setNewWatcherEmail={setNewWatcherEmail}
        setNotifyWatcherModal={setNotifyWatcherModal}
        setRemoveWatcherConfirm={setRemoveWatcherConfirm}
      />
      
      {/* Divider */}
      <div className="h-px bg-border" />
      
      {/* Audit Trail Section */}
      <AuditTrailSection activeTicket={activeTicket} />
    </div>
  );
}