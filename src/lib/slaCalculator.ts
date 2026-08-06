import { SlaRule, HolidayRecord } from '../types/admin';
import { TicketPriority } from '../types/app';

/**
 * Calculates a dynamic, holiday-aware SLA deadline.
 * Pushes the target date out by 24 hours for each holiday falling within the SLA window.
 */
export function calculateSlaDeadline(
  createdAt: Date,
  category: string,
  priority: TicketPriority,
  slaRules: SlaRule[],
  holidays: HolidayRecord[]
): Date {
  // 1. Determine base SLA duration in hours
  let durationHours = 24; // Default standard SLA is 24 hours
  
  const matchingRule = slaRules.find(
    rule => rule.category.toLowerCase() === category.toLowerCase() && rule.priority === priority
  );
  
  if (matchingRule) {
    durationHours = matchingRule.durationHours;
  } else {
    // Priority fallbacks if no specific category rule exists
    switch (priority) {
      case TicketPriority.CRITICAL:
        durationHours = 4;
        break;
      case TicketPriority.HIGH:
        durationHours = 12;
        break;
      case TicketPriority.MEDIUM:
        durationHours = 24;
        break;
      case TicketPriority.LOW:
        durationHours = 48;
        break;
    }
  }

  let deadline = new Date(createdAt.getTime() + durationHours * 60 * 60 * 1000);
  const holidayDatesStr = holidays.map(h => h.date);
  
  // 2. Cascade adjustments for any holidays falling within the range
  let adjusted = true;
  const processedHolidays = new Set<string>();

  while (adjusted) {
    adjusted = false;
    // Scan day by day from start to proposed deadline
    const scanDate = new Date(createdAt);
    while (scanDate <= deadline) {
      const dateStr = scanDate.toISOString().split('T')[0];
      if (holidayDatesStr.includes(dateStr) && !processedHolidays.has(dateStr)) {
        processedHolidays.add(dateStr);
        // Extend deadline by exactly 1 full calendar day (24 hours) for the holiday
        deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
        adjusted = true; // Cascade check again with new pushed deadline
      }
      // Increment scan date by 1 day
      scanDate.setDate(scanDate.getDate() + 1);
    }
  }

  return deadline;
}
