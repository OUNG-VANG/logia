const test = require('node:test');
const assert = require('node:assert/strict');
const { auc, accuracy, toFeatures, train, predictProbability, trainAndEvaluate, featureKeys, MIN_DECISIONS } = require('../src/lib/ml');

// Générateur reproductible pour les données de test.
function makeRandom(seed = 1) {
  let state = seed;
  return () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
}

// Propriétaires fictifs qui ne regardent que le taux d'effort et le garant : le modèle doit le retrouver.
function syntheticSamples(count, seed = 3) {
  const random = makeRandom(seed);
  return Array.from({ length: count }, () => {
    const criteria = Object.fromEntries(featureKeys.map((key) => [key, Math.round(random() * 100) / 100]));
    const accepted = 0.7 * criteria.effortRate + 0.3 * criteria.guarantor + (random() - 0.5) * 0.2 > 0.5;
    const matchScore = Math.round(criteria.location * 100); // un score « règles » volontairement mauvais
    return { criteria, matchScore, accepted };
  });
}

test('AUC : 1 pour un classement parfait, 0,5 pour des notes identiques, 0 pour un classement inversé', () => {
  assert.equal(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
  assert.equal(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]), 0.5);
  assert.equal(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]), 0);
  assert.equal(auc([0.3, 0.4], [1, 1]), null);
});

test('précision au seuil de 0,5', () => {
  assert.equal(accuracy([0.9, 0.2, 0.6, 0.4], [1, 0, 0, 0]), 0.75);
});

test('un critère non renseigné devient la valeur neutre 0,5', () => {
  const features = toFeatures({ budget: 1, effortRate: null });
  assert.equal(features.length, featureKeys.length);
  assert.equal(features[featureKeys.indexOf('budget')], 1);
  assert.equal(features[featureKeys.indexOf('effortRate')], 0.5);
});

test('la régression logistique apprend une règle simple', () => {
  const X = [[0], [0.1], [0.2], [0.3], [0.7], [0.8], [0.9], [1]];
  const y = [0, 0, 0, 0, 1, 1, 1, 1];
  const model = train(X, y, { l2: 0 });
  assert.ok(predictProbability(model, [0.05]) < 0.2);
  assert.ok(predictProbability(model, [0.95]) > 0.8);
});

test('pas d’apprentissage sous le seuil minimal de décisions', () => {
  const result = trainAndEvaluate(syntheticSamples(MIN_DECISIONS - 1));
  assert.equal(result.status, 'insufficient');
  assert.equal(result.decisions, MIN_DECISIONS - 1);
});

test('pas d’apprentissage si toutes les décisions sont identiques', () => {
  const samples = syntheticSamples(40).map((sample) => ({ ...sample, accepted: true }));
  assert.equal(trainAndEvaluate(samples).status, 'single-class');
});

test('le modèle retrouve les critères qui comptent et bat un mauvais score à base de règles', () => {
  const result = trainAndEvaluate(syntheticSamples(200));
  assert.equal(result.status, 'trained');
  const top = [...result.criteria].sort((a, b) => b.learnedImportance - a.learnedImportance).map((item) => item.key);
  assert.deepEqual(top.slice(0, 2), ['effortRate', 'guarantor']);
  assert.ok(result.evaluation.model.auc > 0.9, `AUC du modèle trop faible : ${result.evaluation.model.auc}`);
  assert.ok(result.evaluation.model.auc > result.evaluation.rules.auc + 0.2);
});

test('les résultats sont reproductibles', () => {
  const samples = syntheticSamples(80);
  assert.deepEqual(trainAndEvaluate(samples), trainAndEvaluate(samples));
});
