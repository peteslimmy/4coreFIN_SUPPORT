import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Calendar, User, FileImage } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import ConfirmModal from '../ui/ConfirmModal';
import type { ImageVersion } from './types';

interface VersionHistoryTimelineProps {
  imageId: string;
  currentVersion: number;
  onClose: () => void;
  onRollback: () => void;
}

export default function VersionHistoryTimeline({
  imageId,
  currentVersion,
  onClose,
  onRollback,
}: VersionHistoryTimelineProps) {
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState(false);
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const { showToast } = useToast();

   useEffect(() => {
     let isMounted = true;
     const fetchVersions = async () => {
       try {
         setLoading(true);
         const response = await fetch(`/api/landing-page/images/${imageId}/versions`, {
           credentials: 'include',
         });

         if (!response.ok) throw new Error('Failed to fetch versions');

         const data = await response.json();
         if (isMounted) {
           setVersions(data || []);
         }
        } catch (_error) {
          if (isMounted) {
            showToast('Failed to load version history', 'error');
         }
       } finally {
         if (isMounted) {
           setLoading(false);
         }
       }
     };

     fetchVersions();

     return () => {
       isMounted = false;
     };
   }, [imageId, showToast]);

  const handleRollback = async (version: number) => {
    setConfirmVersion(version);
  };

  const confirmRollback = async () => {
    if (confirmVersion === null) return;
    try {
      setRollingBack(true);
      const response = await fetch(`/api/landing-page/images/${imageId}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version: confirmVersion }),
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to rollback');

      onRollback();
    } catch (_error) {
      showToast('Failed to rollback to version', 'error');
    } finally {
      setRollingBack(false);
      setConfirmVersion(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-surface/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-card border border-border-subtle rounded-xl shadow-3 max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Version History</h2>
            <p className="text-sm text-text-secondary mt-1">
              View and rollback to previous versions
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close version history"
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12">
              <FileImage className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-secondary">No version history available</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {versions.map((version, index) => (
                  <motion.div
                    key={version.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className={`relative flex gap-4 p-4 rounded-lg border ${
                      version.version === currentVersion
                        ? 'border-accent bg-accent/5'
                        : 'border-border-subtle bg-surface-hover'
                    }`}
                  >
                    {/* Timeline indicator */}
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        version.version === currentVersion
                          ? 'bg-accent text-[#fff]'
                          : 'bg-surface-card border-2 border-border-subtle'
                      }`}>
                        <span className="text-sm font-bold">v{version.version}</span>
                      </div>
                      {index < versions.length - 1 && (
                        <div className="w-0.5 h-full bg-border-subtle mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-text-primary truncate">
                            {version.file_name}
                          </h3>
                          <p className="text-sm text-text-secondary mt-1">
                            {version.width} × {version.height} • {(version.file_size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          {version.change_summary && (
                            <p className="text-sm text-text-muted mt-2 italic">
                              {version.change_summary}
                            </p>
                          )}
                        </div>

                        {version.version !== currentVersion && (
                          <button
                            onClick={() => handleRollback(version.version)}
                            disabled={rollingBack}
                            className="btn btn-sm btn-secondary flex items-center gap-1 shrink-0"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Rollback
                          </button>
                        )}
                      </div>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(version.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {version.created_by}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border-subtle flex items-center justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </motion.div>
      <ConfirmModal
        isOpen={confirmVersion !== null}
        onClose={() => setConfirmVersion(null)}
        onConfirm={confirmRollback}
        title="Rollback Version"
        message={`Are you sure you want to rollback to version ${confirmVersion}? This action cannot be undone.`}
        confirmLabel="Rollback"
        variant="danger"
      />
    </div>
  );
}