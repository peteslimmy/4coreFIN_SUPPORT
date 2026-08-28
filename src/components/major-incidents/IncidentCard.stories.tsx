import type { Meta, StoryObj } from '@storybook/react';
import IncidentCard from './IncidentCard';

const meta: Meta<typeof IncidentCard> = {
  title: 'MajorIncidents/IncidentCard',
  component: IncidentCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof IncidentCard>;

export const CriticalActive: Story = {
  args: {
    incident: {
      id: 'MI-2024-001',
      name: 'Parkway API Settlement Delay APAC',
      description: 'Adyen bulk checkout callbacks are erroring with HTTP 504. Investigating middleware buffer timeouts.',
      partner: 'Parkway',
      category: 'Settlement Delay',
      severity: 'CRITICAL',
      active: true,
      ticketCount: 12,
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      status: 'INVESTIGATING',
      timeline: [],
      notifications: [],
    },
    linkedCount: 12,
    onSelect: (id) => console.log('Select', id),
  },
};

export const HighSeverityResolved: Story = {
  args: {
    incident: {
      id: 'MI-2024-002',
      name: 'Flutterwave Duplicate Debit Incident',
      description: 'Multiple duplicate debit transactions reported across POS terminals.',
      partner: 'Flutterwave',
      category: 'Duplicate Debit',
      severity: 'HIGH',
      active: false,
      ticketCount: 8,
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      status: 'RESOLVED',
      timeline: [],
      notifications: [],
    },
    linkedCount: 8,
    onSelect: (id) => console.log('Select', id),
  },
};

export const NoLinkedTickets: Story = {
  args: {
    incident: {
      id: 'MI-2024-003',
      name: 'Paystack Webhook Failure',
      description: 'Webhook delivery failures detected for settlement confirmations.',
      partner: 'Paystack',
      category: 'Webhook Failure',
      severity: 'MEDIUM',
      active: true,
      ticketCount: 0,
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      status: 'DECLARED',
      timeline: [],
      notifications: [],
    },
    linkedCount: 0,
    onSelect: (id) => console.log('Select', id),
  },
};
