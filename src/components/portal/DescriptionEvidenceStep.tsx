import React from 'react';
import { Upload, FileText, X } from 'lucide-react';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface DescriptionEvidenceStepProps {
  description: string;
  descriptionError?: string;
  uploadedFiles: File[];
  onDescriptionChange: (value: string) => void;
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (index: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function DescriptionEvidenceStep({
  description, descriptionError, uploadedFiles,
  onDescriptionChange, onFilesAdd, onFileRemove, fileInputRef,
}: DescriptionEvidenceStepProps) {
  return (
    <div className="space-y-4">
      <Textarea
        label="Incident Description"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={4}
        placeholder="Please provide explicit details of failed checkout, terminal responses, errors..."
        required
        error={descriptionError}
      />
      <div className="bg-surface p-4 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-text-muted" />
            <span className="font-semibold text-text-secondary">Secure Evidence Upload (PDF, CSV, Images)</span>
          </div>
          <Button type="button" onClick={() => fileInputRef.current?.click()} variant="secondary" size="sm">
            {uploadedFiles.length > 0 ? 'Add Another File' : 'Select Files'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.csv,.png,.jpg,.jpeg,.xlsx"
            className="hidden"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const fileList = e.target.files;
              if (!fileList) return;
              onFilesAdd(Array.from(fileList));
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>
        {uploadedFiles.length > 0 && (
          <div className="space-y-1.5">
            {uploadedFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-surface border border-border rounded px-3 py-1.5 text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate font-medium text-text-primary">{f.name}</span>
                  <span className="text-[10px] text-text-muted shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button type="button" onClick={() => onFileRemove(i)} aria-label={`Remove file ${f.name}`} className="text-text-muted hover:text-error transition cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
