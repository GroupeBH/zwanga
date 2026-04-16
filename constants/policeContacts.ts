export const POLICE_CONTACTS = [
  { id: 'police-1', label: 'Police 1', phone: '+243831626828' },
  { id: 'police-2', label: 'Police 2', phone: '+243900003921' },
  { id: 'police-3', label: 'Police 3', phone: '+243857372249' },
  { id: 'police-4', label: 'Police 4', phone: '+243972634600' },
] as const;

export type PoliceContact = (typeof POLICE_CONTACTS)[number];
