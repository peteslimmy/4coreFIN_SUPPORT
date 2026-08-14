import { useState, useRef } from 'react';
import { Upload, X, Paperclip } from 'lucide-react';

interface FileItem {
  id: string;
  file: File;
  preview: string | null;
  uploading: boolean;
  error?: string;
  url?: string;
}

interface FileUploadProps {
  accept?: string;
  maxSize?: number; // bytes
  multiple?: boolean;
  onUpload: (files: File[]) => Promise<(string | null)[]>;
  currentUrls?: (string | null)[];
  label?: string;
  className?: string;
}

export default function FileUpload({ accept = 'image/*', maxSize = 5 * 1024 * 1024, multiple = false, onUpload, currentUrls, label, className = '' }: FileUploadProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setError('');

    const fileArray = Array.from(selectedFiles);
    const oversized = fileArray.find(f => f.size > maxSize);
    if (oversized) {
      setError(`File too large. Max ${Math.round(maxSize / 1024 / 1024)}MB.`);
      return;
    }

    const newItems: FileItem[] = fileArray.map(f => ({
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      preview: null,
      uploading: false,
    }));

    // Generate previews
    newItems.forEach(item => {
      if (item.file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setFiles(prev => prev.map(p => p.id === item.id ? { ...p, preview: e.target?.result as string } : p));
        };
        reader.readAsDataURL(item.file);
      }
    });

    setFiles(prev => [...prev, ...newItems]);

    // Upload
    setFiles(prev => prev.map(p => newItems.some(n => n.id === p.id) ? { ...p, uploading: true } : p));
    try {
      const urls = await onUpload(fileArray);
      setFiles(prev => prev.map(p => {
        const idx = newItems.findIndex(n => n.id === p.id);
        return idx >= 0 ? { ...p, uploading: false, url: urls[idx] || undefined } : p;
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      setFiles(prev => prev.map(p => newItems.some(n => n.id === p.id) ? { ...p, uploading: false, error: message } : p));
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className={className}>
      {label && <label className="text-xs font-medium text-text-secondary block mb-2">{label}</label>}
      {currentUrls && currentUrls.filter(Boolean).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {currentUrls.filter(Boolean).map((url, i) => (
            <div key={i} className="relative inline-flex">
              <img
                src={url as string}
                alt="Saved asset"
                className="max-h-12 w-auto object-contain rounded-lg border border-border bg-surface-elevated p-1"
              />
              <span className="absolute -top-1.5 -right-1.5 px-1 py-0.5 bg-surface-elevated border border-border-subtle rounded text-[8px] text-text-muted">
                saved
              </span>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-full border-2 border-dashed border-border-subtle rounded-xl p-4 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition"
      >
        {files.length > 0 ? (
          <div className="flex flex-wrap gap-2 justify-center">
            {files.map(f => (
              <div key={f.id} className="relative">
                {f.preview ? (
                  <img src={f.preview} alt={f.file.name} className="max-h-16 w-auto object-contain rounded-lg border border-border bg-surface-elevated p-1" />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center bg-surface rounded-lg border border-border">
                    <Paperclip className="w-5 h-5 text-text-muted" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-error text-white rounded-full flex items-center justify-center text-[9px] shadow-sm hover:bg-error-dark transition"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
                {f.uploading && (
                  <div className="absolute inset-0 bg-surface-elevated/70 rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <p className="text-[9px] text-text-muted mt-0.5 truncate max-w-16">{f.file.name}</p>
              </div>
            ))}
            {multiple && (
              <div className="h-16 w-16 flex items-center justify-center border-2 border-dashed border-border-subtle rounded-lg hover:border-accent/50 transition cursor-pointer">
                <Upload className="w-4 h-4 text-text-muted" />
              </div>
            )}
          </div>
        ) : (
          <div className="py-4">
            <Upload className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-xs text-text-muted">{multiple ? 'Click to upload files' : 'Click to upload or drag and drop'}</p>
            <p className="text-[10px] text-text-muted mt-1">{accept.replace(/\*/g, '').toUpperCase()} up to {Math.round(maxSize / 1024 / 1024)}MB each</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </button>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}
