import type { Meta, StoryObj } from '@storybook/react';
import IncidentAdvisoryBroadcasts from './IncidentAdvisoryBroadcasts';

const meta: Meta<typeof IncidentAdvisoryBroadcasts> = {
  title: 'MajorIncidents/IncidentAdvisoryBroadcasts',
  component: IncidentAdvisoryBroadcasts,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof IncidentAdvisoryBroadcasts>;

const baseIncident = {
  id: 'MI-2024-001',
  name: 'Parkway API Settlement Delay',
  description: '',
  partner: 'Parkway',
  category: 'Settlement Delay',
  severity: 'CRITICAL',
  active: true,
  ticketCount: 12,
  createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  status: 'INVESTIGATING' as const,
  timeline: [],
};

export const NoNotifications: Story = {
  args: {
    incident: { ...baseIncident, notifications: [] },
    canManage: true,
    retryingNotifId: null,
    onRetry: (miId, notifId) => console.log('Retry', miId, notifId),
  },
};

export const SentNotifications: Story = {
  args: {
    incident: {
      ...baseIncident,
      notifications: [
        { id: 'n-1', timestamp: new Date().toISOString(), channel: 'Slack', recipient: '#ops-alerts', subject: 'MI Declared', status: 'SENT' },
        { id: 'n-2', timestamp: new Date().toISOString(), channel: 'Email', recipient: 'exec@company.com', subject: 'MI Advisory', status: 'SENT' },
      ],
    },
    canManage: true,
    retryingNotifId: null,
    onRetry: (miId, notifId) => console.log('Retry', miId, notifId),
  },
};

export const FailedNotification: Story = {
  args: {
    incident: {
      ...baseIncident,
      notifications: [
        { id: 'n-1', timestamp: new Date().toISOString(), channel: 'Slack', recipient: '#ops-alerts', subject: 'MI Declared', status: 'SENT' },
        { id: 'n-2', timestamp: new Date().toISOString(), channel: 'Email', recipient: 'exec@company.com', subject: 'MI Advisory', status: 'FAILED', error: 'SMTP connection timeout' },
      ],
    },
    canManage: true,
    retryingNotifId: null,
    onRetry: (miId, notifId) => console.log('Retry', miId, notifId),
  },
};

export const Retrying: Story = {
  args: {
    incident: {
      ...baseIncident,
      notifications: [
        { id: 'n-1', timestamp: new Date().toISOString(), channel: 'Email', recipient: 'exec@company.com', subject: 'MI Advisory', status: 'FAILED', error: 'SMTP connection timeout' },
      ],
    },
    canManage: true,
    retryingNotifId: 'n-1',
    onRetry: (miId, notifId) => console.log('Retry', miId, notifId),
  },
};
