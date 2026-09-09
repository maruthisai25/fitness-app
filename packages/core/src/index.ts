/**
 * `@vigor/core` — domain types, engines and view-model builders.
 * Zero IO. Zero React. DESIGN.md §3.
 *
 * Phase 0 shipped the type and schema contract (DESIGN.md §4.1). This is the
 * engine layer of DESIGN.md §5, plus the §7.2 view-model builders, the shared
 * query keys and the §7.3 reminder rules.
 */

// Contract — DESIGN.md §4.1
export * from './types';
export * from './schemas';
export * from './ids';

// Shared arithmetic
export * from './dates';
export * from './units';
export * from './rationale';
export * from './setMath';

// Engines — DESIGN.md §5
export * from './progression'; // §5.1
export * from './readiness'; // §5.2
export * from './plateau'; // §5.3
export * from './planner'; // §5.4
export * from './substitution'; // §5.5
export * from './nutrition'; // §5.6
export * from './records'; // §5.7
export * from './insights'; // §5.8
export * from './weeklyReview'; // §5.9

// Apps — DESIGN.md §7.2, §7.3
export * from './viewModels';
export * from './queries';
export * from './reminders';
