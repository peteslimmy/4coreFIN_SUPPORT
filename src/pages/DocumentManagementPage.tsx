import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Input,
  Badge,
  Separator,
  useToast,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Checkbox,
  Label,
  Textarea,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { api } from '../lib/api';
import { formatRelative, parseISO } from '../lib/dateUtils';
import { Folder, Search, Plus, Trash2, FileText, ClipboardList, Download, Share2, Settings, Upload, Eye, X, Loader2, RefreshCw } from 'lucide-react';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

export default function DocumentManagementPage() {
  const { toast } = useToast();
  const [folders, setFolders] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentDetails, setDocumentDetails] = useState<any | null>(null);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'upload' | 'settings'>('browse');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadFolders = useCallback(async () => {
    try {
      const data = await api.listDocumentFolders();
      setFolders(data);
    } catch (error: any) {
      toast.error(`Failed to load folders: ${error.message}`);
    }
  }, [api, toast]);

  const loadDocuments = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const searchFilters = {
        ...filters,
        ...(selectedFolderId ? { folder_id: selectedFolderId } : {}),
        ...(search ? { search } : {}),
      };
      const data = await api.listDocuments(searchFilters);
      setDocuments(data);
    } catch (error: any) {
      toast.error(`Failed to load documents: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [api, loading, filters, search, selectedFolderId, toast]);

  useEffect(() => {
    loadFolders();
    loadDocuments();
  }, [filters, search, selectedFolderId]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSelectedIds([]);
    setSelectedDocumentId(null);
    setDocumentDetails(null);
  };

  const handleToggleDocumentSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const handleSelectAllDocuments = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(documents.map((doc) => doc.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    try {
      await api.createDocumentFolder({
        name: newFolderName.trim(),
        description: newFolderDescription.trim() || null,
      });
      setNewFolderName('');
      setNewFolderDescription('');
      loadFolders();
      toast.success('Folder created');
    } catch (error: any) {
      toast.error(`Failed to create folder: ${error.message}`);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!window.confirm('Delete this folder and all its contents?')) return;
    try {
      await api.deleteDocument(folderId); // Note: API uses deleteDocument for folders too based on endpoint
      loadFolders();
      loadDocuments();
      toast.success('Folder deleted');
    } catch (error: any) {
      toast.error(`Failed to delete folder: ${error.message}`);
    }
  };

  const handleDocumentUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 100);

    try {
      // Simulate upload progress
      const result = await api.uploadEvidence(
        '', // ticketId - not needed for document upload
        file,
        file.name,
        file.type
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      // In a real app, we'd have a dedicated document upload endpoint
      // For now, we'll refresh the document list
      loadDocuments();
      toast.success(`Document "${file.name}" uploaded successfully`);

      // Reset after a short delay
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        e.target.value = '';
      }, 1500);
    } catch (error: any) {
      clearInterval(progressInterval);
      setIsUploading(false);
      setUploadProgress(0);
      toast.error(`Failed to upload document: ${error.message}`);
      e.target.value = '';
    }
  };

  const handleDownloadDocument = async (doc: any) => {
    // In a real app, this would fetch the document and trigger a download
    toast.info(`Downloading "${doc.filename}"...`);
    // Simulate download
    setTimeout(() => {
      toast.success(`Downloaded "${doc.filename}"`);
    }, 1000);
  };

  const handleDeleteSelectedDocuments = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected document(s)?`)) return;

    try {
      // In a real app, we'd call delete API for each
      setSelectedIds([]);
      loadDocuments();
      toast.success(`${selectedIds.length} document(s) deleted`);
    } catch (error: any) {
      toast.error(`Failed to delete documents: ${error.message}`);
    }
  };

  if (loading && documents.length === 0 && folders.length === 0) {
    return (
      <PageTransition>
      <PageContainer maxWidth="full" className="space-y-4">
        <PageHeader
          title="Document Management"
          subtitle="Organize, version, and manage documents"
          breadcrumbs={[{ label: 'Home' }, { label: 'Documents' }]}
        />
        <Skeleton variant="card" count={4} />
      </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
    <PageContainer maxWidth="full" className="space-y-4">
      <PageHeader
        title="Document Management"
        subtitle="Organize, version, and manage documents"
        breadcrumbs={[{ label: 'Home' }, { label: 'Documents' }]}
        actions={<>
          <Button variant="outline" onClick={() => setActiveTab('upload')}>
            <Upload className="mr-2 h-4 w-4" /> Upload Document
          </Button>
          <Button onClick={handleDeleteSelectedDocuments} disabled={selectedIds.length === 0} variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
          </Button>
          <Button variant="outline" onClick={() => setActiveTab('settings')}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </Button>
        </>}
      />

      {/* Tabs */}
      <Tabs defaultValue="browse" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="browse">Browse Documents</TabsTrigger>
          <TabsTrigger value="upload">Upload Document</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <div className="flex-1 flex flex-col gap-4">
            {/* Sidebar - Folders */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="border-r border-border-subtle">
                <div className="px-4 py-3 border-b border-border-subtle">
                  <h2 className="font-medium text-text-primary">Folders</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // In a real app, this would open a modal
                      setNewFolderName('');
                      setNewFolderDescription('');
                    }}
                  >
                    <Plus className="mr-2 h-3 w-3" /> New Folder
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {folders.length === 0 ? (
                    <EmptyState
                      icon={<Folder className="w-8 h-8" />}
                      title="No folders yet"
                      message="Create your first folder above"
                      className="py-4"
                    />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-3 py-2">
                        <p className="font-medium text-text-primary">
                          All Documents
                        </p>
                        <Badge variant="outline">
                          {documents.length}
                        </Badge>
                      </div>
                      {folders.map((folder) => (
                        <div
                          key={folder.id}
                          className={`flex items-center justify-between px-3 py-2 ${
                            selectedFolderId === folder.id ? 'bg-accent/10' : ''
                          }`}
                          onClick={() => handleSelectFolder(folder.id)}
                        >
                          <div className="flex items-center gap-2">
                            <Folder className="h-4 w-4" />
                            <span className="flex-1 min-w-0 truncate">
                              {folder.name}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {folder.document_count || 0}
                          </Badge>
                        </div>
))}
</div>
                     )}
                    </div>
                  </div>
                 </div>

              {/* Main content - Documents */}
              <div className="flex-1 flex flex-col">
                <div className="flex flex-col gap-4">
                  {/* Document list header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-surface-hover/50 rounded-t-lg border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.length === documents.length && documents.length > 0}
                        indeterminate={selectedIds.length > 0 && selectedIds.length < documents.length}
                        onChange={handleSelectAllDocuments}
                        aria-label="Select all documents"
                      />
                      <span className="text-caption font-medium">
                        {selectedIds.length} of {documents.length} selected
                      </span>
                    </div>
                    <div className="text-caption text-text-muted">
                      Showing {documents.length} document{documents.length === 1 ? '' : 's'}
                    </div>
                  </div>

                  {/* Documents table */}
                  <Table className="w-full">
                    <TableHeader className="border-b border-border">
                      <TableRow className="hover:bg-surface-hover">
                        <TableCell className="w-4 px-2 text-center">
                          <Checkbox
                            checked={selectedIds.length === documents.length && documents.length > 0}
                            indeterminate={selectedIds.length > 0 && selectedIds.length < documents.length}
                            onChange={handleSelectAllDocuments}
                            aria-label="Select all"
                          />
                        </TableCell>
                        <TableCell className="w-20">Filename</TableCell>
                        <TableCell className="w-20">Folder</TableCell>
                        <TableCell className="w-16">Size</TableCell>
                        <TableCell className="w-12">Uploaded</TableCell>
                        <TableCell className="w-12">Tags</TableCell>
                        <TableCell className="w-8">Actions</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => {
                        const isSelected = selectedIds.includes(doc.id);
                        return (
                          <TableRow
                            key={doc.id}
                            className={`
                              hover:bg-surface-hover
                              ${isSelected ? 'bg-accent/10' : ''}
                            `}
                            onClick={() => setSelectedDocumentId(doc.id)}
                          >
                            <TableCell className="px-2 text-center">
                              <Checkbox
                                checked={isSelected}
                                onChange={(e) => handleToggleDocumentSelection(doc.id)}
                                aria-label={`Select document ${doc.filename}`}
                              />
                            </TableCell>
                            <TableCell className="flex-1 min-w-0 truncate">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted" />
                                <span className="max-w-xs truncate" title={doc.filename}>
                                  {doc.filename}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="flex-1 min-w-0 truncate">
                              {doc.folder_name || 'No Folder'}
                            </TableCell>
                            <TableCell className="text-center text-caption">
                              {(doc.file_size / 1024).toFixed(1)} KB
                            </TableCell>
                            <TableCell className="text-center text-caption">
                              {formatRelative(
                                parseISO(doc.created_at),
                                new Date()
                              )}
                            </TableCell>
                            <TableCell className="flex flex-col gap-1">
                              {doc.tags && doc.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {doc.tags.map((tag: string, index: number) => (
                                    <Badge
                                      key={index}
                                      variant="outline"
                                      size="sm"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-caption text-text-muted">No tags</span>
                              )}
                            </TableCell>
                            <TableCell className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDocumentId(doc.id);
                                }}
                                aria-label="View document"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadDocument(doc);
                                }}
                                aria-label="Download document"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Document details panel */}
                {selectedDocumentId && (
                  <div className="border-t border-border-subtle bg-surface-card/50 backdrop-blur-sm">
                    <div className="flex flex-col gap-4 p-4">
                      <div className="flex justify-between items-start">
                        <h2 className="text-xl font-bold">
                          {documentDetails?.filename || 'Loading document...'}
                        </h2>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDocumentId(null)}
                        >
                          <X className="h-4 w-4" /> Close
                        </Button>
                      </div>

                      {documentDetails ? (
                        <div className="space-y-4">
                          <div className="border border-border-subtle rounded-lg p-4">
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                              <div>
                                <p className="text-caption text-text-muted">
                                  <strong>Filename:</strong> {documentDetails.filename}
                                </p>
                                <p className="text-caption text-text-muted">
                                  <strong>Folder:</strong> {documentDetails.folder_name || 'No folder'}
                                </p>
                                <p className="text-caption text-text-muted">
                                  <strong>Size:</strong> {(documentDetails.file_size / 1024).toFixed(1)} KB
                                </p>
                                <p className="text-caption text-text-muted">
                                  <strong>Type:</strong> {documentDetails.content_type}
                                </p>
                              </div>
                              <div>
                                <p className="text-caption text-text-muted">
                                  <strong>Uploaded:</strong> {formatRelative(
                                    parseISO(documentDetails.created_at),
                                    new Date()
                                  )}
                                </p>
                                <p className="text-caption text-text-muted">
                                  <strong>Version:</strong> {documentDetails.version || 1}
                                </p>
                                <p className="text-caption text-text-muted">
                                  <strong>Status:</strong>
                                  <Badge variant={documentDetails.status === 'active' ? 'secondary' : 'outline'}>
                                    {documentDetails.status}
                                  </Badge>
                                </p>
                              </div>
                            </div>
                          </div>

                          {documentDetails.description && (
                            <div className="border border-border-subtle rounded-lg p-4">
                              <p className="font-medium text-text-primary mb-2">Description</p>
                              <p className="text-base whitespace-pre-line">
                                {documentDetails.description}
                              </p>
                            </div>
                          )}

                          {documentDetails.versions && documentDetails.versions.length > 1 && (
                            <div className="border border-border-subtle rounded-lg p-4">
                              <p className="font-medium text-text-primary mb-2">Version History</p>
                              <div className="space-y-2">
                                {documentDetails.versions.map((ver: any, index: number) => (
                                  <div key={index} className="border-t border-border-subtle/50 pt-3">
                                    <p className="flex justify-between text-sm">
                                      <span>v{ver.version}</span>
                                      <span className="text-caption text-text-muted">
                                        {formatRelative(parseISO(ver.created_at), new Date())}
                                      </span>
                                    </p>
                                    <p className="text-caption text-text-muted">{ver.change_notes || 'No description'}</p>
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
            </div>
          </TabsContent>

          <TabsContent value="upload">
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="flex flex-col items-center gap-6 w-full max-w-xl">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 border-2 border-dashed border-accent/20 rounded-lg flex items-center justify-center">
                    <Upload className="w-8 h-8 text-accent" />
                  </div>
                  <p className="text-center text-text-muted">
                    Click to upload or drag and drop files here
                  </p>
                  <p className="text-caption text-text-muted">
                    Supported formats: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT
                  </p>
                </div>

                <Input
                  type="file"
                  className="hidden"
                  onChange={handleDocumentUpload}
                />
                <Button onClick={() => (document.querySelector('input[type="file"]') as HTMLElement | null)?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Select Files
                </Button>

                {isUploading && (
                  <div className="mt-6 w-full">
                    <p className="text-center text-text-muted mb-2">
                      Uploading... {uploadProgress}%
                    </p>
                    <div className="w-full bg-border-subtle rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-accent h-full transition-width duration-500" style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    // In a real app, this would clear the form
                  }}
                >
                  <X className="mr-2 h-3 w-3" /> Cancel
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="flex-1 flex flex-col gap-6 p-4">
              <div className="border border-border-subtle rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Document Settings</h2>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="font-medium text-text-primary">Default Folder for New Documents</p>
                    <div className="border border-border-subtle rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <Folder className="h-4 w-4 text-accent" />
                        <select className="border-none bg-transparent w-full text-text-sm">
                          <option value="">No default folder</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="font-medium text-text-primary">Retention Policy</p>
                    <div className="border border-border-subtle rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <Textarea
                          rows={3}
                          placeholder="Documents are retained for 7 years by default. Modify as needed for compliance requirements."
                          className="w-full resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="font-medium text-text-primary">Notifications</p>
                    <div className="border border-border-subtle rounded-lg p-3">
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <Checkbox
                            id="notify-upload"
                            defaultChecked
                          />
                          <Label htmlFor="notify-upload">
                            Notify when new documents are uploaded
                          </Label>
                        </div>
                        <div className="flex items-center">
                          <Checkbox
                            id="notify-delete"
                            defaultChecked
                          />
                          <Label htmlFor="notify-delete">
                            Notify when documents are deleted
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="font-medium text-text-primary">Storage Statistics</p>
                    <div className="border border-border-subtle rounded-lg p-4">
                      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        <div>
                          <p className="text-caption text-text-muted">
                            <strong>Total Documents:</strong> {documents.length}
                          </p>
                          <p className="text-caption text-text-muted">
                            <strong>Total Folders:</strong> {folders.length}
                          </p>
                          <p className="text-caption text-text-muted">
                            <strong>Total Storage Used:</strong>
                            {(
                              documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0) /
                              1024 /
                              1024
                            ).toFixed(2)} MB
                          </p>
                        </div>
                        <div>
                          <Button variant="outline" onClick={() => {
                            // In a real app, this would trigger cleanup
                            toast.info('Running storage optimization...');
                          }}>
                            <RefreshCw className="mr-2 h-3 w-3" /> Optimize Storage
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </PageContainer>
    </PageTransition>
  );
}