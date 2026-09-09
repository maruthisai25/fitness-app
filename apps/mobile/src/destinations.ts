/**
 * The five top-level destinations — DESIGN.md §7.1. Identical to the web
 * sidebar; here they are the tab bar.
 */
export interface Destination {
  /** Expo Router route name inside `app/(tabs)`. */
  name: string;
  label: string;
  blurb: string;
}

export const DESTINATIONS: readonly Destination[] = [
  {
    name: 'index',
    label: 'Today',
    blurb: 'Readiness check-in, today’s plan, nutrition remaining, insights, coach',
  },
  {
    name: 'train',
    label: 'Train',
    blurb: 'History calendar, workout detail, exercise library, PRs, session mode',
  },
  {
    name: 'eat',
    label: 'Eat',
    blurb: 'Day log by meal, saved meals, inventory, recipes, meal plans',
  },
  {
    name: 'progress',
    label: 'Progress',
    blurb: 'Strength charts, body metrics, photos, consistency, weekly reviews',
  },
  {
    name: 'you',
    label: 'You',
    blurb: 'Profile, goals, equipment, targets, memories, API key, export',
  },
];
