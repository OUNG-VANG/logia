// Apprentissage automatique : prédire si une candidature sera acceptée.
//
// Modèle : régression logistique (sans librairie), entraînée par descente de gradient avec
// régularisation L2. Entrées : les 7 notes de critères du score de compatibilité (0 à 1).
// Sortie : probabilité d'acceptation. Les coefficients appris se lisent comme l'importance
// de chaque critère pour les propriétaires, ce qui garde le modèle explicable.
//
// Évaluation : validation croisée en k plis, comparée au score à base de règles sur les mêmes plis.

const { weights: ruleWeights } = require('./matching');

const featureKeys = Object.keys(ruleWeights);
// En dessous, l'échantillon est trop petit pour apprendre quoi que ce soit de fiable.
const MIN_DECISIONS = 30;

const sigmoid = (value) => 1 / (1 + Math.exp(-value));
const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

// Un critère non renseigné est remplacé par 0,5 (valeur neutre).
function toFeatures(criteria) {
  return featureKeys.map((key) => {
    const value = criteria?.[key];
    return Number.isFinite(value) ? value : 0.5;
  });
}

function predictProbability(model, features) {
  return sigmoid(model.bias + model.weights.reduce((sum, weight, index) => sum + weight * features[index], 0));
}

function train(X, y, { learningRate = 0.5, epochs = 3000, l2 = 0.01 } = {}) {
  const featureCount = X[0]?.length || 0;
  const weights = new Array(featureCount).fill(0);
  let bias = 0;
  const n = X.length;
  if (!n) return { weights, bias };

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradient = new Array(featureCount).fill(0);
    let biasGradient = 0;
    for (let row = 0; row < n; row += 1) {
      const error = predictProbability({ weights, bias }, X[row]) - y[row];
      for (let feature = 0; feature < featureCount; feature += 1) gradient[feature] += error * X[row][feature];
      biasGradient += error;
    }
    for (let feature = 0; feature < featureCount; feature += 1) {
      weights[feature] -= learningRate * (gradient[feature] / n + l2 * weights[feature]);
    }
    bias -= learningRate * (biasGradient / n);
  }
  return { weights, bias };
}

// AUC : probabilité qu'une candidature acceptée tirée au hasard ait une note plus haute
// qu'une candidature refusée (0,5 = hasard, 1 = parfait). Calcul par les rangs (Mann-Whitney).
function auc(scores, labels) {
  const pairs = scores.map((score, index) => ({ score, label: labels[index] })).sort((a, b) => a.score - b.score);
  const positives = labels.filter((label) => label === 1).length;
  const negatives = labels.length - positives;
  if (!positives || !negatives) return null;

  let rankSum = 0;
  let index = 0;
  while (index < pairs.length) {
    let end = index;
    while (end + 1 < pairs.length && pairs[end + 1].score === pairs[index].score) end += 1;
    const averageRank = (index + end) / 2 + 1; // les ex æquo partagent le rang moyen
    for (let tied = index; tied <= end; tied += 1) if (pairs[tied].label === 1) rankSum += averageRank;
    index = end + 1;
  }
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function accuracy(probabilities, labels, threshold = 0.5) {
  if (!labels.length) return null;
  const correct = probabilities.filter((probability, index) => (probability >= threshold ? 1 : 0) === labels[index]).length;
  return correct / labels.length;
}

// Mélange reproductible (même graine = mêmes plis), pour que les résultats soient stables.
function shuffledIndices(length, seed = 7) {
  let state = seed;
  const random = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [indices[index], indices[swap]] = [indices[swap], indices[index]];
  }
  return indices;
}

// Validation croisée : chaque candidature est prédite par un modèle qui ne l'a pas vue.
// ruleScores : score à base de règles (0 à 100) pour comparer sur exactement les mêmes données.
function crossValidate(X, y, ruleScores, folds = 5) {
  const order = shuffledIndices(X.length);
  const modelPredictions = new Array(X.length);
  for (let fold = 0; fold < folds; fold += 1) {
    const testIndices = order.filter((_, position) => position % folds === fold);
    const trainIndices = order.filter((_, position) => position % folds !== fold);
    const model = train(trainIndices.map((index) => X[index]), trainIndices.map((index) => y[index]));
    testIndices.forEach((index) => { modelPredictions[index] = predictProbability(model, X[index]); });
  }
  const ruleProbabilities = ruleScores.map((score) => score / 100);
  return {
    folds,
    model: { auc: auc(modelPredictions, y), accuracy: accuracy(modelPredictions, y) },
    rules: { auc: auc(ruleProbabilities, y), accuracy: accuracy(ruleProbabilities, y) },
  };
}

// Entraîne sur toutes les décisions et évalue par validation croisée.
// samples : [{ criteria: { budget: 0.8, ... }, matchScore: 74, accepted: true }]
function trainAndEvaluate(samples) {
  const usable = samples.filter((sample) => sample.criteria && Number.isFinite(sample.matchScore));
  const accepted = usable.filter((sample) => sample.accepted).length;
  const base = { decisions: usable.length, accepted, minDecisions: MIN_DECISIONS };

  if (usable.length < MIN_DECISIONS) return { ...base, status: 'insufficient' };
  if (!accepted || accepted === usable.length) return { ...base, status: 'single-class' };

  const X = usable.map((sample) => toFeatures(sample.criteria));
  const y = usable.map((sample) => (sample.accepted ? 1 : 0));
  const model = train(X, y);
  const evaluation = crossValidate(X, y, usable.map((sample) => sample.matchScore));

  // Importance relative : part de chaque coefficient (en valeur absolue), sur 100, pour comparer aux poids des règles.
  const totalAbsolute = model.weights.reduce((sum, weight) => sum + Math.abs(weight), 0) || 1;
  const criteria = featureKeys.map((key, index) => ({
    key,
    coefficient: round(model.weights[index]),
    learnedImportance: Math.round((Math.abs(model.weights[index]) / totalAbsolute) * 100),
    ruleWeight: ruleWeights[key],
  }));

  return {
    ...base,
    status: 'trained',
    method: 'Régression logistique (descente de gradient, régularisation L2)',
    bias: round(model.bias),
    criteria,
    evaluation: {
      folds: evaluation.folds,
      model: { auc: evaluation.model.auc === null ? null : round(evaluation.model.auc), accuracy: round(evaluation.model.accuracy) },
      rules: { auc: evaluation.rules.auc === null ? null : round(evaluation.rules.auc), accuracy: round(evaluation.rules.accuracy) },
    },
  };
}

module.exports = { featureKeys, MIN_DECISIONS, toFeatures, train, predictProbability, auc, accuracy, crossValidate, trainAndEvaluate };
