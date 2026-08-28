import type { Meta, StoryObj } from '@storybook/react';
import IncidentTimeline from './IncidentTimeline';

const meta: Meta<typeof IncidentTimeline> = {
  title: 'MajorIncidents/IncidentTimeline',
  component: IncidentTimeline,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof IncidentTimeline>;

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
  notifications: [],
};

export const EmptyTimeline: Story = {
  args: {
    incident: { ...baseIncident, timeline: [] },
    onAddEntry: (id, msg) => console.log('Add entry', id, msg),
  },
};

export const WithEntries: Story = {
  args: {
    incident: {
      ...baseIncident,
      timeline: [
        {
          id: 'tl-1',
          timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
          author: 'John Operator',
          role: 'BU Support',
          message: 'Incident declared. Initial investigation started. Parkway API returning HTTP 504 on settlement callbacks.',
        },
        {
          id: 'tl-2',
          timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          author: 'Sarah Admin',
          role: 'BU Support',
          message: 'Root cause identified: middleware buffer overflow in webhook handler. Scaling up worker pool.',
        },
        {
          id: 'tl-3',
          timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
          author: 'Parkway Support',
          role: 'Payment Partner',
          message: 'Confirmed API-side fix deployed. Monitoring settlement queue depth.',
        },
      ],
    },
    onAddEntry: (id, msg) => console.log('Add entry', id, msg),
  },
};

export const SingleEntry: Story = {
  args: {
    incident: {
      ...baseIncident,
      timeline: [
        {
          id: 'tl-1',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          author: 'Ops Bot',
          role: 'BU Support',
          message: 'Automated alert: SLA breach detected for 3 linked complaints.',
        },
      ],
    },
    onAddEntry: (id, msg) => console.log('Add entry', id, msg),
  },
};
