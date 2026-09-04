// Notification preferences — defaults and payload builder (FE-03).
//
// Kept out of the page component so the pure logic is unit-testable and the
// page file stays free of non-component exports (react-refresh rule). The
// granular settings are namespaced per channel: a flat spread previously let
// in-app keys silently overwrite email keys with identical names
// (notifyOnTicketUpdate, notifyOnSlaBreach, notifyOnMajorIncident,
// notifyOnSurveyRequest) and let general prefs overwrite ticket prefs
// (notifyOnStatusChange).

export interface GeneralPrefs {
  emailNotifications: boolean;
  smsNotifications: boolean;
  inAppNotifications: boolean;
  notifyOnAssignment: boolean;
  notifyOnStatusChange: boolean;
  notifyOnComment: boolean;
  notifyOnMention: boolean;
  digestFrequency: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}
export interface EmailPrefs {
  emailEnabled: boolean;
  notifyOnTicketUpdate: boolean;
  notifyOnSlaBreach: boolean;
  notifyOnMajorIncident: boolean;
  notifyOnSurveyRequest: boolean;
  emailFrequency: string;
  includeTicketDetails: boolean;
  includeAttachments: boolean;
}
export interface SmsPrefs {
  smsEnabled: boolean;
  notifyOnCriticalTickets: boolean;
  notifyOnMajorIncidents: boolean;
  notifyOnEscalations: boolean;
  phoneNumber: string;
  carrier: string;
}
export interface InAppPrefs {
  inAppEnabled: boolean;
  notifyOnTicketUpdate: boolean;
  notifyOnSlaBreach: boolean;
  notifyOnMajorIncident: boolean;
  notifyOnSurveyRequest: boolean;
  showNotifications: boolean;
  playSound: boolean;
  notificationDuration: number;
}
export interface TicketPrefs {
  ticketNotifications: boolean;
  notifyOnNewTicket: boolean;
  notifyOnAssignedTicket: boolean;
  notifyOnStatusChange: boolean;
  notifyOnPriorityChange: boolean;
  notifyOnCustomerReply: boolean;
  notifyOnInternalComment: boolean;
  notifyOnMention: boolean;
  autoWatchAssigned: boolean;
  watchFrequency: string;
}
export interface SystemPrefs {
  systemAlertsEnabled: boolean;
  notifyOnMaintenance: boolean;
  notifyOnDeployments: boolean;
  notifyOnSystemErrors: boolean;
  maintenanceWindow: string;
  errorNotificationThreshold: number;
}
export const DEFAULT_PREFS: {
  general: GeneralPrefs;
  email: EmailPrefs;
  sms: SmsPrefs;
  inApp: InAppPrefs;
  ticket: TicketPrefs;
  system: SystemPrefs;
} = {
  general: {
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
  },
  email: {
    emailEnabled: true,
    notifyOnTicketUpdate: true,
    notifyOnSlaBreach: true,
    notifyOnMajorIncident: true,
    notifyOnSurveyRequest: true,
    emailFrequency: 'real-time',
    includeTicketDetails: true,
    includeAttachments: false,
  },
  sms: {
    smsEnabled: false,
    notifyOnCriticalTickets: true,
    notifyOnMajorIncidents: true,
    notifyOnEscalations: true,
    phoneNumber: '',
    carrier: '',
  },
  inApp: {
    inAppEnabled: true,
    notifyOnTicketUpdate: true,
    notifyOnSlaBreach: true,
    notifyOnMajorIncident: true,
    notifyOnSurveyRequest: true,
    showNotifications: true,
    playSound: true,
    notificationDuration: 5000,
  },
  ticket: {
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
  },
  system: {
    systemAlertsEnabled: true,
    notifyOnMaintenance: true,
    notifyOnDeployments: true,
    notifyOnSystemErrors: true,
    maintenanceWindow: '02:00-04:00',
    errorNotificationThreshold: 5,
  },
};

export type PrefSections = typeof DEFAULT_PREFS;

/** Clone defaults for a section so the page's useState initializers never share
 * references with the canonical defaults object. */
export function defaultSection<K extends keyof PrefSections>(key: K): PrefSections[K] {
  return { ...DEFAULT_PREFS[key] };
}

/**
 * Build the structured PUT payload (FE-03). Granular settings are namespaced
 * per channel so identical key names across channels cannot overwrite each
 * other, and the first-class channel flags the notification engine reads are
 * kept in sync.
 */
export function buildPayload(sections: PrefSections) {
  const { general, email, sms, inApp, ticket, system } = sections;
  return {
    emailEnabled: email.emailEnabled,
    smsEnabled: sms.smsEnabled,
    pushEnabled: inApp.inAppEnabled,
    quietHours: {
      enabled: general.quietHoursEnabled,
      start: general.quietHoursStart,
      end: general.quietHoursEnd,
    },
    details: { general, email, sms, inApp, ticket, system },
  };
}