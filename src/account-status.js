// A playable catalog or a future date alone does not establish provider account status.
export function accountStatus(account, now = Date.now()) {
  const info = account.accountInfo || {}, value = Number(info.expiresAt);
  const expiresAt = value > 0 && Number.isFinite(new Date(value).getTime()) ? value : null;
  const expired = expiresAt !== null && expiresAt <= now;
  const status = String(info.status || '').trim().toLowerCase();
  if (expired || ['inactive', 'inactiva', 'disabled', 'banned', 'expired', 'vencida', 'expirada'].includes(status)) return { state: 'inactive', label: 'Inactiva', expiresAt, expired };
  if (['active', 'activa'].includes(status)) return { state: 'active', label: 'Activa', expiresAt, expired };
  return { state: 'unknown', label: 'No informado', expiresAt, expired };
}
