const test = require('node:test');
const assert = require('node:assert/strict');
const { marketByCity, applicationStats, countBy, median } = require('../src/lib/analytics');

test('médiane : nombre pair et impair de valeurs', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('loyers par ville : regroupe sans tenir compte des accents ni de la casse', () => {
  const result = marketByCity([
    { location: { city: 'Saint-Étienne' }, rent: 400, areaM2: 20 },
    { location: { city: 'saint-etienne' }, rent: 600, areaM2: 30 },
    { location: { city: 'Lyon' }, rent: 900, areaM2: 30 },
    { location: { city: '' }, rent: 500 },
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { city: 'Lyon', listings: 1, averageRent: 900, medianRent: 900, averageRentPerM2: 30 });
  assert.equal(result[1].listings, 2);
  assert.equal(result[1].averageRent, 500);
  assert.equal(result[1].averageRentPerM2, 20);
});

test('candidatures : taux d’acceptation calculé sur les seules décisions', () => {
  const stats = applicationStats([
    { status: 'accepted', matchScore: 90 },
    { status: 'rejected', matchScore: 30 },
    { status: 'rejected', matchScore: 85 },
    { status: 'pending', matchScore: 70 },
    { status: 'withdrawn', matchScore: 50 },
  ]);
  assert.equal(stats.total, 5);
  assert.equal(stats.decided, 3);
  assert.equal(stats.acceptanceRate, 0.333);
  assert.deepEqual(stats.byStatus, { pending: 1, accepted: 1, rejected: 2, withdrawn: 1 });
  assert.equal(stats.averageScore, 65);
  assert.equal(stats.averageScoreAccepted, 90);
  assert.equal(stats.averageScoreRejected, 58);
});

test('candidatures : taux d’acceptation par tranche de score', () => {
  const stats = applicationStats([
    { status: 'accepted', matchScore: 92 },
    { status: 'accepted', matchScore: 80 },
    { status: 'rejected', matchScore: 81 },
    { status: 'rejected', matchScore: 20 },
    { status: 'pending', matchScore: 95 },
  ]);
  const excellent = stats.scoreBands.find((band) => band.key === 'excellent');
  const low = stats.scoreBands.find((band) => band.key === 'low');
  const good = stats.scoreBands.find((band) => band.key === 'good');
  assert.deepEqual(excellent, { key: 'excellent', label: '80 – 100', decided: 3, accepted: 2, acceptanceRate: 0.667 });
  assert.equal(low.acceptanceRate, 0);
  assert.equal(good.acceptanceRate, null);
});

test('délai moyen de réponse en jours', () => {
  const stats = applicationStats([
    { status: 'accepted', createdAt: '2026-11-01T00:00:00Z', decidedAt: '2026-11-03T00:00:00Z' },
    { status: 'rejected', createdAt: '2026-11-01T00:00:00Z', decidedAt: '2026-11-05T00:00:00Z' },
    { status: 'pending', createdAt: '2026-11-01T00:00:00Z' },
  ]);
  assert.equal(stats.averageResponseDays, 3);
});

test('sans candidature, aucune statistique inventée', () => {
  const stats = applicationStats([]);
  assert.equal(stats.acceptanceRate, null);
  assert.equal(stats.averageResponseDays, null);
  assert.equal(stats.averageScore, null);
});

test('comptage par catégorie, du plus fréquent au moins fréquent', () => {
  assert.deepEqual(countBy(['student', 'employee_permanent', 'student', null]), [
    { key: 'student', count: 2 },
    { key: 'employee_permanent', count: 1 },
  ]);
});
