export const SITE_TITLE = 'Hannah Ko';
export const SITE_DESCRIPTION =
  'Notes, essays, and projects from a clinician moving into applied AI.';

export const SECTIONS = {
  log: 'Learning Log',
  essays: 'Essays',
  projects: 'Projects',
  notes: 'Notes',
} as const;

export type Section = keyof typeof SECTIONS;
