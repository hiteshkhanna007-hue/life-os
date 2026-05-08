import type { Reminder, SmartTrigger } from "../types/life-lens.js";
import type { CalendarBlock, Task } from "../types/planner.js";

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHHMM(value: string): boolean {
  return HH_MM.test(value);
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function validateTask(task: Pick<Task, "title" | "dueDate" | "startDate" | "estimatedPomodoros" | "status" | "completedAt">): string[] {
  const errors: string[] = [];

  if (task.title.length < 1 || task.title.length > 500) errors.push("title must be 1-500 chars");
  if (task.estimatedPomodoros < 1 || task.estimatedPomodoros > 50) errors.push("estimatedPomodoros must be 1-50");
  if (task.dueDate && task.startDate && Date.parse(task.dueDate) < Date.parse(task.startDate)) {
    errors.push("dueDate must be >= startDate");
  }
  if (task.status === "done" && !task.completedAt) errors.push("completedAt is required when status is done");

  return errors;
}

export function validateCalendarBlock(block: Pick<CalendarBlock, "startTime" | "endTime">): string[] {
  return Date.parse(block.endTime) > Date.parse(block.startTime) ? [] : ["endTime must be after startTime"];
}

export function validateReminder(reminder: Pick<Reminder, "triggerType" | "scheduledTime" | "recurrenceRule" | "smartTrigger" | "status" | "snoozedUntil">, now = new Date()): string[] {
  const errors: string[] = [];
  const hasTimeTrigger = Boolean(reminder.scheduledTime || reminder.recurrenceRule);
  const hasSmartTrigger = reminder.smartTrigger ? smartTriggerHasCondition(reminder.smartTrigger) : false;

  if (!hasTimeTrigger && !hasSmartTrigger) errors.push("at least one trigger condition is required");
  if (reminder.triggerType === "smart" && !hasSmartTrigger) errors.push("smartTrigger needs at least one condition");
  if (reminder.status === "snoozed" && (!reminder.snoozedUntil || Date.parse(reminder.snoozedUntil) <= now.getTime())) {
    errors.push("snoozedUntil must be in the future when status is snoozed");
  }

  return errors;
}

function smartTriggerHasCondition(trigger: SmartTrigger): boolean {
  return Object.values(trigger).some((value) => value !== null);
}
