import { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Label,
  useToast,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  SwitchComponent,
  Skeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Form state
  const [generalPrefs, setGeneralPrefs] = useState({
    emailNotifications: true,
    smsNotifications: false,
    inAppNotifications: true,
    notifyOnAssignment: true,
    notifyOnStatusChange: true,
    notifyOnComment: true,
    notifyOnMention: true,
    digestFrequency: 'immediate',
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '06:00',
  });

  const [emailPrefs, setEmailPrefs] = useState({
    emailEnabled: true,
    notifyOnTicketUpdate: true,
    notifyOnSlaBreach: true,
    notifyOnMajorIncident: true,
    notifyOnSurveyRequest: true,
    emailFrequency: 'real-time',
    includeTicketDetails: true,
    includeAttachments: false,
  });

  const [smsPrefs, setSmsPrefs] = useState({
    smsEnabled: false,
    notifyOnCriticalTickets: true,
    notifyOnMajorIncidents: true,
    notifyOnEscalations: true,
    phoneNumber: '',
    carrier: '',
  });

  const [inAppPrefs, setInAppPrefs] = useState({
    inAppEnabled: true,
    notifyOnTicketUpdate: true,
    notifyOnSlaBreach: true,
    notifyOnMajorIncident: true,
    notifyOnSurveyRequest: true,
    showNotifications: true,
    playSound: true,
    notificationDuration: 5000,
  });

  const [ticketPrefs, setTicketPrefs] = useState({
    ticketNotifications: true,
    notifyOnNewTicket: true,
    notifyOnAssignedTicket: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnCustomerReply: true,
    notifyOnInternalComment: false,
    notifyOnMention: true,
    autoWatchAssigned: true,
    watchFrequency: 'real-time',
  });

  const [systemPrefs, setSystemPrefs] = useState({
    systemAlertsEnabled: true,
    notifyOnMaintenance: true,
    notifyOnDeployments: true,
    notifyOnSystemErrors: true,
    maintenanceWindow: '02:00-04:00',
    errorNotificationThreshold: 5,
  });

  useEffect(() => {
    const loadPreferences = async () => {
      setLoading(true);
      try {
        const data = await api.getNotificationPreferences();
        setPreferences(data as Record<string, unknown>);

        // Initialize form states with loaded data
        setGeneralPrefs({
          emailNotifications: data.email_notifications ?? true,
          smsNotifications: data.sms_notifications ?? false,
          inAppNotifications: data.in_app_notifications ?? true,
          notifyOnAssignment: data.notify_on_assignment ?? true,
          notifyOnStatusChange: data.notify_on_status_change ?? true,
          notifyOnComment: data.notify_on_comment ?? true,
          notifyOnMention: data.notify_on_mention ?? true,
          digestFrequency: data.digest_frequency ?? 'immediate',
          quietHoursEnabled: data.quiet_hours_enabled ?? false,
          quietHoursStart: data.quiet_hours_start ?? '22:00',
          quietHoursEnd: data.quiet_hours_end ?? '06:00',
        });

        setEmailPrefs({
          emailEnabled: data.email_enabled ?? true,
          notifyOnTicketUpdate: data.notify_on_ticket_update ?? true,
          notifyOnSlaBreach: data.notify_on_sla_breach ?? true,
          notifyOnMajorIncident: data.notify_on_major_incident ?? true,
          notifyOnSurveyRequest: data.notify_on_survey_request ?? true,
          emailFrequency: data.email_frequency ?? 'real-time',
          includeTicketDetails: data.include_ticket_details ?? true,
          includeAttachments: data.include_attachments ?? false,
        });

        setSmsPrefs({
          smsEnabled: data.sms_enabled ?? false,
          notifyOnCriticalTickets: data.notify_on_critical_tickets ?? true,
          notifyOnMajorIncidents: data.notify_on_major_incidents ?? true,
          notifyOnEscalations: data.notify_on_escalations ?? true,
          phoneNumber: data.phone_number ?? '',
          carrier: data.carrier ?? '',
        });

        setInAppPrefs({
          inAppEnabled: data.in_app_enabled ?? true,
          notifyOnTicketUpdate: data.notify_on_ticket_update ?? true,
          notifyOnSlaBreach: data.notify_on_sla_breach ?? true,
          notifyOnMajorIncident: data.notify_on_major_incident ?? true,
          notifyOnSurveyRequest: data.notify_on_survey_request ?? true,
          showNotifications: data.show_notifications ?? true,
          playSound: data.play_sound ?? true,
          notificationDuration: data.notification_duration ?? 5000,
        });

        setTicketPrefs({
          ticketNotifications: data.ticket_notifications ?? true,
          notifyOnNewTicket: data.notify_on_new_ticket ?? true,
          notifyOnAssignedTicket: data.notify_on_assigned_ticket ?? true,
          notifyOnStatusChange: data.notify_on_status_change ?? true,
          notifyOnPriorityChange: data.notify_on_priority_change ?? true,
          notifyOnCustomerReply: data.notify_on_customer_reply ?? true,
          notifyOnInternalComment: data.notify_on_internal_comment ?? false,
          notifyOnMention: data.notify_on_mention ?? true,
          autoWatchAssigned: data.auto_watch_assigned ?? true,
          watchFrequency: data.watch_frequency ?? 'real-time',
        });

        setSystemPrefs({
          systemAlertsEnabled: data.system_alerts_enabled ?? true,
          notifyOnMaintenance: data.notify_on_maintenance ?? true,
          notifyOnDeployments: data.notify_on_deployments ?? true,
          notifyOnSystemErrors: data.notify_on_system_errors ?? true,
          maintenanceWindow: data.maintenance_window ?? '02:00-04:00',
          errorNotificationThreshold: data.error_notification_threshold ?? 5,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load preferences.';
        toast.error(`Failed to load preferences: ${message}`);
      } finally {
        setLoading(false);
      }
    };
    loadPreferences();
  }, [toast]);

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      const combinedPrefs = {
        ...generalPrefs,
        ...emailPrefs,
        ...smsPrefs,
        ...inAppPrefs,
        ...ticketPrefs,
        ...systemPrefs,
      };

      await api.updateNotificationPreferences(combinedPrefs);
      toast.success('Notification preferences saved successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save preferences.';
      toast.error(`Failed to save preferences: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    setShowResetConfirm(true);
  };

  const confirmResetToDefaults = async () => {
    setShowResetConfirm(false);
    setSaving(true);
    try {
      await api.updateNotificationPreferences({
        emailNotifications: true,
        smsNotifications: false,
        inAppNotifications: true,
        notifyOnAssignment: true,
        notifyOnStatusChange: true,
        notifyOnComment: true,
        notifyOnMention: true,
        digestFrequency: 'immediate',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
        emailEnabled: true,
        notifyOnTicketUpdate: true,
        notifyOnSlaBreach: true,
        notifyOnMajorIncident: true,
        notifyOnSurveyRequest: true,
        emailFrequency: 'real-time',
        includeTicketDetails: true,
        includeAttachments: false,
        smsEnabled: false,
        notifyOnCriticalTickets: true,
        notifyOnMajorIncidents: true,
        notifyOnEscalations: true,
        phoneNumber: '',
        carrier: '',
        inAppEnabled: true,
        showNotifications: true,
        playSound: true,
        notificationDuration: 5000,
        ticketNotifications: true,
        notifyOnNewTicket: true,
        notifyOnAssignedTicket: true,
        notifyOnPriorityChange: true,
        notifyOnCustomerReply: true,
        notifyOnInternalComment: false,
        autoWatchAssigned: true,
        watchFrequency: 'real-time',
        systemAlertsEnabled: true,
        notifyOnMaintenance: true,
        notifyOnDeployments: true,
        notifyOnSystemErrors: true,
        maintenanceWindow: '02:00-04:00',
        errorNotificationThreshold: 5,
      });
      toast.success('Preferences reset to default values');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reset preferences.';
      toast.error(`Failed to reset preferences: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !preferences) {
    return (
      <PageTransition>
      <PageContainer maxWidth="full" className="space-y-4">
        <PageHeader
          title="Notification Preferences"
          subtitle="Configure notification channels, templates, and delivery settings"
          breadcrumbs={[{ label: 'Home' }, { label: 'Notifications' }]}
        />
        <Skeleton variant="card" count={3} />
      </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
    <PageContainer maxWidth="full" className="space-y-4">
      <PageHeader
        title="Notification Preferences"
        subtitle="Configure notification channels, templates, and delivery settings"
        breadcrumbs={[{ label: 'Home' }, { label: 'Notifications' }]}
        actions={<>
          <Button variant="outline" onClick={handleResetToDefaults}>
            <RefreshCw className="mr-2 h-3 h-3" /> Reset to Defaults
          </Button>
          <Button onClick={handleSavePreferences} isLoading={saving}>
            <CheckCircle2 className="mr-2 h-3 w-3" /> Save Changes
          </Button>
        </>}
      />

      {/* Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="sms">SMS</TabsTrigger>
          <TabsTrigger value="in-app">In-App</TabsTrigger>
          <TabsTrigger value="ticket">Ticket</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="space-y-6">
            <div className="border border-border-subtle rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">General Settings</h2>
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label htmlFor="emailNotifications">Email Notifications</Label>
                  <SwitchComponent
                    id="emailNotifications"
                    checked={generalPrefs.emailNotifications}
                    onChange={(e) => setGeneralPrefs(prev => ({ ...prev, emailNotifications: e.target.checked }))}
                  />
                  <p className="text-caption text-text-muted">
                    Receive email notifications for ticket updates and system events
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="smsNotifications">SMS Notifications</Label>
                  <SwitchComponent
                    id="smsNotifications"
                    checked={generalPrefs.smsNotifications}
                    onChange={(e) => setGeneralPrefs(prev => ({ ...prev, smsNotifications: e.target.checked }))}
                  />
                  <p className="text-caption text-text-muted">
                    Receive SMS notifications for critical alerts (requires phone number setup)
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="inAppNotifications">In-App Notifications</Label>
                  <SwitchComponent
                    id="inAppNotifications"
                    checked={generalPrefs.inAppNotifications}
                    onChange={(e) => setGeneralPrefs(prev => ({ ...prev, inAppNotifications: e.target.checked }))}
                  />
                  <p className="text-caption text-text-muted">
                    Show notifications within the application interface
                  </p>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Notification Digest</p>
                  <div className="space-y-2">
                    <Label htmlFor="digestFrequency">Digest Frequency</Label>
                    <select
                      value={generalPrefs.digestFrequency}
                      onChange={(e) => setGeneralPrefs(prev => ({ ...prev, digestFrequency: e.target.value }))}
                      className="border border-border-subtle rounded-lg px-3 py-2 w-full"
                    >
                      <option value="immediate">Immediate (real-time)</option>
                      <option value="hourly">Hourly Digest</option>
                      <option value="daily">Daily Digest</option>
                      <option value="weekly">Weekly Digest</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Quiet Hours</p>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <SwitchComponent
                        id="quietHoursEnabled"
                        checked={generalPrefs.quietHoursEnabled}
                        onChange={(e) => setGeneralPrefs(prev => ({ ...prev, quietHoursEnabled: e.target.checked }))}
                      />
                      <Label htmlFor="quietHoursEnabled">
                        Enable quiet hours (suppress non-critical notifications)
                      </Label>
                    </div>
                  </div>

                  {generalPrefs.quietHoursEnabled && (
                    <div className="space-y-4">
                      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        <div>
                          <Label htmlFor="quietHoursStart">Start Time</Label>
                          <Input
                            id="quietHoursStart"
                            type="time"
                            value={generalPrefs.quietHoursStart}
                            onChange={(e) => setGeneralPrefs(prev => ({ ...prev, quietHoursStart: e.target.value }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <Label htmlFor="quietHoursEnd">End Time</Label>
                          <Input
                            id="quietHoursEnd"
                            type="time"
                            value={generalPrefs.quietHoursEnd}
                            onChange={(e) => setGeneralPrefs(prev => ({ ...prev, quietHoursEnd: e.target.value }))}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

          <TabsContent value="email">
            <div className="border border-border-subtle rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Email Notification Settings</h2>
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label htmlFor="emailEnabled">Enable Email Notifications</Label>
                  <SwitchComponent
                    id="emailEnabled"
                    checked={emailPrefs.emailEnabled}
                    onChange={(e) => setEmailPrefs(prev => ({ ...prev, emailEnabled: e.target.checked }))}
                  />
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Notification Types</p>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnTicketUpdate">Ticket Updates</Label>
                    <SwitchComponent
                      id="notifyOnTicketUpdate"
                      checked={emailPrefs.notifyOnTicketUpdate}
                      onChange={(e) => setEmailPrefs(prev => ({ ...prev, notifyOnTicketUpdate: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnSlaBreach">SLA Breaches</Label>
                    <SwitchComponent
                      id="notifyOnSlaBreach"
                      checked={emailPrefs.notifyOnSlaBreach}
                      onChange={(e) => setEmailPrefs(prev => ({ ...prev, notifyOnSlaBreach: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnMajorIncident">Major Incidents</Label>
                    <SwitchComponent
                      id="notifyOnMajorIncident"
                      checked={emailPrefs.notifyOnMajorIncident}
                      onChange={(e) => setEmailPrefs(prev => ({ ...prev, notifyOnMajorIncident: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnSurveyRequest">Survey Requests</Label>
                    <SwitchComponent
                      id="notifyOnSurveyRequest"
                      checked={emailPrefs.notifyOnSurveyRequest}
                      onChange={(e) => setEmailPrefs(prev => ({ ...prev, notifyOnSurveyRequest: e.target.checked }))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Email Frequency</p>
                  <div className="space-y-2">
                    <Label htmlFor="emailFrequency">Frequency</Label>
                    <select
                      value={emailPrefs.emailFrequency}
                      onChange={(e) => setEmailPrefs(prev => ({ ...prev, emailFrequency: e.target.value }))}
                      className="border border-border-subtle rounded-lg px-3 py-2 w-full"
                    >
                      <option value="real-time">Real-time (as events occur)</option>
                      <option value="hourly">Hourly Batch</option>
                      <option value="daily">Daily Digest</option>
                      <option value="weekly">Weekly Digest</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Email Content</p>
                  <div className="space-y-3">
                    <Label htmlFor="includeTicketDetails">Include Ticket Details</Label>
                    <SwitchComponent
                      id="includeTicketDetails"
                      checked={emailPrefs.includeTicketDetails}
                      onChange={(e) => setEmailPrefs(prev => ({ ...prev, includeTicketDetails: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="includeAttachments">Include Attachments</Label>
                    <SwitchComponent
                      id="includeAttachments"
                      checked={emailPrefs.includeAttachments}
                      onChange={(e) => setEmailPrefs(prev => ({ ...prev, includeAttachments: e.target.checked }))}
                    />
                    <p className="text-caption text-text-muted">
                      Attach file copies to notification emails (may increase email size)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sms">
            <div className="border border-border-subtle rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">SMS Notification Settings</h2>
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label htmlFor="smsEnabled">Enable SMS Notifications</Label>
                  <SwitchComponent
                    id="smsEnabled"
                    checked={smsPrefs.smsEnabled}
                    onChange={(e) => setSmsPrefs(prev => ({ ...prev, smsEnabled: e.target.checked }))}
                  />
                  <p className="text-caption text-text-muted">
                    Standard SMS rates may apply. Check with your carrier for details.
                  </p>
                </div>

                {smsPrefs.smsEnabled && (
                  <>
                    <div className="space-y-4">
                      <p className="font-medium text-text-primary">Phone Number</p>
                      <div className="space-y-2">
                        <Label htmlFor="phoneNumber">Phone Number</Label>
                        <Input
                          id="phoneNumber"
                          type="tel"
                          placeholder="+1 (555) 123-4567"
                          value={smsPrefs.phoneNumber}
                          onChange={(e) => setSmsPrefs(prev => ({ ...prev, phoneNumber: e.target.value }))}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="font-medium text-text-primary">Carrier</p>
                      <div className="space-y-2">
                        <Label htmlFor="carrier">Carrier</Label>
                        <Input
                          id="carrier"
                          placeholder="e.g., Verizon, AT&T, T-Mobile"
                          value={smsPrefs.carrier}
                          onChange={(e) => setSmsPrefs(prev => ({ ...prev, carrier: e.target.value }))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Notification Types</p>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnCriticalTickets">Critical Tickets</Label>
                    <SwitchComponent
                      id="notifyOnCriticalTickets"
                      checked={smsPrefs.notifyOnCriticalTickets}
                      onChange={(e) => setSmsPrefs(prev => ({ ...prev, notifyOnCriticalTickets: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnMajorIncidents">Major Incidents</Label>
                    <SwitchComponent
                      id="notifyOnMajorIncidents"
                      checked={smsPrefs.notifyOnMajorIncidents}
                      onChange={(e) => setSmsPrefs(prev => ({ ...prev, notifyOnMajorIncidents: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnEscalations">Escalations</Label>
                    <SwitchComponent
                      id="notifyOnEscalations"
                      checked={smsPrefs.notifyOnEscalations}
                      onChange={(e) => setSmsPrefs(prev => ({ ...prev, notifyOnEscalations: e.target.checked }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="in-app">
            <div className="border border-border-subtle rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">In-App Notification Settings</h2>
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label htmlFor="inAppEnabled">Enable In-App Notifications</Label>
                  <SwitchComponent
                    id="inAppEnabled"
                    checked={inAppPrefs.inAppEnabled}
                    onChange={(e) => setInAppPrefs(prev => ({ ...prev, inAppEnabled: e.target.checked }))}
                  />
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Notification Behavior</p>
                  <div className="space-y-3">
                    <Label htmlFor="showNotifications">Show Notifications</Label>
                    <SwitchComponent
                      id="showNotifications"
                      checked={inAppPrefs.showNotifications}
                      onChange={(e) => setInAppPrefs(prev => ({ ...prev, showNotifications: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="playSound">Play Sound</Label>
                    <SwitchComponent
                      id="playSound"
                      checked={inAppPrefs.playSound}
                      onChange={(e) => setInAppPrefs(prev => ({ ...prev, playSound: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notificationDuration">Duration (ms)</Label>
                    <select
                      value={String(inAppPrefs.notificationDuration)}
                      onChange={(e) => setInAppPrefs(prev => ({ ...prev, notificationDuration: Number(e.target.value) }))}
                      className="border border-border-subtle rounded-lg px-3 py-2 w-full"
                    >
                      <option value="3000">3 seconds</option>
                      <option value="5000">5 seconds</option>
                      <option value="8000">8 seconds</option>
                      <option value="10000">10 seconds</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Notification Types</p>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnTicketUpdate">Ticket Updates</Label>
                    <SwitchComponent
                      id="notifyOnTicketUpdate"
                      checked={inAppPrefs.notifyOnTicketUpdate}
                      onChange={(e) => setInAppPrefs(prev => ({ ...prev, notifyOnTicketUpdate: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnSlaBreach">SLA Breaches</Label>
                    <SwitchComponent
                      id="notifyOnSlaBreach"
                      checked={inAppPrefs.notifyOnSlaBreach}
                      onChange={(e) => setInAppPrefs(prev => ({ ...prev, notifyOnSlaBreach: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnMajorIncident">Major Incidents</Label>
                    <SwitchComponent
                      id="notifyOnMajorIncident"
                      checked={inAppPrefs.notifyOnMajorIncident}
                      onChange={(e) => setInAppPrefs(prev => ({ ...prev, notifyOnMajorIncident: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnSurveyRequest">Survey Requests</Label>
                    <SwitchComponent
                      id="notifyOnSurveyRequest"
                      checked={inAppPrefs.notifyOnSurveyRequest}
                      onChange={(e) => setInAppPrefs(prev => ({ ...prev, notifyOnSurveyRequest: e.target.checked }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ticket">
            <div className="border border-border-subtle rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Ticket Notification Settings</h2>
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label htmlFor="ticketNotifications">Enable Ticket Notifications</Label>
                  <SwitchComponent
                    id="ticketNotifications"
                    checked={ticketPrefs.ticketNotifications}
                    onChange={(e) => setTicketPrefs(prev => ({ ...prev, ticketNotifications: e.target.checked }))}
                  />
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Notification Triggers</p>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnNewTicket">New Ticket Assigned</Label>
                    <SwitchComponent
                      id="notifyOnNewTicket"
                      checked={ticketPrefs.notifyOnNewTicket}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, notifyOnNewTicket: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnAssignedTicket">Ticket Assigned to You</Label>
                    <SwitchComponent
                      id="notifyOnAssignedTicket"
                      checked={ticketPrefs.notifyOnAssignedTicket}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, notifyOnAssignedTicket: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnStatusChange">Status Changes</Label>
                    <SwitchComponent
                      id="notifyOnStatusChange"
                      checked={ticketPrefs.notifyOnStatusChange}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, notifyOnStatusChange: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnPriorityChange">Priority Changes</Label>
                    <SwitchComponent
                      id="notifyOnPriorityChange"
                      checked={ticketPrefs.notifyOnPriorityChange}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, notifyOnPriorityChange: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnCustomerReply">Customer Replies</Label>
                    <SwitchComponent
                      id="notifyOnCustomerReply"
                      checked={ticketPrefs.notifyOnCustomerReply}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, notifyOnCustomerReply: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnInternalComment">Internal Comments</Label>
                    <SwitchComponent
                      id="notifyOnInternalComment"
                      checked={ticketPrefs.notifyOnInternalComment}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, notifyOnInternalComment: e.target.checked }))}
                    />
                    <p className="text-caption text-text-muted">
                      Notify when internal team members comment on tickets
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnMention">Mentions (@username)</Label>
                    <SwitchComponent
                      id="notifyOnMention"
                      checked={ticketPrefs.notifyOnMention}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, notifyOnMention: e.target.checked }))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Watch Behavior</p>
                  <div className="space-y-3">
                    <Label htmlFor="autoWatchAssigned">Auto-watch Assigned Tickets</Label>
                    <SwitchComponent
                      id="autoWatchAssigned"
                      checked={ticketPrefs.autoWatchAssigned}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, autoWatchAssigned: e.target.checked }))}
                    />
                    <p className="text-caption text-text-muted">
                      Automatically add yourself as a watcher when assigned to a ticket
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="watchFrequency">Watch Frequency</Label>
                    <select
                      value={ticketPrefs.watchFrequency}
                      onChange={(e) => setTicketPrefs(prev => ({ ...prev, watchFrequency: e.target.value }))}
                      className="border border-border-subtle rounded-lg px-3 py-2 w-full"
                    >
                      <option value="real-time">Real-time</option>
                      <option value="15min">Every 15 Minutes</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="system">
            <div className="border border-border-subtle rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">System Notification Settings</h2>
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label htmlFor="systemAlertsEnabled">Enable System Alerts</Label>
                  <SwitchComponent
                    id="systemAlertsEnabled"
                    checked={systemPrefs.systemAlertsEnabled}
                    onChange={(e) => setSystemPrefs(prev => ({ ...prev, systemAlertsEnabled: e.target.checked }))}
                  />
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">System Alert Types</p>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnMaintenance">Maintenance Windows</Label>
                    <SwitchComponent
                      id="notifyOnMaintenance"
                      checked={systemPrefs.notifyOnMaintenance}
                      onChange={(e) => setSystemPrefs(prev => ({ ...prev, notifyOnMaintenance: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnDeployments">System Deployments</Label>
                    <SwitchComponent
                      id="notifyOnDeployments"
                      checked={systemPrefs.notifyOnDeployments}
                      onChange={(e) => setSystemPrefs(prev => ({ ...prev, notifyOnDeployments: e.target.checked }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="notifyOnSystemErrors">System Errors</Label>
                    <SwitchComponent
                      id="notifyOnSystemErrors"
                      checked={systemPrefs.notifyOnSystemErrors}
                      onChange={(e) => setSystemPrefs(prev => ({ ...prev, notifyOnSystemErrors: e.target.checked }))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Maintenance Window</p>
                  <div className="space-y-2">
                    <Label htmlFor="maintenanceWindow">Maintenance Window (HH:MM-HH:MM)</Label>
                    <Input
                      id="maintenanceWindow"
                      placeholder="02:00-04:00"
                      value={systemPrefs.maintenanceWindow}
                      onChange={(e) => setSystemPrefs(prev => ({ ...prev, maintenanceWindow: e.target.value }))}
                      className="w-full"
                    />
                    <p className="text-caption text-text-muted">
                      System notifications during maintenance will be suppressed
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-primary">Error Notification Threshold</p>
                  <div className="space-y-2">
                    <Label htmlFor="errorNotificationThreshold">Errors Before Notification</Label>
                    <Input
                      id="errorNotificationThreshold"
                      type="number"
                      min={1}
                      max={50}
                      value={systemPrefs.errorNotificationThreshold}
                      onChange={(e) => setSystemPrefs(prev => ({ ...prev, errorNotificationThreshold: Number(e.target.value) }))}
                      className="w-full"
                    />
                    <p className="text-caption text-text-muted">
                      Receive a notification after this many system errors occur within 5 minutes
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <ConfirmModal
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          onConfirm={confirmResetToDefaults}
          title="Reset to Defaults"
          message="Reset all notification preferences to default values?"
          confirmLabel="Reset"
          variant="danger"
        />
    </PageContainer>
    </PageTransition>
  );
}