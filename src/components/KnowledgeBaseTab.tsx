import React, { memo, useState } from 'react';
import {
  BookOpen, Search, Plus, Trash2, Edit3, Clipboard, Calendar, ArrowRight, User, ChevronLeft
} from 'lucide-react';
import { KbArticle } from '../types/admin';
import { useApp } from '../context/AppContext';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import Textarea from './ui/Textarea';
import Badge from './ui/Badge';
import ConfirmModal from './ui/ConfirmModal';

interface KnowledgeBaseTabProps {
  articles: KbArticle[];
  setArticles: React.Dispatch<React.SetStateAction<KbArticle[]>>;
  currentRole: string;
  currentUser: { firstName: string; lastName: string; email: string; bu: string };
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

function KnowledgeBaseTab({
  articles, setArticles,
  currentRole,
  showToast
}: KnowledgeBaseTabProps) {
  const { activeTicketId, setActiveTab, setCommentText } = useApp();

  const [selectedArticleId, setSelectedArticleId] = useState<string>(articles[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [providerFilter, setProviderFilter] = useState<string>('ALL');

  // Article Form State for Create/Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Omit<KbArticle, 'id' | 'lastUpdated'>>({
    title: '',
    category: 'Playbook',
    provider: 'General',
    content: '',
    tags: []
  });
  const [tagInput, setTagInput] = useState('');
  const [kbFormErrors, setKbFormErrors] = useState<Record<string, string>>({});
  const [deleteConfirmArticleId, setDeleteConfirmArticleId] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(false);

  // Filtering Logic
  const filteredArticles = articles.filter(art => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      art.title.toLowerCase().includes(q) ||
      art.content.toLowerCase().includes(q) ||
      art.category.toLowerCase().includes(q) ||
      art.tags.some(t => t.toLowerCase().includes(q));
    
    const matchesCategory = categoryFilter === 'ALL' || art.category === categoryFilter;
    const matchesProvider = providerFilter === 'ALL' || art.provider === providerFilter;

    return matchesSearch && matchesCategory && matchesProvider;
  });

  const activeArticle = articles.find(art => art.id === selectedArticleId) || filteredArticles[0];

