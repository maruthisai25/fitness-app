/**
 * Wires the coach's Today-tab slots — DESIGN.md §7.1, phase 2 and 3 rows of
 * §9. `src/today/PlanCard.tsx` renders `<CoachPlanSlot>` and
 * `<CoachQuickActionsSlot>` unconditionally; nothing shows until this module
 * runs once and registers the real components.
 *
 * Imported for its side effect only, from the root layout, before anything
 * that could render Today.
 */
import { registerCoachPlanSlot, registerCoachQuickActionsSlot } from '../ui/slots';
import { CoachPlanCard } from './CoachPlanCard';
import { CoachQuickActions } from './CoachQuickActions';

registerCoachPlanSlot(CoachPlanCard);
registerCoachQuickActionsSlot(CoachQuickActions);
