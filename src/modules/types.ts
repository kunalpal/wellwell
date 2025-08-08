export type StatusLevel = 'ok' | 'warning' | 'error' | 'info';

export type ItemStatus = {
  id: string;
  label: string;
  level: StatusLevel;
  details?: string;
};

export type ActionResult = {
  ok: boolean;
  message?: string;
  error?: Error;
};
