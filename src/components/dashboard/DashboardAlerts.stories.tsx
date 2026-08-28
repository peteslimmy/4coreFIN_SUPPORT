import type { Meta, StoryObj } from '@storybook/react';
import DashboardAlerts from './DashboardAlerts';

const meta: Meta<typeof DashboardAlerts> = {
  title: 'Dashboard/DashboardAlerts',
  component: DashboardAlerts,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DashboardAlerts>;

export const NoAlerts: Story = {
  args: {
    alerts: [
      { id: 'clear', type: 'info', message: 'All systems operating within normal parameters. No active alerts.' },
    ],
  },
};

export const WarningOnly: Story = {
  args: {
    alerts: [
      { id: 'approach', type: 'warning', message: '3 ticket(s) approaching SLA deadline within 2 hours. Payment Partners: Adyen, Stripe.' },
      { id: 'highvalue', type: 'warning', message: '2 high-value dispute(s) totaling ₦4,500,000 pending resolution.' },
    ],
  },
};

export const CriticalAlerts: Story = {
  args: {
    alerts: [
      { id: 'breach', type: 'error', message: '5 SLA breach(es) active across Adyen, Paystack. Immediate action required.' },
      { id: 'critical', type: 'error', message: '2 CRITICAL priority ticket(s) open. Expedited handling required.' },
      { id: 'approach', type: 'warning', message: '1 ticket(s) approaching SLA deadline within 2 hours. Payment Partners: Flutterwave.' },
    ],
  },
};

export const SingleCritical: Story = {
  args: {
    alerts: [
      { id: 'breach', type: 'error', message: '1 SLA breach active across Parkway. Immediate action required.' },
    ],
  },
};
