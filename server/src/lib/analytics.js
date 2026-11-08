// Calculs de l'Observatoire Logia. Fonctions pures : elles reçoivent des objets simples
// et ne renvoient que des agrégats, jamais de données personnelles.

const DAY = 24 * 60 * 60 * 1000;

const scoreBands = [
  { key: 'low', label: '0 – 39', min: 0, max: 39 },
  { key: 'average', label: '40 – 59', min: 40, max: 59 },
  { key: 'good', label: '60 – 79', min: 60, max: 79 },
  { key: 'excellent', label: '80 – 100', min: 80, max: 100 },
];

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeCityName(value = '') {
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase('fr-FR') + trimmed.slice(1) : '';
}

// Loyers des annonces publiées, regroupés par ville.
function marketByCity(listings) {
  const groups = new Map();
  listings.forEach((listing) => {
    const city = normalizeCityName(listing.location?.city);
    const rent = Number(listing.rent);
    if (!city || !(rent > 0)) return;
    const key = city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr-FR');
    const group = groups.get(key) || { city, rents: [], rentsPerM2: [] };
    group.rents.push(rent);
    const area = Number(listing.areaM2);
    if (area > 0) group.rentsPerM2.push(rent / area);
    groups.set(key, group);
  });

  return [...groups.values()]
    .map(({ city, rents, rentsPerM2 }) => ({
      city,
      listings: rents.length,
      averageRent: round(average(rents)),
      medianRent: round(median(rents)),
      averageRentPerM2: rentsPerM2.length ? round(average(rentsPerM2), 1) : null,
    }))
    .sort((a, b) => b.averageRent - a.averageRent);
}

// Statistiques des candidatures : statuts, taux d'acceptation, délai de réponse et lien avec le score.
// Chaque candidature : { status, createdAt, decidedAt, matchScore }.
function applicationStats(applications) {
  const byStatus = { pending: 0, accepted: 0, rejected: 0, withdrawn: 0 };
  applications.forEach((application) => {
    if (byStatus[application.status] !== undefined) byStatus[application.status] += 1;
  });

  const decided = applications.filter((application) => application.status === 'accepted' || application.status === 'rejected');
  const responseDays = decided
    .filter((application) => application.decidedAt && application.createdAt)
    .map((application) => (new Date(application.decidedAt) - new Date(application.createdAt)) / DAY)
    .filter((days) => days >= 0);

  const scored = decided.filter((application) => Number.isFinite(application.matchScore));
  const bands = scoreBands.map((band) => {
    const inBand = scored.filter((application) => application.matchScore >= band.min && application.matchScore <= band.max);
    const accepted = inBand.filter((application) => application.status === 'accepted').length;
    return {
      key: band.key,
      label: band.label,
      decided: inBand.length,
      accepted,
      acceptanceRate: inBand.length ? round(accepted / inBand.length, 3) : null,
    };
  });

  const scoresFor = (status) => scored.filter((application) => application.status === status).map((application) => application.matchScore);
  const allScores = applications.map((application) => application.matchScore).filter(Number.isFinite);

  return {
    total: applications.length,
    byStatus,
    decided: decided.length,
    acceptanceRate: decided.length ? round(byStatus.accepted / decided.length, 3) : null,
    averageResponseDays: responseDays.length ? round(average(responseDays), 1) : null,
    averageScore: allScores.length ? round(average(allScores)) : null,
    averageScoreAccepted: scoresFor('accepted').length ? round(average(scoresFor('accepted'))) : null,
    averageScoreRejected: scoresFor('rejected').length ? round(average(scoresFor('rejected'))) : null,
    scoreBands: bands,
  };
}

// Nombre de candidats par situation (étudiant, CDI…), du plus fréquent au moins fréquent.
function countBy(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

module.exports = { scoreBands, marketByCity, applicationStats, countBy, median };
