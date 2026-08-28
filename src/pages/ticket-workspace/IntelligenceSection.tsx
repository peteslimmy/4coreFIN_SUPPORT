import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Info,
  AlertTriangle,
  Bot,
  Zap,
  ShieldAlert,
  UserPlus,
  ChevronRight
} from "lucide-react";

import type { TicketRecord } from "../../types/app";
import { useApp } from "../../context/AppContext";

interface IntelligenceSectionProps {
  activeTicket: TicketRecord;
}

export default function IntelligenceSection({ activeTicket }: IntelligenceSectionProps) {
  const {
    tickets, kbArticles
  } = useApp();
  const [showSimilar, setShowSimilar] = useState(false);

  // Calculate intelligence data
  const similarTickets = useMemo(() => {
    if (!activeTicket) return [];
    return tickets
      .filter(t => t.id !== activeTicket.id && !t.isDeleted)
      .filter(t => 
        t.category === activeTicket.category || 
        t.partner === activeTicket.partner ||
        (t.customerName && activeTicket.customerName && t.customerName.toLowerCase() === activeTicket.customerName?.toLowerCase())
      )
      .map(t => {
        // Simple similarity score (0-100)
        let score = 0;
        if (t.category === activeTicket.category) score += 40;
        if (t.partner === activeTicket.partner) score += 30;
        if (t.customerName && activeTicket.customerName && t.customerName.toLowerCase() === activeTicket.customerName?.toLowerCase()) score += 30;
        return { ...t, similarity: Math.min(score, 100) };
      })
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 5); // Top 5
  }, [activeTicket, tickets]);

  // Risk assessment
  const riskScore = useMemo(() => {
    if (!activeTicket) return 0;
    let score = 0;
    
    // Amount risk
    if (activeTicket.amount) {
      if (activeTicket.amount > 10000) score += 30;
      else if (activeTicket.amount > 5000) score += 20;
      else if (activeTicket.amount > 1000) score += 10;
    }
    
    // Category risk (example weights)
    const highRiskCategories = ["Fraud", "Security Breach", "System Outage"];
    if (highRiskCategories.includes(activeTicket.category)) score += 25;
    
    // SLA risk
    if (activeTicket.slaDeadline) {
      // eslint-disable-next-line react-hooks/purity -- relative SLA risk refreshes on each render; acceptable here.
      const timeLeft = new Date(activeTicket.slaDeadline).getTime() - Date.now();
      const hoursLeft = timeLeft / (1000 * 60 * 60);
      if (hoursLeft < 1) score += 30; // SLA breached
      else if (hoursLeft < 4) score += 20; // SLA at risk
      else if (hoursLeft < 8) score += 10; // SLA warning
    }
    
    return Math.min(score, 100);
  }, [activeTicket]);

  // Suggested actions based on ticket state
  const suggestedActions = useMemo(() => {
    if (!activeTicket) return [];
    
    const actions: { id: string; label: string; icon: React.ElementType; color: string }[] = [];
    
    // Based on status
    switch (activeTicket.status as string) {
      case "receipt":
        actions.push({ 
          id: "assign-agent", 
          label: "Assign Agent", 
          icon: UserPlus, 
          color: "primary" 
        });
        actions.push({ 
          id: "gather-info", 
          label: "Request More Information", 
          icon: Info, 
          color: "info" 
        });
        break;
        
      case "investigate":
        actions.push({ 
          id: "escalate", 
          label: "Consider Escalation", 
          icon: AlertTriangle, 
          color: "warning" 
        });
        actions.push({ 
          id: "kb-search", 
          label: "Search Knowledge Base", 
          icon: Info, 
          color: "info" 
        });
        break;
        
      case "resolved":
        actions.push({ 
          id: "request-feedback", 
          label: "Request Customer Feedback", 
          icon: Zap, 
          color: "success" 
        });
        break;
    }
    
    // Based on risk
    if (riskScore > 70) {
      actions.push({ 
        id: "notify-management", 
        label: "Notify Management", 
        icon: ShieldAlert, 
        color: "error" 
      });
    }
    
    // Based on similar tickets
    if (similarTickets.length > 0) {
      actions.push({ 
        id: "review-similar", 
        label: "Review Similar Tickets", 
        icon: Bot, 
        color: "info" 
      });
    }
    
    return actions;
  }, [activeTicket, riskScore, similarTickets]);

  // Recommended KB articles
  const recommendedArticles = useMemo(() => {
    if (!activeTicket || !kbArticles.length) return [];
    
    // Simple matching by category or keywords in title
    return kbArticles
      .filter(article => 
        article.category === activeTicket.category ||
        article.title.toLowerCase().includes(activeTicket.category.toLowerCase()) ||
        article.content?.toLowerCase().includes(activeTicket.description?.toLowerCase() || "")
      )
      .slice(0, 3); // Top 3
  }, [activeTicket, kbArticles]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" /> Intelligence
        </h3>
        <span className="text-[9px] font-medium text-text-primary">
          {similarTickets.length} similar cases
        </span>
      </div>

      {/* Risk Score */}
      <div className="bg-surface rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-muted">Risk Assessment</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded 
            ${riskScore >= 70 ? 'bg-error/20 text-error' 
              : riskScore >= 40 ? 'bg-warning/20 text-warning' 
              : 'bg-success/20 text-success'}`}>
            {riskScore}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-border rounded">
          <div
            className={`h-full rounded transition-all duration-500 ${
              riskScore >= 70 ? 'bg-error' : riskScore >= 40 ? 'bg-warning' : 'bg-success'
            }`}
            style={{ width: riskScore + '%' }}
          ></div>
        </div>
        <p className="mt-1 text-[9px] text-text-muted">
          {riskScore >= 70 ? "High risk - immediate attention recommended" 
            : riskScore >= 40 ? "Medium risk - monitor closely" 
            : "Low risk - standard handling"}
        </p>
      </div>

      {/* Similar Tickets — compact summary with expand */}
      {similarTickets.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-muted">Similar Tickets</span>
          </div>
          <div
            className="bg-surface rounded-lg p-3 cursor-pointer hover:bg-surface-hover transition-colors border border-border/50 hover:border-border"
            onClick={() => setShowSimilar(!showSimilar)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0">
                  {similarTickets.length}
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-text-primary">
                    similar ticket{similarTickets.length !== 1 ? 's' : ''} found
                  </span>
                  <span className="text-[10px] text-text-muted ml-1">
                    · {Math.round(similarTickets.reduce((sum, t) => sum + (t.similarity || 0), 0) / similarTickets.length)}% avg match
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 text-text-muted transition-transform shrink-0 ${showSimilar ? 'rotate-90' : ''}`} />
            </div>
            <AnimatePresence initial={false}>
            {showSimilar && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2.5">
                  {similarTickets.map(ticket => (
                    <div key={ticket.id} className="flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-text-primary">{ticket.id}</span>
                        <span className="text-text-muted">·</span>
                        <span className="text-text-secondary truncate">{ticket.category}</span>
                      </div>
                      <span className="text-primary font-semibold shrink-0">{ticket.similarity}%</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Suggested Actions */}
      {suggestedActions.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-muted">Suggested Actions</span>
          </div>
          <div className="space-y-2">
            {suggestedActions.map(action => {
              const ActionIcon = action.icon;
              return (
                <div key={action.id} className="flex items-center gap-2 px-3 py-2 bg-surface rounded-lg hover:bg-surface-hover transition-colors cursor-pointer border border-border/50 hover:border-border">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] ${
                    action.color === 'error' ? 'bg-error-light text-error'
                    : action.color === 'warning' ? 'bg-warning-light text-warning-dark'
                    : action.color === 'success' ? 'bg-success-light text-success-dark'
                    : action.color === 'primary' ? 'bg-primary-light text-primary'
                    : 'bg-surface-hover text-text-secondary'
                  }`}>
                    <ActionIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-text-primary">{action.label}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Recommended KB Articles */}
      {recommendedArticles.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-muted">Recommended Articles</span>
          </div>
          <div className="space-y-2">
            {recommendedArticles.map(article => (
              <div key={article.id} className="bg-surface rounded-lg p-3 cursor-pointer hover:bg-surface-hover transition-colors border border-border/50 hover:border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-text-primary text-[10px]">{article.title}</span>
                  <span className="text-[9px] text-text-muted">KB</span>
                </div>
                <p className="text-[9px] text-text-secondary line-clamp-2">
                  {article.content?.substring(0, 100) + (article.content?.length > 100 ? "..." : "")}
                </p>
                <div className="mt-2 flex items-center gap-1 text-[8px] text-text-muted">
                  <Bot className="w-3 h-3" /> Suggested by AI
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      
      {/* Empty state */}
      {similarTickets.length === 0 && suggestedActions.length === 0 && recommendedArticles.length === 0 && (
        <div className="text-center py-6">
          <Info className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-xs font-semibold text-text-muted">No intelligence data available</p>
          <p className="text-[9px] text-text-muted">Intelligence insights will appear as more ticket data is processed</p>
        </div>
      )}
    </div>
  );
}