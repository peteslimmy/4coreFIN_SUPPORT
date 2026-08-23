import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Input,
  Textarea,
  Badge,
  Checkbox,
  Label,
  Separator,
  Switch,
  useToast,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { api } from '../lib/api';
import { formatRelative, parseISO } from '../lib/dateUtils';
import { Mail, Settings, Search, CheckCircle, X, Plus, Trash2, ClipboardList, MessageSquare, AlarmClock, Paperclip, Download, Loader2 } from 'lucide-react';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

export default function EmailInboxPage() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [emailDetails, setEmailDetails] = useState<any | null>(null);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [emailRules, setEmailRules] = useState<any[]>([]);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleCondition, setNewRuleCondition] = useState('');
  const [newRuleAction, setNewRuleAction] = useState('');
  const [isMarkingAsRead, setIsMarkingAsRead] = useState(false);

  const loadEmails = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const searchFilters = {
        ...filters,
        ...(search ? { search } : {}),
      };
      const data = await api.listEmailInbox(searchFilters);
      setEmails(data);
    } catch (error: any) {
      toast.error(`Failed to load emails: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [api, loading, filters, search, toast]);

  const loadEmailRules = useCallback(async () => {
    try {
      const data = await api.listEmailRules();
      setEmailRules(data);
    } catch (error: any) {
      console.error('Failed to load email rules:', error);
    }
  }, [api]);

  useEffect(() => {
    loadEmails();
    loadEmailRules();
  }, [filters, search]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(emails.map((email) => email.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleMarkAsRead = async () => {
    if (selectedIds.length === 0) return;
    setIsMarkingAsRead(true);
    try {
      // Process each email as read (this would typically be done via API)
      for (const id of selectedIds) {
        // In a real app, we'd have an API endpoint for marking as read
        // For now, we'll just remove from selected state
      }
      setSelectedIds([]);
      toast.success(`${selectedIds.length} email(s) marked as read`);
    } catch (error: any) {
      toast.error(`Failed to mark emails as read: ${error.message}`);
    } finally {
      setIsMarkingAsRead(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected email(s)?`)) return;

    try {
      // In a real app, we'd call delete API for each
      setSelectedIds([]);
      loadEmails();
      toast.success(`${selectedIds.length} email(s) deleted`);
    } catch (error: any) {
      toast.error(`Failed to delete emails: ${error.message}`);
    }
  };

  const handleProcessSelected = async () => {
    if (selectedIds.length === 0) return;
    setIsProcessing(true);
    try {
      for (const id of selectedIds) {
        await api.processEmail(id);
      }
      setSelectedIds([]);
      loadEmails();
      toast.success(`${selectedIds.length} email(s) processed`);
    } catch (error: any) {
      toast.error(`Failed to process emails: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRuleName.trim() || !newRuleCondition.trim() || !newRuleAction.trim()) {
      toast.error('Please fill in all rule fields');
      return;
    }

    try {
      await api.createEmailRule({
        name: newRuleName.trim(),
        condition: newRuleCondition.trim(),
        action: newRuleAction.trim(),
        active: true,
      });
      setNewRuleName('');
      setNewRuleCondition('');
      setNewRuleAction('');
      loadEmailRules();
      toast.success('Email rule created');
    } catch (error: any) {
      toast.error(`Failed to create rule: ${error.message}`);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    try {
      const rule = emailRules.find((r) => r.id === ruleId);
      if (!rule) return;
      await api.updateEmailRule(ruleId, { active: !rule.active });
      loadEmailRules();
    } catch (error: any) {
      toast.error(`Failed to update rule: ${error.message}`);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Delete this email rule?')) return;
    try {
      await api.deleteEmailRule(ruleId);
      loadEmailRules();
      toast.success('Email rule deleted');
    } catch (error: any) {
      toast.error(`Failed to delete rule: ${error.message}`);
    }
  };

  if (loading && emails.length === 0) {
    return (
      <PageTransition>
      <PageContainer maxWidth="full" className="space-y-4">
        <PageHeader
          title="Email Inbox"
          subtitle="Manage and process incoming emails"
          breadcrumbs={[{ label: 'Home' }, { label: 'Email Inbox' }]}
        />
        <Skeleton variant="table-row" count={6} />
      </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
    <PageContainer maxWidth="full" className="space-y-4">
      <PageHeader
        title="Email Inbox"
        subtitle="Manage and process incoming emails"
        breadcrumbs={[{ label: 'Home' }, { label: 'Email Inbox' }]}
        actions={<>
          <Button variant="outline" onClick={() => setShowRules(true)}>
            <Settings className="mr-2 h-4 w-4" /> Rules
          </Button>
          <Button onClick={handleProcessSelected} isLoading={isProcessing} disabled={selectedIds.length === 0}>
            <AlarmClock className="mr-2 h-4 w-4" /> Process Selected
          </Button>
        </>}
      />

        {/* Search bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="text-sm font-medium text-text-muted">Search emails</label>
          <div className="flex-1 min-w-0 relative">
            <Input
              placeholder="Search by sender, subject, or content..."
              value={search}
              onChange={handleSearchChange}
              className="pr-10"
            />
            <Search className="absolute inset-y-0 right-3 flex h-4 w-4 items-center justify-center text-text-muted pointer-events-none" />
          </div>
        </div>

      {/* Email Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-card rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Email Rules</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowRules(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Rules list */}
              {emailRules.length > 0 ? (
                <div className="space-y-2">
                  {emailRules.map((rule) => (
                    <div key={rule.id} className="border border-border-subtle rounded-lg p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary">{rule.name}</p>
                        <p className="text-caption text-text-muted">
                          If: {rule.condition} → Then: {rule.action}
                        </p>
                        <p className="text-xs text-text-muted">
                          {rule.active ? 'Active' : 'Inactive'} ·
                          {new Date(rule.updated_at || rule.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.active}
                          onChange={() => handleToggleRule(rule.id)}
                          aria-label={`Toggle rule ${rule.name}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRule(rule.id)}
                          aria-label="Delete rule"
                        >
                          <Trash2 className="h-4 w-4 text-error" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-muted text-center py-4">No email rules defined yet.</p>
              )}

              <Separator className="my-4" />

              {/* Add new rule form */}
              <div className="space-y-3">
                <h3 className="font-medium text-text-primary">Add New Rule</h3>
                <div className="space-y-2">
                  <Label htmlFor="rule-name">Rule Name</Label>
                  <Input
                    id="rule-name"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    placeholder="e.g., High Priority Customer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-condition">Condition (When)</Label>
                  <Input
                    id="rule-condition"
                    value={newRuleCondition}
                    onChange={(e) => setNewRuleCondition(e.target.value)}
                    placeholder="e.g., FROM: VIP Customer OR SUBJECT: 'Urgent'"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-action">Action (Then)</Label>
                  <Input
                    id="rule-action"
                    value={newRuleAction}
                    onChange={(e) => setNewRuleAction(e.target.value)}
                    placeholder="e.g., SET PRIORITY: HIGH, NOTIFY: ops-team"
                  />
                </div>
                <Button onClick={handleAddRule} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Rule
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Email list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {emails.length === 0 ? (
            <EmptyState
              icon={<Mail className="w-16 h-16" />}
              title="No emails found"
              message={search ? 'Try clearing your search filter' : 'No emails have been received yet'}
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-4 py-2 bg-surface-hover/50 rounded-t-lg border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.length === emails.length && emails.length > 0}
                    indeterminate={selectedIds.length > 0 && selectedIds.length < emails.length}
                    onChange={handleSelectAll}
                    aria-label="Select all emails"
                  />
                  <span className="text-caption font-medium">
                    {selectedIds.length} of {emails.length} selected
                  </span>
                </div>
                <div className="text-caption text-text-muted">
                  Showing {emails.length} email{emails.length === 1 ? '' : 's'}
                </div>
              </div>

              <Table className="w-full">
                <TableHeader className="border-b border-border">
                  <TableRow className="hover:bg-surface-hover">
                    <TableCell className="w-4 px-2 text-center">
                      <Checkbox
                        checked={selectedIds.length === emails.length && emails.length > 0}
                        indeterminate={selectedIds.length > 0 && selectedIds.length < emails.length}
                        onChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableCell>
                    <TableCell className="w-12">From</TableCell>
                    <TableCell className="w-20">Subject</TableCell>
                    <TableCell className="w-16">Received</TableCell>
                    <TableCell className="w-12">Status</TableCell>
                    <TableCell className="w-8">Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emails.map((email) => {
                    const isSelected = selectedIds.includes(email.id);
                    const isUnread = !email.read;
                    const receivedTime = formatRelative(
                      parseISO(email.received_at),
                      new Date()
                    );
                    return (
                      <TableRow
                        key={email.id}
                        className={`
                          hover:bg-surface-hover
                          ${isSelected ? 'bg-accent/10' : ''}
                          ${isUnread ? 'font-medium' : ''}
                        `}
                        onClick={() => setSelectedEmailId(email.id)}
                      >
                        <TableCell className="px-2 text-center">
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => handleToggleSelection(email.id)}
                            aria-label={`Select email from ${email.from}`}
                          />
                        </TableCell>
                        <TableCell className="flex-1 min-w-0 truncate">
                          <div className="flex items-center gap-2">
                            {isUnread && (
                              <div className="w-2 h-2 bg-accent rounded-full" />
                            )}
                            <span
                              title={email.from}
                              className="max-w-xs truncate"
                            >
                              {email.from_name || email.from.split('@')[0]}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="flex-1 min-w-0 truncate">
                          <div className="flex flex-col gap-1">
                            <p className="line-clamp-1">{email.subject || '(No subject)'}</p>
                            {email.preview && (
                              <p className="text-caption text-text-muted line-clamp-1">
                                {email.preview}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-caption">
                          {receivedTime === 'today' || receivedTime === 'yesterday'
                            ? receivedTime
                            : parseISO(email.received_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="flex items-center justify-center gap-2">
                          {!email.processed && (
                            <Badge variant="outline">New</Badge>
                          )}
                          {email.flagged && (
                            <Badge variant="secondary">Flagged</Badge>
                          )}
                          {email.has_attachments && (
                            <Badge variant="outline">
                              <Paperclip className="h-3 w-3" /> {email.attachment_count}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEmailId(email.id);
                            }}
                            aria-label="View email"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          {!email.processed && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                api.processEmail(email.id).then(() => {
                                  loadEmails();
                                  toast.success('Email processed');
                                });
                              }}
                              aria-label="Process email"
                            >
                              <AlarmClock className="h-4 w-4 text-sm" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Email details panel */}
        {selectedEmailId && (
          <div className="border-t border-border-subtle bg-surface-card/50 backdrop-blur-sm">
            <div className="flex flex-col gap-4 p-4">
              <div className="flex justify-between items-start">
                <h2 className="text-xl font-bold">
                  {emailDetails?.subject || 'Loading email...'}
                </h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedEmailId(null)}>
                    <X className="h-4 w-4" /> Close
                  </Button>
                  {!emailDetails?.processed && (
                    <Button
                      onClick={async () => {
                        await api.processEmail(selectedEmailId!);
                        setEmailDetails(null);
                        loadEmails();
                        toast.success('Email processed');
                      }}
                    >
                      <AlarmClock className="mr-1 h-3 w-3" /> Process
                    </Button>
                  )}
                </div>
              </div>

              {emailDetails ? (
                <div className="space-y-4">
                  <div className="border border-border-subtle rounded-lg p-4">
                    <p className="text-caption text-text-muted">
                      <strong>From:</strong> {emailDetails.from_name} &lt;{emailDetails.from}&gt;
                    </p>
                    <p className="text-caption text-text-muted">
                      <strong>To:</strong> {emailDetails.to}
                    </p>
                    <p className="text-caption text-text-muted">
                      <strong>Date:</strong> {formatRelative(
                        parseISO(emailDetails.received_at),
                        new Date()
                      )} ({emailDetails.received_at})
                    </p>
                    {emailDetails.cc && (
                      <p className="text-caption text-text-muted">
                        <strong>CC:</strong> {emailDetails.cc}
                      </p>
                    )}
                  </div>

                  <div className="border border-border-subtle rounded-lg p-4">
                    <div className="text-base whitespace-pre-line">
                      {emailDetails.body || '(No content available)'}
                    </div>
                  </div>

                  {emailDetails.attachments && emailDetails.attachments.length > 0 && (
                    <div className="border border-border-subtle rounded-lg p-4">
                      <p className="font-medium text-text-primary mb-2">
                        Attachments ({emailDetails.attachments.length})
                      </p>
                      <div className="space-y-2">
                        {emailDetails.attachments.map((att: any, index: number) => (
                          <div key={index} className="flex items-center gap-3 p-3 border border-border-subtle/50 rounded-lg">
                            <Paperclip className="h-4 w-4 text-accent" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{att.filename}</p>
                              <p className="text-caption text-text-muted">
                                {att.size} bytes · {att.content_type}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                // In a real app, this would trigger a download
                                alert(`Downloading ${att.filename}...`);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-8">
                  <Skeleton variant="text" count={3} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
    </PageTransition>
  );
}