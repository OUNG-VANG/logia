const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordError, createResetToken, hashResetToken, RESET_TOKEN_MINUTES } = require('../src/lib/password');
const { issuedBeforePasswordChange } = require('../src/lib/tokens');
const { foldSmallGroups } = require('../src/lib/analytics');

test('mot de passe : 8 caractères minimum et 72 octets maximum', () => {
  assert.ok(passwordError('court'));
  assert.equal(passwordError('motdepasse'), null);
  assert.ok(passwordError('é'.repeat(37))); // 74 octets en UTF-8
  assert.ok(passwordError(undefined));
});

test('jeton de réinitialisation : aléatoire, empreinte stockée, expiration à 1 heure', () => {
  const first = createResetToken();
  const second = createResetToken();
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash, hashResetToken(first.token));
  assert.notEqual(first.hash, first.token);
  const minutes = (first.expiresAt - Date.now()) / 60000;
  assert.ok(minutes > RESET_TOKEN_MINUTES - 1 && minutes <= RESET_TOKEN_MINUTES);
});

test('une session ouverte avant un changement de mot de passe est refusée', () => {
  const changedAt = new Date('2026-11-24T12:00:00Z');
  const before = { iat: Math.floor(new Date('2026-11-24T11:00:00Z').getTime() / 1000) };
  const after = { iat: Math.floor(new Date('2026-11-24T12:00:05Z').getTime() / 1000) };
  const sameSecond = { iat: Math.floor(changedAt.getTime() / 1000) };
  assert.equal(issuedBeforePasswordChange(before, changedAt), true);
  assert.equal(issuedBeforePasswordChange(after, changedAt), false);
  assert.equal(issuedBeforePasswordChange(sameSecond, changedAt), false);
  assert.equal(issuedBeforePasswordChange(before, null), false);
});

test('Observatoire : les groupes de moins de 3 personnes sont regroupés', () => {
  const rows = [{ key: 'student', count: 5 }, { key: 'retired', count: 1 }, { key: 'job_seeker', count: 2 }];
  assert.deepEqual(foldSmallGroups(rows), [
    { key: 'student', count: 5 },
    { key: 'other', count: 3, folded: true },
  ]);
  assert.deepEqual(foldSmallGroups([{ key: 'student', count: 4 }]), [{ key: 'student', count: 4 }]);
});