  const clearKbError = (field: string) => setKbFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  // Action: Save Article (Create/Edit)
  const handleSaveArticle = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formState.title.trim()) errs.title = 'Title is required';
    if (!formState.content.trim()) errs.content = 'Content is required';
    setKbFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const tagsArray = tagInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);

    if (editingArticleId) {
      setArticles(prev => prev.map(art => 
        art.id === editingArticleId 
          ? { 
              ...art, 
              title: formState.title, 
              category: formState.category, 
              provider: formState.provider, 
              content: formState.content, 
              tags: tagsArray,
              lastUpdated: new Date().toISOString().split('T')[0]
            } 
          : art
      ));
      showToast('Article updated successfully.', 'success');
      setEditingArticleId(null);
    } else {
      const newArt: KbArticle = {
        id: 'kb-' + Date.now(),
        title: formState.title,
        category: formState.category,
        provider: formState.provider,
        content: formState.content,
        tags: tagsArray,
        lastUpdated: new Date().toISOString().split('T')[0]
      };
      setArticles(prev => [newArt, ...prev]);
      setSelectedArticleId(newArt.id);
      showToast('New Knowledge Base Article published.', 'success');
    }

    setIsFormOpen(false);
    setKbFormErrors({});
    setFormState({ title: '', category: 'Playbook', provider: 'General', content: '', tags: [] });
    setTagInput('');
  };

  const handleEditArticle = (art: KbArticle) => {
    setEditingArticleId(art.id);
    setFormState({
      title: art.title,
      category: art.category,
      provider: art.provider,
      content: art.content,
      tags: art.tags
    });
    setTagInput(art.tags.join(', '));
    setIsFormOpen(true);
  };

  const handleDeleteArticle = (id: string) => {
    setDeleteConfirmArticleId(id);
  };

  const confirmDeleteArticle = () => {
    if (!deleteConfirmArticleId) return;
    setArticles(prev => prev.filter(art => art.id !== deleteConfirmArticleId));
    showToast('Article deleted successfully.', 'success');
    if (selectedArticleId === deleteConfirmArticleId) {
      setSelectedArticleId('');
    }
    setDeleteConfirmArticleId(null);
  };

  // Integration helper to copy standard resolutions into tickets
  const handleInsertResolution = (content: string) => {
    if (!activeTicketId) {
      showToast('No active ticket selected. Select a ticket in the Workspace first.', 'info');
      return;
    }
    setCommentText(prev => prev ? prev + '\n' + content : content);
    setActiveTab('tickets');
    showToast('Resolution playbook injected into your active ticket response box!', 'success');
  };

  const categoryOptions = [
    { value: 'ALL', label: 'All Categories' },
    { value: 'Playbook', label: 'Playbook' },
    { value: 'Resolution', label: 'Resolution' },
    { value: 'Known Issue', label: 'Known Issue' },
  ];

  const providerOptions = [
    { value: 'ALL', label: 'All Gateways' },
    { value: 'Parkway', label: 'Parkway' },
    { value: 'PayPal', label: 'PayPal' },
    { value: 'Adyen', label: 'Adyen' },
    { value: 'Braintree', label: 'Braintree' },
    { value: 'General', label: 'General' },
  ];

  const formCategoryOptions = [
    { value: 'Playbook', label: 'Playbook (Troubleshooting Guides)' },
    { value: 'Resolution', label: 'Resolution (Standard Responses)' },
    { value: 'Known Issue', label: 'Known Issue (Gateway Fluctuation Logging)' },
  ];

  const formProviderOptions = [
    { value: 'General', label: 'General (Cross-Gateway)' },
    { value: 'Parkway', label: 'Parkway' },
    { value: 'PayPal', label: 'PayPal' },
    { value: 'Adyen', label: 'Adyen' },
    { value: 'Braintree', label: 'Braintree' },
  ];

  return (
    <div className="flex flex-col h-full bg-surface text-text-primary">
      
      {/* KB Sub-header Banner */}
      <div className="bg-surface-elevated p-6 border-b border-border-subtle shadow-sm shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-xl text-text-primary tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" />
            Corporate Knowledge & Resolution Repository
          </h3>
          <p className="text-xs text-text-muted">Complaint playbooks, known provider issues, and approved mitigation paths</p>
        </div>
        {['SUPER_ADMIN', 'BU_SUPPORT'].includes(currentRole) && (
          <Button
            onClick={() => {
              setEditingArticleId(null);
              setFormState({ title: '', category: 'Playbook', provider: 'General', content: '', tags: [] });
              setTagInput('');
              setIsFormOpen(true);
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            Publish Article
          </Button>
        )}
      </div>

      {/* Main Multi-Pane Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left pane: Filter list */}
        <div className={`${showMobileList ? 'fixed inset-0 z-30 flex' : 'hidden'} lg:flex w-96 border-r border-border-subtle bg-surface-elevated flex-col h-full shrink-0`}>
          {showMobileList && (
            <div className="fixed inset-0 bg-overlay z-30 lg:hidden" onClick={() => setShowMobileList(false)} role="presentation" aria-hidden="true" />
          )}
          <div className={`${showMobileList ? 'relative z-40' : ''} flex flex-col h-full w-96 bg-surface-elevated`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle lg:hidden shrink-0">
            <span className="text-xs font-bold text-text-primary flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-accent" /> Knowledge Base</span>
            <button onClick={() => setShowMobileList(false)} className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors focus-ring" aria-label="Close article list">&times;</button>
          </div>
          {/* Search bar */}
          <div className="p-4 border-b border-border-subtle space-y-3 shrink-0">
            <Input
              placeholder="Search known issues, playbooks, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />

            {/* Filter Pills */}
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={categoryOptions}
              />
              <Select
                label="Provider"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                options={providerOptions}
              />
            </div>
          </div>

          {/* List scrollarea */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {filteredArticles.length > 0 ? (
              filteredArticles.map(art => {
                const isSelected = activeArticle?.id === art.id;
                return (
                  <button
                    key={art.id}
                    onClick={() => {
                      setSelectedArticleId(art.id);
                      setIsFormOpen(false);
                      setShowMobileList(false);
                    }}
                    className={`w-full text-left p-4 transition ${
                      isSelected ? 'bg-accent/10 border-l-4 border-accent' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant={
                        art.category === 'Playbook' ? 'warning' :
                        art.category === 'Resolution' ? 'success' : 'neutral'
                      } size="sm">
                        {art.category}
                      </Badge>
                      <span className="text-xs text-text-muted font-mono">{art.lastUpdated}</span>
                    </div>
                    <h4 className="font-bold text-xs text-text-primary leading-snug line-clamp-2">{art.title}</h4>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-xs bg-surface-hover text-text-secondary font-bold font-mono px-1.5 py-0.5 rounded">
                        {art.provider}
                      </span>
                      <p className="text-xs text-text-muted font-medium truncate flex-1">
                        {art.tags.join(', ')}
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-4 sm:p-8 text-center text-text-muted text-xs">
                No articles matches your filters.
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Right pane: Article content / Create & Edit Form */}
        <div className="flex-1 bg-surface-elevated overflow-y-auto">
          <button onClick={() => setShowMobileList(true)} className="lg:hidden sticky top-0 z-10 w-full flex items-center gap-1.5 px-4 py-2.5 bg-surface-elevated border-b border-border-subtle text-xs font-semibold text-text-muted hover:text-text-primary transition focus-ring">
            <ChevronLeft className="w-4 h-4" /> Articles
          </button>
          {isFormOpen ? (
            /* PUBLISH / EDIT FORM */
            <div className="p-4 sm:p-8 max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-base text-text-primary">
                  {editingArticleId ? 'Edit Knowledge Article' : 'Publish Knowledge Article'}
                </h3>
                <button onClick={() => { setIsFormOpen(false); setKbFormErrors({}); }} className="text-text-muted hover:text-text-secondary text-xs font-bold cursor-pointer">
                  Cancel Form
                </button>
              </div>

              <form onSubmit={handleSaveArticle} className="space-y-6">
                <Input
                  label="Article Title"
                  value={formState.title}
                  onChange={(e) => { setFormState(prev => ({ ...prev, title: e.target.value })); clearKbError('title'); }}
                  placeholder="e.g. Parkway Gateway 504 Timeout Remediation Playbook"
                  error={kbFormErrors.title}
                  required
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Category Classification"
                    value={formState.category}
                    onChange={(e) => setFormState(prev => ({ ...prev, category: e.target.value as KbArticle['category'] }))}
                    options={formCategoryOptions}
                  />
                  <Select
                    label="Target Payment Partner"
                    value={formState.provider}
                    onChange={(e) => setFormState(prev => ({ ...prev, provider: e.target.value }))}
                    options={formProviderOptions}
                  />
                </div>

                <Input
                  label="Tags (Comma-separated)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="e.g. timeout, parkway, duplicate, refund, gateway-error"
                />

                <Textarea
                  label="Document Content (Approved Resolution Procedures)"
                  value={formState.content}
                  onChange={(e) => { setFormState(prev => ({ ...prev, content: e.target.value })); clearKbError('content'); }}
                  rows={12}
                  placeholder="Write detailed remediation guidelines. Support plaintext bullet points or structured procedures..."
                  error={kbFormErrors.content}
                  required
                />

                <Button type="submit" className="w-full" size="lg">
                  {editingArticleId ? 'Commit Update to KB' : 'Publish Article to Control Desk'}
                </Button>
              </form>
            </div>
          ) : activeArticle ? (
            /* DETAILED VIEW */
            <div className="p-4 sm:p-8 max-w-3xl">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Badge variant={
                    activeArticle.category === 'Playbook' ? 'warning' :
                    activeArticle.category === 'Resolution' ? 'success' : 'neutral'
                  } size="sm">
                    {activeArticle.category}
                  </Badge>
                  <span className="text-xs bg-surface-hover text-text-secondary px-2 py-0.5 rounded font-bold font-mono">
                    Provider: {activeArticle.provider}
                  </span>
                </div>
                
                {/* Edit/Delete Actions */}
                {['SUPER_ADMIN', 'BU_SUPPORT'].includes(currentRole) && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleEditArticle(activeArticle)}
                      className="text-text-muted hover:text-accent p-1.5 rounded hover:bg-surface-hover transition cursor-pointer"
                      title="Edit Article"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteArticle(activeArticle.id)}
                      className="text-text-muted hover:text-error p-1.5 rounded hover:bg-surface-hover transition cursor-pointer"
                      title="Delete Article"
                      aria-label="Delete article"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <h2 className="text-xl font-bold text-text-primary mb-2 leading-snug tracking-tight">
                {activeArticle.title}
              </h2>

              <div className="flex items-center gap-4 text-xs text-text-muted mb-6 border-b border-border-subtle pb-4 font-semibold">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Last Updated: {activeArticle.lastUpdated}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  Authorized Author: Operational Admin
                </span>
              </div>

              {/* ARTICLE BODY */}
              <div className="text-xs text-text-primary leading-relaxed space-y-4 font-medium whitespace-pre-wrap">
                {activeArticle.content}
              </div>

              {/* TAGS */}
              {activeArticle.tags.length > 0 && (
                <div className="mt-8 pt-4 border-t border-border-subtle flex flex-wrap gap-1">
                  {activeArticle.tags.map(tag => (
                    <span key={tag} className="bg-surface text-text-muted px-2.5 py-1 rounded text-xs font-bold">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* INTEGRATION INJECTION CONTROL CARD */}
              {activeTicketId && (
                <div className="mt-8 bg-accent/10 border border-accent/20 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary-light rounded-full flex items-center justify-center text-accent">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-accent-dark uppercase tracking-wide">Live Workflow Ingress</h4>
                      <p className="text-xs text-accent-light font-semibold">You have ticket <span className="font-mono font-bold text-text-primary">{activeTicketId}</span> active in your workspace.</p>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary leading-tight">
                    Quickly inject this playbook resolution guideline into your active ticket response draft to resolve the dispute.
                  </p>
                  <Button
                    onClick={() => handleInsertResolution(activeArticle.content)}
                    size="sm"
                    icon={<Clipboard className="w-3.5 h-3.5" />}
                  >
                    Inject Playbook to Response Draft
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-text-muted text-xs italic p-6">
              <p>Select an article on the left to read.</p>
              <button onClick={() => setShowMobileList(true)} className="lg:hidden mt-4 not-italic flex items-center gap-1.5 px-4 py-2 bg-surface-elevated border border-border-subtle rounded-lg text-xs font-semibold text-text-primary hover:bg-surface-hover transition cursor-pointer"><BookOpen className="w-3.5 h-3.5" /> Browse Articles</button>
            </div>
          )}
        </div>

      </div>

      <ConfirmModal
        isOpen={!!deleteConfirmArticleId}
        onClose={() => setDeleteConfirmArticleId(null)}
        onConfirm={confirmDeleteArticle}
        title="Delete Article"
        message="Are you sure you want to delete this Knowledge Base article? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />

    </div>
  );
}

export default memo(KnowledgeBaseTab);
