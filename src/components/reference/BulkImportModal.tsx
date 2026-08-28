import { useRef, useState } from 'react';
import { Upload, Download, FileUp, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useApp } from '../../context/AppContext';
import type { ReferenceKindDef } from '../../types/reference';
import type { BulkImportError, BulkPrepareResult } from '../../lib/bulkImport';
import { parseUploadFile, prepareRows, createBulkRow, bulkImportTemplate } from '../../lib/bulkImport';

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
  kind: ReferenceKindDef;
  existingItems: unknown[];
  onCompleted: () => void;
}

type Phase = 'pick' | 'preview' | 'uploading' | 'done';

interface RunResult {
  created: number;
  failed: BulkImportError[];
}

const MAX_PREVIEW_ERRORS = 20;

function ErrorList({ title, errors, accent }: { title: string; errors: BulkImportError[]; accent: 'error' | 'warning' }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded-lg border border-border p-3 space-y-1">
      <p className={`text-xs font-semibold ${accent === 'error' ? 'text-error' : 'text-warning'}`}>
        {title} ({errors.length})
      </p>
      <ul className="space-y-1">
        {(errors.length > MAX_PREVIEW_ERRORS ? errors.slice(0, MAX_PREVIEW_ERRORS) : errors).map((e, i) => (
          <li key={i} className="text-xs text-text-muted flex gap-1.5">
            <span className="text-text-muted/70 shrink-0">{e.row > 0 ? `Row ${e.row}:` : ''}</span>
            <span>{e.message}</span>
          </li>
        ))}
        {errors.length > MAX_PREVIEW_ERRORS && (
          <li className="text-xs text-text-muted">… and {errors.length - MAX_PREVIEW_ERRORS} more</li>
        )}
      </ul>
    </div>
  );
}

export default function BulkImportModal({ open, onClose, kind, existingItems, onCompleted }: BulkImportModalProps) {
  const { showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<BulkPrepareResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<RunResult | null>(null);

  // Reset the pick/preview flow each time the modal reopens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPhase('pick');
      setFileName('');
      setParsed(null);
      setProgress({ done: 0, total: 0 });
      setResults(null);
    }
  }

  const handleFile = async (file: File | undefined, input: HTMLInputElement | null) => {
    if (!file) return;
    setFileName(file.name);
    const parsedFile = await parseUploadFile(file);
    const prepared = prepareRows(kind, parsedFile, existingItems);
    setParsed(prepared);
    setPhase('preview');
    if (input) input.value = '';
  };

  const downloadTemplate = () => {
    const csv = bulkImportTemplate(kind);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind.kind}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setPhase('uploading');
    const run: RunResult = { created: 0, failed: [] };
    setResults(run);
    setProgress({ done: 0, total: parsed.rows.length });

    for (let i = 0; i < parsed.rows.length; i += 1) {
      const row = parsed.rows[i];
      try {
        await createBulkRow(kind, row);
        run.created += 1;
      } catch (e) {
        run.failed.push({ row: row.row, message: (e as Error).message || 'Create failed' });
      }
      setProgress({ done: i + 1, total: parsed.rows.length });
    }

    setResults(run);
    setPhase('done');
    if (run.created > 0) {
      showToast(`Imported ${run.created} ${kind.label}${run.created === 1 ? '' : 's'}.`, 'success');
      onCompleted();
    }
  };

  const validRows = parsed?.rows.length ?? 0;
  const duplicateCount = parsed?.duplicates.length ?? 0;
  const errorCount = parsed?.errors.length ?? 0;

  const footer = (
    <div className="flex justify-end gap-3 w-full">
      {phase === 'pick' && (
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" size="md" icon={<Download className="w-4 h-4" />} onClick={downloadTemplate}>
            Download template
          </Button>
        </>
      )}
      {phase === 'preview' && (
        <>
          <Button variant="secondary" size="md" onClick={() => setPhase('pick')}>Back</Button>
          <Button variant="secondary" size="md" icon={<Download className="w-4 h-4" />} onClick={downloadTemplate}>
            Download template
          </Button>
          <Button size="md" disabled={validRows === 0} onClick={runImport}>
            Import {validRows > 0 ? `${validRows} ` : ''}rows
          </Button>
        </>
      )}
      {phase === 'uploading' && (
        <Button size="md" disabled loading>Importing…</Button>
      )}
      {phase === 'done' && (
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Close</Button>
          <Button size="md" onClick={downloadTemplate}>Download template</Button>
        </>
      )}
    </div>
  );

  return (
    <Modal open={open} onClose={phase === 'uploading' ? () => {} : onClose} title={`Import ${kind.labelPlural}`} size="lg" footer={footer}>
      <div className="space-y-4">
        {phase === 'pick' && (
          <>
            <p className="text-sm text-text-muted">
              Upload a <span className="font-semibold text-text-primary">.csv</span> or <span className="font-semibold text-text-primary">.xlsx</span>{' '}
              file with one {kind.label.toLowerCase()} per row. Duplicates and invalid rows are skipped and reported — nothing else is changed.
            </p>
            <label
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-elevated/50 px-6 py-10 cursor-pointer hover:bg-surface-hover/40 transition-colors focus-ring"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => void handleFile(e.target.files?.[0], fileInputRef.current)}
              />
              <FileUp className="w-8 h-8 text-text-muted" />
              <span className="text-sm font-medium text-text-primary">Choose a spreadsheet</span>
              <span className="text-xs text-text-muted">.csv, .xlsx or .xls — max 2 MB</span>
            </label>
          </>
        )}

        {fileName && phase !== 'pick' && (
          <div className="rounded-lg border border-border bg-surface-elevated p-3 flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4 text-text-muted shrink-0" />
            <span className="font-medium text-text-primary truncate">{fileName}</span>
            <span className="text-xs text-text-muted ml-auto shrink-0">{validRows} ready</span>
          </div>
        )}

        {phase === 'preview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <div>
                  <p className="text-lg font-bold text-text-primary leading-none">{validRows}</p>
                  <p className="text-xs text-text-muted">Ready to import</p>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-warning" />
                <div>
                  <p className="text-lg font-bold text-text-primary leading-none">{duplicateCount}</p>
                  <p className="text-xs text-text-muted">Duplicates</p>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-error" />
                <div>
                  <p className="text-lg font-bold text-text-primary leading-none">{errorCount}</p>
                  <p className="text-xs text-text-muted">Invalid rows</p>
                </div>
              </div>
            </div>
            <ErrorList title="Invalid rows (skipped)" errors={parsed?.errors ?? []} accent="error" />
            <ErrorList title="Duplicates (skipped)" errors={parsed?.duplicates ?? []} accent="warning" />
            {validRows === 0 && (
              <p className="text-sm text-text-muted">No valid rows to import. Fix the rows above or {fileName ? 'choose another file' : 'start again'}.</p>
            )}
          </div>
        )}

        {phase === 'uploading' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Creating {kind.labelPlural.toLowerCase()}…</span>
              <span className="font-medium text-text-primary">{progress.done} / {progress.total}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-150"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-xs text-text-muted">Duplicates and failures are skipped; the rest of the batch continues.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
              <div>
                <p className="text-sm font-bold text-text-primary">
                  {results?.created ?? 0} {results?.created === 1 ? `${kind.label} created` : `${kind.labelPlural} created`}.
                </p>
                <p className="text-xs text-text-muted">The list has been refreshed.</p>
              </div>
            </div>
            <ErrorList title="Rows that failed (nothing was partially written)" errors={results?.failed ?? []} accent="error" />
            {results?.failed.length === 0 && <p className="text-sm text-text-muted">All rows imported successfully.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}