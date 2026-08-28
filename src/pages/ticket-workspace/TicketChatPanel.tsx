import React, { useRef, useEffect, useState } from "react";
import { Check, MessageSquare, Send, Bold as BoldIcon, Paperclip, AtSign, Zap, FileText } from "lucide-react";

import type { CommentRecord, FileEvidence, TicketRecord } from "../../types/app";
import { UserRole } from "../../types/app";
import EmptyState from "../../components/ui/EmptyState";
import { useApp } from "../../context/AppContext";
import { syncEvidenceUpload } from "../../lib/sync";
import { applyMention, extractAddressPartial, fullNameOf, mentionCandidates, stripLeadingMention } from "../../lib/mention";

interface TicketChatPanelProps {
  activeTicket: TicketRecord;
  commentText: string;
  setCommentText: React.Dispatch<React.SetStateAction<string>>;
  isSendingComment: boolean;
  replyingTo: string | null;
  setReplyingTo: (v: string | null) => void;
  showMentions: boolean;
  setShowMentions: (v: boolean) => void;
  mentionSearch: string;
  setMentionSearch: (v: string) => void;
  mentionIndex: number;
  setMentionIndex: (v: number | ((p: number) => number)) => void;
  onSendComment: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const MAX_MESSAGE_LENGTH = 1000;

export default function TicketChatPanel({
  activeTicket, commentText, setCommentText, isSendingComment, replyingTo, setReplyingTo,
  showMentions, setShowMentions, mentionSearch, setMentionSearch, mentionIndex, setMentionIndex,
  onSendComment, onKeyDown,
}: TicketChatPanelProps) {
  const {
    comments, users, currentRole, savedReplies, currentUser, setEvidence, showToast, evidence,
  } = useApp();

  const activityRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  /* auto-scroll to newest message */
  useEffect(() => {
    const el = activityRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [comments]);

  /* auto-resize composer */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [commentText]);

  const relativeTime = (ts: string) => {
    // eslint-disable-next-line react-hooks/purity -- relative time refreshes on each render; acceptable here.
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + "d ago";
    return new Date(ts).toLocaleDateString();
  };

  const renderMessage = (message: string) => {
    return message.split(/(@\w+\s?\w*|\*\*[^*]+\*\*)/).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-bold text-text-primary">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("@")) {
        const name = part.slice(1).trim();
        const known = users.find(u => fullNameOf(u).toLowerCase() === name.toLowerCase());
        return known ?
          <span key={i} className="text-accent font-semibold bg-accent/10 px-0.5 rounded">{part}</span>
          :
          <span key={i} className="text-warning font-semibold">{part}</span>;
      }
      return part;
    });
  };

  const insertBold = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = commentText.slice(start, end);
    const replacement = selected ? "**" + selected + "**" : "**bold**";
    const next = commentText.slice(0, start) + replacement + commentText.slice(end);
    setCommentText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 2, start + 2 + selected.length);
    });
  };

  const insertMention = () => {
    const el = textareaRef.current;
    if (!el) return;
    const next = "@" + commentText;
    setCommentText(next);
    setShowMentions(true);
    setMentionSearch("");
    setMentionIndex(0);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(1, 1);
    });
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setReplyingTo(null);
      setShowMentions(false);
      setCommentText(prev => stripLeadingMention(prev));
      setTextareaFocused(false);
      if (textareaRef.current) {
        textareaRef.current.blur();
      }
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !isSendingComment) {
      e.preventDefault();
      if (commentText.trim()) {
        onSendComment(e);
      }
    }
    if (e.key === "/" && !textareaFocused) {
      e.preventDefault();
      setTextareaFocused(true);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
    onKeyDown?.(e);
  };

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList) as File[];
    e.target.value = "";
    showToast("Uploading evidence...", "info");
    const uploaded = [];
    for (const f of files) {
      const ev = await syncEvidenceUpload(activeTicket.id, f);
      if (ev) uploaded.push(ev);
    }
    if (uploaded.length > 0) {
      setEvidence(prev => [...uploaded, ...prev]);
      showToast(uploaded.length + " evidence file(s) uploaded.", "success");
    } else {
      showToast("Evidence upload failed. Please try again.", "error");
    }
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setShowMentions(false);
    setCommentText(prev => stripLeadingMention(prev));
  };

  const replyTarget = replyingTo ? comments.find(c => c.id === replyingTo) : null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-elevated rounded-xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border flex items-center justify-between px-4 bg-surface h-9 shrink-0">
        <span className="text-caption font-heading font-bold text-text-primary flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-accent" /> Activity
        </span>
        <span className="text-[9px] text-text-muted font-medium">
          {comments.filter(c => c.ticketId === activeTicket.id).length} messages
        </span>
      </div>

      {/* Messages list — fills all remaining vertical space */}
      <div ref={activityRef} className="flex-1 min-h-0 p-2 space-y-1 bg-surface overflow-y-auto">
        {(() => {
          const ticketComments = comments.filter(c => c.ticketId === activeTicket.id);
          const topLevel = ticketComments.filter(c => !c.parentCommentId);
          const replies = ticketComments.filter(c => c.parentCommentId);
          const ticketEvidence = evidence
            .filter(ev => ev.ticketId === activeTicket.id)
            .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());

          type TimelineItem =
            | { kind: 'comment'; ts: number; comment: CommentRecord }
            | { kind: 'evidence'; ts: number; ev: FileEvidence };
          const timeline: TimelineItem[] = [
            ...topLevel.map(c => ({ kind: 'comment' as const, ts: new Date(c.timestamp).getTime(), comment: c })),
            ...ticketEvidence.map(ev => ({ kind: 'evidence' as const, ts: new Date(ev.uploadedAt).getTime(), ev })),
          ].sort((a, b) => a.ts - b.ts);

          const formatDateLabel = (ts: string) => {
            const d = new Date(ts);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (d.toDateString() === today.toDateString()) return "Today";
            if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
            return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
          };

          const renderBubble = (c: CommentRecord, isReply: boolean) => {
            const isMine = c.author === currentUser.firstName + " " + currentUser.lastName;
            const isExternal = c.role === "Customer";
            const initials = c.author.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div className={"group flex " + (isMine ? "justify-end" : "justify-start") + (isReply ? " ml-6" : "")}>
                <div className={"max-w-[85%] min-w-0 rounded-xl px-3 py-2 shadow-sm border transition-colors " + (
                  isMine
                    ? "bg-primary-light border-primary/20 text-text-primary rounded-br-sm"
                    : isExternal
                      ? "bg-surface-card border-border rounded-bl-sm"
                      : "bg-surface-card border-border rounded-bl-sm"
                )}>
                  <div className={"flex items-center gap-1.5 mb-1 " + (isMine ? "flex-row-reverse" : "")}>
                    <span className={"relative w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 " + (
                      isExternal ? "bg-accent/15 text-accent" : isMine ? "bg-primary/20 text-primary-dark" : "bg-surface-hover text-text-secondary"
                    )}>
                      {initials}
                      <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-success border border-[#fff] dark:border-surface-card" title="Online" />
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <span className="font-semibold text-text-primary text-[10px]">{c.author}</span>
                      <span className="text-[8px] text-text-muted ml-1.5 font-medium">{c.role}</span>
                    </div>
                    <span title={new Date(c.timestamp).toLocaleString()} className="text-[8px] text-text-muted font-mono shrink-0">
                      {relativeTime(c.timestamp)}
                    </span>
                  </div>
                  <p className="text-text-primary leading-snug text-xs break-words">
                    {renderMessage(c.message)}
                  </p>
                  <div className={"flex items-center justify-between mt-0.5 " + (isMine ? "flex-row-reverse" : "")}>
                    {!isReply && (
                      <button
                        onClick={() => {
                          const isTarget = replyingTo === c.id;
                          setReplyingTo(isTarget ? null : c.id);
                          setCommentText(prev => isTarget ? stripLeadingMention(prev) : applyMention(prev, c.author));
                          setShowMentions(false);
                          if (!isTarget) {
                            requestAnimationFrame(() => textareaRef.current?.focus());
                          }
                        }}
                        className="text-[9px] font-semibold text-text-muted hover:text-text-primary transition focus-ring cursor-pointer">
                        {replyingTo === c.id ? "Cancel" : "Reply"}
                      </button>
                    )}
                    {Array.isArray(c.seenBy) && c.seenBy.length > 0 && (
                      <span title={"Seen by " + c.seenBy.join(", ")} className="text-[9px] text-text-muted flex items-center gap-0.5">
                        <Check className="w-3 h-3 text-success" /> {c.seenBy.length}
                      </span>
                    )}
                  </div>
                  {replyingTo === c.id && (
                    <div className="mt-1 bg-accent/5 border border-accent/10 rounded p-1 text-[10px] text-accent font-medium">
                      Replying to {c.author}
                    </div>
                  )}
                </div>
              </div>
            );
          };

          const renderComment = (c: CommentRecord, isReply = false) => {
            const threadReplies = replies.filter(r => r.parentCommentId === c.id);
            return (
              <div key={c.id}>
                {renderBubble(c, isReply)}
                {threadReplies.length > 0 && (
                  <div className={"mt-1 space-y-1 " + (isReply ? "ml-6" : "")}>
                    {threadReplies.map(r => renderComment(r, true))}
                  </div>
                )}
              </div>
            );
          };

          const renderEvidence = (ev: FileEvidence) => (
            <div className="flex justify-start">
              {ev.url ? (
                <a
                  href={ev.url}
                  target="_blank"
                  rel="noreferrer"
                  title={ev.fileName + " — uploaded by " + ev.uploadedBy}
                  className="max-w-[85%] min-w-0 flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 shadow-sm hover:border-accent/50 transition-colors"
                >
                  {ev.fileType?.startsWith("image/") ? (
                    <img src={ev.url} alt={ev.fileName} className="w-6 h-6 rounded object-cover shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-accent shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-text-primary truncate max-w-[200px]">{ev.fileName}</span>
                    <span className="block text-[9px] text-text-muted">{(ev.fileSize / 1024).toFixed(0)} KB · {ev.uploadedBy}</span>
                  </span>
                </a>
              ) : (
                <div
                  title={ev.fileName + " — uploaded by " + ev.uploadedBy}
                  className="max-w-[85%] min-w-0 flex items-center gap-2 rounded-xl border border-border bg-surface-card px-3 py-2 opacity-75"
                >
                  <FileText className="w-4 h-4 text-text-muted shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-text-primary truncate max-w-[200px]">{ev.fileName}</span>
                    <span className="block text-[9px] text-text-muted">link expired</span>
                  </span>
                </div>
              )}
            </div>
          );

          if (timeline.length === 0) {
            return (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  icon={<MessageSquare className="w-12 h-12" />}
                  title="No activity yet"
                  message="Start the conversation by posting the first comment on this ticket."
                />
              </div>
            );
          }

          let lastDate = "";
          return timeline.map((item) => {
            const ts = item.kind === 'comment' ? item.comment.timestamp : item.ev.uploadedAt;
            const dateLabel = formatDateLabel(ts);
            const showDateSep = dateLabel !== lastDate;
            lastDate = dateLabel;
            return (
              <div key={item.kind === 'comment' ? item.comment.id : 'ev-' + item.ev.id}>
                {showDateSep && (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[9px] text-text-muted font-semibold uppercase tracking-wider">{dateLabel}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                {item.kind === 'comment' ? renderComment(item.comment) : renderEvidence(item.ev)}
              </div>
            );
          });
        })()}
      </div>

      {/* Composer */}
      <div className="shrink-0 p-2 border-t border-border bg-surface-elevated">
        {replyTarget && (
          <div className="mb-1.5 flex items-center justify-between px-2 py-1 bg-accent/5 border border-accent/10 rounded text-[10px]">
            <span className="text-text-primary min-w-0 truncate">
              <span className="font-semibold text-accent">Replying to {replyTarget.author}</span>
              <span className="text-text-muted ml-1.5 hidden sm:inline truncate">"{replyTarget.message}"</span>
            </span>
            <button type="button" onClick={cancelReply} className="ml-2 shrink-0 text-text-muted hover:text-text-primary text-[11px] font-semibold transition focus-ring">Cancel</button>
          </div>
        )}
        <form onSubmit={onSendComment} className="relative">
          {/* Input row: textarea + inline send button */}
          <div className="flex items-end gap-1.5">
            <textarea
              ref={textareaRef}
              value={commentText}
              onChange={(e) => {
                const val = e.target.value;
                const trimmed = val.trim();
                setCommentText(val);
                if (trimmed === "@" || /^@\S*$/.test(trimmed)) {
                  setShowMentions(true);
                  setMentionSearch(extractAddressPartial(trimmed));
                  setMentionIndex(0);
                } else {
                  setShowMentions(false);
                }
              }}
              onKeyDown={(e) => handleTextareaKeyDown(e)}
              onFocus={() => setTextareaFocused(true)}
              onBlur={() => setTextareaFocused(false)}
              aria-label="Add a comment"
              className="flex-1 min-w-0 border border-border rounded-lg p-2 pr-7 text-xs focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 resize-none bg-surface"
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Type a message..." />
            <button
              type="button"
              onClick={insertMention}
              aria-label="Mention someone"
              title="@mention — notifies that person"
              className="shrink-0 mb-0.5 p-1.5 text-text-muted hover:text-accent hover:bg-surface-card transition-colors rounded-full focus-ring"
            ><AtSign className="w-3.5 h-3.5" /></button>
            <button
              type="submit"
              disabled={isSendingComment || !commentText.trim()}
              aria-label="Send message"
              title="Send (Enter)"
              className="shrink-0 w-8 h-8 flex items-center justify-center bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] rounded-full transition-all duration-150 focus-ring shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* @mention autocomplete */}
          {showMentions && (() => {
            const filtered = mentionCandidates(users, currentUser.email).filter(u => fullNameOf(u).toLowerCase().includes(mentionSearch));
            if (filtered.length === 0) return null;
            return (
              <div role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 right-0 mb-1 bg-surface-elevated border border-border rounded-lg shadow-dropdown z-50 max-h-28 overflow-y-auto">
                {filtered.map((u, i) => (
                  <button key={u.id} type="button" role="option" aria-selected={i === mentionIndex} onMouseDown={() => { setCommentText(prev => applyMention(prev, fullNameOf(u))); setShowMentions(false); }}
                    className={"w-full text-left px-2 py-1.5 text-[10px] flex items-center gap-2 " + (i === mentionIndex ? "bg-primary-light text-primary-dark" : "text-text-primary hover:bg-surface-hover")}>
                    <span className="font-semibold">{fullNameOf(u)}</span>
                    <span className="text-[10px] text-text-muted">{u.role}</span>
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Toolbar below input */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={insertBold} aria-label="Bold" className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-card transition-colors rounded focus-ring" title="Bold"><BoldIcon className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => attachInputRef.current?.click()} aria-label="Attach file" className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-card transition-colors rounded focus-ring" title="Attach file"><Paperclip className="w-3.5 h-3.5" /></button>
              <input ref={attachInputRef} type="file" className="hidden" multiple accept=".pdf,.csv,.png,.jpg,.jpeg,.webp,.xlsx" onChange={handleAttach} />
              <span className="mx-1 h-3 w-px bg-border" />
              {currentRole !== UserRole.EXECUTIVE && savedReplies.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowQuickReplies(!showQuickReplies)}
                    aria-expanded={showQuickReplies}
                    className={"flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-colors focus-ring " + (showQuickReplies ? "bg-primary-light text-primary" : "text-text-muted hover:text-text-primary hover:bg-surface-card")}
                  >
                    <Zap className="w-3 h-3" /> Quick Replies
                  </button>
                  {showQuickReplies && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowQuickReplies(false)} role="presentation" aria-hidden="true" />
                      <div className="absolute bottom-full left-0 mb-1.5 bg-surface-elevated border border-border rounded-lg shadow-dropdown z-50 max-h-36 overflow-y-auto min-w-[220px]">
                        {savedReplies.map((r, idx) => (
                          <button key={idx} type="button" onMouseDown={() => {
                            const el = textareaRef.current;
                            const insertAt = el ? el.selectionStart : commentText.length;
                            const before = commentText.slice(0, insertAt);
                            const needsSpace = before.length > 0 && !/\s$/.test(before);
                            setCommentText(before + (needsSpace ? " " : "") + r);
                            setShowQuickReplies(false);
                            requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(insertAt + r.length, insertAt + r.length); });
                          }} className="w-full max-w-[280px] text-left px-2.5 py-1.5 text-[10px] text-text-primary hover:bg-surface-hover transition-colors truncate">
                            {r}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {commentText.length > 800 && (
                <span className={`text-[9px] font-mono ${commentText.length > 950 ? "text-error font-bold" : "text-text-muted"}`}>
                  {commentText.length}/{MAX_MESSAGE_LENGTH}
                </span>
              )}
              <span className="text-[9px] text-text-muted hidden sm:inline">Enter to send · Shift+Enter for new line</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
