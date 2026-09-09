/**
 * The five top-level destinations — DESIGN.md §7.1. Identical on the mobile
 * tab bar and the web sidebar.
 */
export interface Destination {
  path: string;
  label: string;
  blurb: string;
}

export const DESTINATIONS: readonly Destination[] = [
  {
    path: '/',
    label: 'Today',
    blurb: 'Readiness check-in, today’s plan, nutrition remaining, insights, coach',
  },
  {
    path: '/train',
    label: 'Train',
    blurb: 'History calendar, workout detail, exercise library, PRs, session mode',
  },
  {
    path: '/eat',
    label: 'Eat',
    blurb: 'Day log by meal, saved meals, inventory, recipes, meal plans',
  },
  {
    path: '/progress',
    label: 'Progress',
    blurb: 'Strength charts, body metrics, photos, consistency, weekly reviews',
  },
  {
    path: '/you',
    label: 'You',
    blurb: 'Profile, goals, equipment, targets, memories, API key, export',
  },
];
