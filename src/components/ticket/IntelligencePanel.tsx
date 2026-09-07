import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, AlertTriangle, Bot, Zap, ShieldAlert, UserPlus, ChevronRight } from "lucide-react";
import { TicketRecord } from "../../types/app";
import { useApp } from "../../context/AppContext";
import { useSla } from "../../lib/slaEngine";

interface IntelligencePanelProps {
  ticket: TicketRecord;
  slaConfig: {
    slaRules: any[];
    holidays: any[];
    priorityFallbackHours: Record<string, number>;
  };
}

export function IntelligencePanel({ ticket, slaConfig }: IntelligencePanelProps) {
  const { tickets, kbArticles } = useApp();
  const [showSimilar, setShowSimilar] = useState(false);

  const similarTickets = useMemo(() => {
    if (!ticket) return [];
    return tickets
      .filter(t => t.id !== ticket.id && !t.isDeleted)
      .filter(t =>
        t.category === ticket.category ||
        t.partner === ticket.partner ||
        (t.customerName && ticket.customerName && t.customerName.toLowerCase() === ticket.customerName?.toLowerCase())
      )
      .map(t => {
        let score = 0;
        if (t.category === ticket.category) score += 40;
        if (t.partner === ticket.partner) score += 30;
        if (t.customerName && ticket.customerName && t.customerName.toLowerCase() === ticket.customerName?.toLowerCase()) score += 30;
        return { ...t, similarity: Math.min(score, 100) };
      })
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 5);
  }, [ticket, tickets]);

const sla = useSla(ticket, slaConfig);
   const riskScore = useMemo(() => {
     if (!ticket) return 0;
     let score = 0;

     if (ticket.amount) {
       if (ticket.amount > 10000) score += 30;
       else if (ticket.amount > 5000) score += 20;
       else if (ticket.amount > 1000) score += 10;
     }

     const highRiskCategories = ["Fraud", "Security Breach", "System Outage"];
     if (highRiskCategories.includes(ticket.category)) score += 25;

     if (sla.breached) score += 30;
     else if (sla.atRisk) score += 20;
     else if (sla.hoursLeft <= 8) score += 10;

return Math.min(score, 100);
    }, [ticket, sla.breached, sla.atRisk, sla.hoursLeft]);

  const suggestedActions = useMemo(() => {
    if (!ticket) return [];

    const actions: { id: string; label: string; icon: React.ElementType; color: string }[] = [];

    switch (ticket.status as string) {
      case "receipt":
        actions.push({ id: "assign-agent", label: "Assign Agent", icon: UserPlus, color: "primary" });
        actions.push({ id: "gather-info", label: "Request More Information", icon: Info, color: "info" });
        break;
      case "investigate":
        actions.push({ id: "escalate", label: "Consider Escalation", icon: AlertTriangle, color: "warning" });
        actions.push({ id: "kb-search", label: "Search Knowledge Base", icon: Info, color: "info" });
        break;
      case "resolved":
        actions.push({ id: "request-feedback", label: "Request Customer Feedback", icon: Zap, color: "success" });
        break;
    }

    if (riskScore > 70) {
      actions.push({ id: "notify-management", label: "Notify Management", icon: ShieldAlert, color: "error" });
    }

    if (similarTickets.length > 0) {
      actions.push({ id: "review-similar", label: "Review Similar Tickets", icon: Bot, color: "info" });
    }

    return actions;
  }, [ticket, riskScore, similarTickets]);

  const recommendedArticles = useMemo(() => {
    if (!ticket || !kbArticles.length) return [];

    return kbArticles
      .filter(article =>
        article.category === ticket.category ||
        article.title.toLowerCase().includes(ticket.category.toLowerCase()) ||
        article.content?.toLowerCase().includes(ticket.description?.toLowerCase() || "")
      )
      .slice(0, 3);
  }, [ticket, kbArticles]);

  return (
    <div className="space-y-4">
      <section className="solid-surface rounded-xl p-4 snap-start min-w-[320px] flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" /> Intelligence
          </h3>
          <span className="inline-flex items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[9px] font-semibold text-primary">
            {similarTickets.length} similar case{similarTickets.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="space-y-3">
          <div className="bg-surface rounded-lg p-3 border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text-muted">Risk Assessment</span>
              <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-bold border ${riskScore >= 70 ? 'bg-error/15 text-error border-error/20' : riskScore >= 40 ? 'bg-warning/15 text-warning border-warning/20' : 'bg-success/15 text-success border-success/20'}`}>
                {riskScore}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-border rounded">
              <motion.div
                className={`h-full rounded ${riskScore >= 70 ? 'bg-error' : riskScore >= 40 ? 'bg-warning' : 'bg-success'}`}
                initial={{ width: 0 }}
                animate={{ width: `${riskScore}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              ></motion.div>
            </div>
            <p className="mt-1 text-[9px] text-text-muted">
              {riskScore >= 70 ? "High risk - immediate attention recommended" : riskScore >= 40 ? "Medium risk - monitor closely" : "Low risk - standard handling"}
            </p>
          </div>

          {similarTickets.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-muted">Similar Tickets</span>
              </div>
              <div className="bg-surface rounded-lg p-3 cursor-pointer hover:bg-surface-hover transition-colors border border-border/50 hover:border-border" onClick={() => setShowSimilar(!showSimilar)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[10px] font-bold text-primary shrink-0">
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
                      {similarTickets.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-[10px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-text-primary">{t.id}</span>
                            <span className="text-text-muted">·</span>
                            <span className="text-text-secondary truncate">{t.category}</span>
                          </div>
                          <span className="text-primary font-semibold shrink-0">{t.similarity}%</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {suggestedActions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-muted">Suggested Actions</span>
              </div>
              <div className="space-y-2">
                {suggestedActions.map(action => {
                  const ActionIcon = action.icon;
                  return (
                    <div key={action.id} className="flex items-center gap-2 px-3 py-2 bg-surface rounded-lg hover:bg-surface-hover transition-colors cursor-pointer border border-border/50 hover:border-border">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] ${
                        action.color === 'error' ? 'bg-error/10 text-error'
                        : action.color === 'warning' ? 'bg-warning/10 text-warning-dark'
                        : action.color === 'success' ? 'bg-success/10 text-success-dark'
                        : action.color === 'primary' ? 'bg-primary/10 text-primary'
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
            </div>
          )}

          {recommendedArticles.length > 0 && (
            <div className="space-y-2">
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
            </div>
          )}

          {similarTickets.length === 0 && suggestedActions.length === 0 && recommendedArticles.length === 0 && (
            <div className="text-center py-6">
              <Info className="w-8 h-8 text-text-muted mx-auto mb-3" />
              <p className="text-xs font-semibold text-text-muted">No intelligence data available</p>
              <p className="text-[9px] text-text-muted">Intelligence insights will appear as more ticket data is processed</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}