import React from 'react';
import { Bell } from 'lucide-react';
import type { WatcherNotification, CommentRecord, AuditLog, MajorIncidentRecord, TicketRecord } from '../types/app';
import { useApp } from '../context/AppContext';
import { syncNotificationRead } from '../lib/sync';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

interface WatcherNotificationsPageProps {
  watcherNotifications: WatcherNotification[];
  currentUser: { firstName: string; lastName: string; email: string; bu: string };
  tickets: TicketRecord[];
  comments: CommentRecord[];
  auditLogs: AuditLog[];
  majorIncidents: MajorIncidentRecord[];
  setWatcherNotifications: React.Dispatch<React.SetStateAction<WatcherNotification[]>>;
  saveToStorage: (t?: TicketRecord[], c?: CommentRecord[], a?: AuditLog[], m?: MajorIncidentRecord[], wn?: WatcherNotification[]) => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  setActiveTicketId: (id: string) => void;
  setActiveTab: (tab: string) => void;
}

export default function WatcherNotificationsPage({
  watcherNotifications, currentUser, tickets, comments, auditLogs, majorIncidents,
  setWatcherNotifications, saveToStorage, showToast, setActiveTicketId, setActiveTab
}: WatcherNotificationsPageProps) {
  const { isLoading } = useApp();
  const userNotifs = watcherNotifications.filter(n => n.recipient.toLowerCase() === currentUser.email.toLowerCase());
  const unreadCount = userNotifs.filter(n => !n.seen).length;
  const watchingCount = tickets.filter(t => (t.watchers || []).includes(currentUser.email)).length;

  return (
    <PageTransition>
      <PageContainer maxWidth="full" className="space-y-6">
        <PageHeader
          title="Watcher Operational Alerts Feed"
          subtitle="Real-time automated compliance alerts for cases you are watching or collaborating on"
          breadcrumbs={[{ label: 'Home' }, { label: 'Compliance' }, { label: 'Watcher Alerts' }]}
          actions={
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  const updatedWN = watcherNotifications.map(n =>
                    n.recipient.toLowerCase() === currentUser.email.toLowerCase()
                      ? { ...n, seen: true }
                      : n
                  );
                  setWatcherNotifications(updatedWN);
                  saveToStorage(tickets, comments, auditLogs, majorIncidents, updatedWN);
                  updatedWN.forEach(n => { if (n.seen) syncNotificationRead(n.id); });
                  showToast('All notifications marked as read.', 'success');
                }}
                className="px-3 py-1.5 bg-surface hover:bg-surface-hover text-text-primary text-caption font-semibold rounded-lg transition border border-border cursor-pointer"
              >
                Mark All as Read
              </button>
              <button
                onClick={() => {
                  const updatedWN = watcherNotifications.filter(n =>
                    n.recipient.toLowerCase() !== currentUser.email.toLowerCase()
                  );
                  setWatcherNotifications(updatedWN);
                  saveToStorage(tickets, comments, auditLogs, majorIncidents, updatedWN);
                  showToast('Your notification feed cleared.', 'info');
                }}
                className="px-3 py-1.5 bg-error-light hover:bg-error/15 text-error text-caption font-semibold rounded-lg transition border border-error/20 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <Skeleton variant="card" count={3} />
          </>
        ) : (
          <>
            <div className="bg-surface-elevated shadow-card p-5 rounded-xl">
              <p className="text-overline text-text-muted font-bold uppercase tracking-wider">Total Alerts</p>
              <p className="text-xl font-bold text-text-primary mt-1">{userNotifs.length}</p>
            </div>
            <div className="bg-surface-elevated shadow-card p-5 rounded-xl">
              <p className="text-overline text-text-muted font-bold uppercase tracking-wider">Unread Alerts</p>
              <p className="text-xl font-bold text-accent mt-1 flex items-center gap-2">
                {unreadCount}
                {unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
              </p>
            </div>
            <div className="bg-surface-elevated shadow-card p-5 rounded-xl">
              <p className="text-overline text-text-muted font-bold uppercase tracking-wider">Watching Cases</p>
              <p className="text-xl font-bold text-success mt-1">{watchingCount}</p>
            </div>
          </>
        )}
      </div>

      <div className="bg-surface-elevated shadow-card p-5 rounded-xl">
        {isLoading ? (
          <Skeleton variant="table-row" count={4} />
        ) : userNotifs.length === 0 ? (
          <EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications yet" message="Add yourself as a watcher on active cases to see updates here." />
        ) : (
          <div className="space-y-3">
            {userNotifs.map((notif) => (
              <button
                key={notif.id}
                type="button"
                className={`flex w-full text-left gap-4 p-4 rounded-lg text-caption border items-start transition hover:shadow-sm cursor-pointer ${
                  notif.seen
                    ? 'bg-surface border-border/30'
                    : 'bg-info-light border-border/30 ring-1 ring-accent/5'
                }`}
                onClick={() => {
                  const updatedWN = watcherNotifications.map(n =>
                    n.id === notif.id ? { ...n, seen: true } : n
                  );
                  setWatcherNotifications(updatedWN);
                  saveToStorage(tickets, comments, auditLogs, majorIncidents, updatedWN);
                  syncNotificationRead(notif.id);
                  setActiveTicketId(notif.ticketId);
                  setActiveTab('tickets');
                }}
              >
                <div className={`p-2 rounded-full shrink-0 ${notif.seen ? 'bg-surface text-text-muted' : 'bg-info-light text-info'}`}>
                  <Bell className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-body-sm mb-1 ${notif.seen ? 'text-text-secondary' : 'text-text-primary font-semibold'}`}>{notif.message}</p>
                  <p className="text-overline text-text-muted">
                    {new Date(notif.timestamp).toLocaleString()} • #{notif.ticketId}
                  </p>
                </div>
                {!notif.seen && <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />}
              </button>
            ))}
          </div>
        )}
      </div>
      </PageContainer>
    </PageTransition>
  );
}
