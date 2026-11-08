const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMatch, minimumArea, normalizeCity } = require('../src/lib/matching');

const now = new Date('2026-11-08T12:00:00Z');

const listing = {
  title: 'Studio Croix-Rousse',
  propertyType: 'studio',
  location: { city: 'Lyon', postalCode: '69004' },
  rent: 550,
  charges: 50,
  areaM2: 24,
  bedrooms: 0,
  availableFrom: '2026-12-01',
};

const idealTenant = {
  situation: 'employee_permanent',
  monthlyIncome: 2400,
  guarantorType: 'visale',
  householdSize: 1,
  desiredMoveIn: '2026-12-01',
  desiredCity: 'Lyon',
  maxBudget: 700,
};

const completeDossier = { requiredCount: 4, providedCount: 4, complete: true };

const criterion = (result, key) => result.criteria.find((item) => item.key === key);

test('un profil idéal obtient 100 avec une confiance totale', () => {
  const result = computeMatch(idealTenant, listing, completeDossier, now);
  assert.equal(result.score, 100);
  assert.equal(result.confidence, 1);
  assert.equal(result.level.key, 'excellent');
});

test('le score reste entre 0 et 100', () => {
  const worst = computeMatch(
    { monthlyIncome: 500, guarantorType: 'none', householdSize: 4, desiredMoveIn: '2026-06-01', desiredCity: 'Brest', maxBudget: 300 },
    { ...listing, propertyType: 'room', areaM2: 10 },
    { requiredCount: 4, providedCount: 0, complete: false },
    now,
  );
  assert.ok(worst.score >= 0 && worst.score <= 100);
  assert.equal(worst.level.key, 'low');
});

test('budget : plein score sous le budget, zéro à +20 %', () => {
  assert.equal(criterion(computeMatch({ maxBudget: 600 }, listing, null, now), 'budget').score, 1);
  assert.equal(criterion(computeMatch({ maxBudget: 500 }, listing, null, now), 'budget').score, 0);
  const halfway = criterion(computeMatch({ maxBudget: 600 / 1.1 }, listing, null, now), 'budget').score;
  assert.ok(Math.abs(halfway - 0.5) < 0.02);
});

test('taux d’effort : plein score à 33 %, zéro à 50 %', () => {
  assert.equal(criterion(computeMatch({ monthlyIncome: 2000 }, listing, null, now), 'effortRate').score, 1);
  assert.equal(criterion(computeMatch({ monthlyIncome: 1200 }, listing, null, now), 'effortRate').score, 0);
  assert.equal(criterion(computeMatch({ monthlyIncome: 0 }, listing, null, now), 'effortRate').score, 0);
});

test('un critère sans donnée est ignoré et baisse la confiance', () => {
  const result = computeMatch({ desiredCity: 'Lyon' }, listing, null, now);
  assert.equal(result.score, 100);
  assert.equal(result.confidence, 0.15);
  assert.equal(criterion(result, 'budget').score, null);
});

test('sans aucune donnée, pas de score', () => {
  const result = computeMatch({}, listing, null, now);
  assert.equal(result.score, null);
  assert.equal(result.level, null);
  assert.equal(result.confidence, 0);
});

test('le dossier seul ne suffit pas à donner un score', () => {
  const result = computeMatch({}, listing, completeDossier, now);
  assert.equal(result.score, null);
});

test('ville : insensible aux accents, aux tirets et à la casse', () => {
  assert.equal(normalizeCity('Saint-Étienne'), normalizeCity('saint etienne'));
  const result = computeMatch({ desiredCity: 'lyon' }, listing, null, now);
  assert.equal(criterion(result, 'location').score, 1);
  assert.equal(criterion(computeMatch({ desiredCity: 'Paris' }, listing, null, now), 'location').score, 0);
});

test('date : un logement disponible 15 jours trop tard perd un quart du critère', () => {
  const result = computeMatch({ desiredMoveIn: '2026-11-16' }, listing, null, now);
  assert.equal(criterion(result, 'moveIn').score, 0.75);
});

test('taille : seuils de peuplement 9 m², 16 m², +9 m² par personne', () => {
  assert.equal(minimumArea(1), 9);
  assert.equal(minimumArea(2), 16);
  assert.equal(minimumArea(4), 34);
  assert.equal(criterion(computeMatch({ householdSize: 2 }, listing, null, now), 'size').score, 1);
  assert.equal(criterion(computeMatch({ householdSize: 4 }, listing, null, now), 'size').score, 0);
});

test('garant : sans garant, des revenus confortables comptent', () => {
  const comfortable = computeMatch({ guarantorType: 'none', monthlyIncome: 3000 }, listing, null, now);
  const tight = computeMatch({ guarantorType: 'none', monthlyIncome: 1300 }, listing, null, now);
  assert.equal(criterion(comfortable, 'guarantor').score, 0.6);
  assert.equal(criterion(tight, 'guarantor').score, 0.2);
});

test('l’âge et le sexe n’ont aucun effet sur le score', () => {
  const base = computeMatch(idealTenant, listing, completeDossier, now);
  const other = computeMatch({ ...idealTenant, birthDate: '1950-01-01', gender: 'female' }, listing, completeDossier, now);
  assert.deepEqual(other, base);
});
