import type { Messages } from '../pt-BR';

export const audit: Messages['audit'] = {
  generateError: 'Error generating the link. Please try again.',
  revokeConfirm: 'Are you sure? The current link will be invalidated and can no longer be accessed.',
  revokeError: 'Error revoking the link. Please try again.',
  title: 'Audit Access',
  publicLink: '⚠️ Public Link',
  publicLinkText: 'Anyone with this link can view the project dashboard in read-only mode.',
  generating: 'Generating link...',
  linkLabel: 'Audit Link',
  copied: 'Copied!',
  copy: 'Copy',
  revoke: 'Revoke Link',
  noLink: 'No active audit link.',
  generate: 'Generate Link',
  fillEvent: 'Please fill in the event name and date.',
  saveEventError: 'Error saving the event. Please try again.',
  configureEvent: 'Set Up Event',
  eventName: 'Event Name',
  eventNamePlaceholder: 'E.g.: National Tournament',
  eventDate: 'Event Date',
};
