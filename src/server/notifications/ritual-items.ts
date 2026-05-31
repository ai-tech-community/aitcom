export type EngageConfig = {
  ritualRecap: boolean;
  ritualReminder: boolean;
  atRiskLine: boolean;
};

export type RitualRecapItem = { title: string; replyCount: number };
export type RitualReminderItem = { title: string; weekdayLabel: string };

/** Compose the digest `ritualItems` strings for one recipient. Pure. */
export function buildRitualItems(opts: {
  config: EngageConfig;
  recap: RitualRecapItem[];
  reminders: RitualReminderItem[];
  recipientIsAtRisk: boolean;
  recipientName: string;
}): string[] {
  const items: string[] = [];
  if (opts.config.ritualRecap) {
    for (const r of opts.recap) {
      const noun = r.replyCount === 1 ? "reply" : "replies";
      items.push(`${r.title} — ${r.replyCount} ${noun} this week`);
    }
  }
  if (opts.config.ritualReminder) {
    for (const r of opts.reminders) {
      items.push(`Up next: ${r.title} (${r.weekdayLabel})`);
    }
  }
  if (opts.config.atRiskLine && opts.recipientIsAtRisk) {
    items.push(`We've missed you, ${opts.recipientName} — jump back in`);
  }
  return items;
}
