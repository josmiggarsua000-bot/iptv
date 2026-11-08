import test from 'node:test';
import assert from 'node:assert/strict';
import { accountStatus } from '../src/account-status.js';
const now = 1800000000000;
test('Estado del proveedor y vencimiento de cada cuenta se distinguen del catálogo', () => {
  assert.equal(accountStatus({ accountInfo: { status: 'Active', expiresAt: now + 1000 } }, now).state, 'active');
  const expired = accountStatus({ accountInfo: { status: 'Active', expiresAt: now } }, now);
  assert.equal(expired.state, 'inactive'); assert.equal(expired.expired, true);
  assert.equal(accountStatus({ accountInfo: { status: 'Disabled', expiresAt: now + 1000 } }, now).state, 'inactive');
});
test('Las listas sin metadatos no se anuncian como activas o vencidas', () => {
  assert.equal(accountStatus({ type: 'm3u', items: [{ name: 'Canal' }] }, now).state, 'unknown');
  assert.equal(accountStatus({ accountInfo: { expiresAt: now + 1000 } }, now).state, 'unknown');
  assert.equal(accountStatus({ accountInfo: { status: 'Active', expiresAt: 'invalid' } }, now).expiresAt, null);
  assert.equal(accountStatus({ accountInfo: { status: 'Expired' } }, now).state, 'inactive');
});
