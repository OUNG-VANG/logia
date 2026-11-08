// Score de compatibilité entre un locataire et un logement.
//
// Méthode : moyenne pondérée de 7 critères, chacun noté de 0 à 1. Un critère sans donnée
// (ex. revenus non renseignés) est écarté et les poids restants sont renormalisés ; la part
// des poids réellement utilisés donne la « confiance » du score.
//
// L'âge, le sexe et la civilité ne sont jamais utilisés : ce sont des critères de
// discrimination interdits pour choisir un locataire (art. 225-1 du Code pénal).

const DAY = 24 * 60 * 60 * 1000;

const weights = {
  budget: 20,
  effortRate: 25,
  guarantor: 15,
  location: 15,
  moveIn: 10,
  size: 10,
  dossier: 5,
};

const labels = {
  budget: 'Budget',
  effortRate: 'Taux d’effort',
  guarantor: 'Garantie',
  location: 'Ville recherchée',
  moveIn: 'Date d’emménagement',
  size: 'Taille du logement',
  dossier: 'Dossier',
};

const euros = (value) => `${Math.round(value).toLocaleString('fr-FR')} €`;
const percent = (value) => `${Math.round(value * 100)} %`;
const clamp = (value) => Math.min(1, Math.max(0, value));
// Interpolation linéaire : vaut 1 en `good`, 0 en `bad`.
const decreasing = (value, good, bad) => clamp((bad - value) / (bad - good));

function normalizeCity(value = '') {
  return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr-FR').replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim();
}

function monthlyCost(listing) {
  return (Number(listing.rent) || 0) + (Number(listing.charges) || 0);
}

// Surface minimale conseillée : 9 m² pour une personne, 16 m² pour deux, +9 m² par personne en plus
// (seuils de peuplement utilisés notamment par la CAF).
function minimumArea(occupants) {
  return occupants <= 1 ? 9 : 16 + 9 * (occupants - 2);
}

const criteria = {
  budget(tenant, listing) {
    const budget = Number(tenant.maxBudget);
    if (!budget) return null;
    const cost = monthlyCost(listing);
    const ratio = cost / budget;
    return {
      score: decreasing(ratio, 1, 1.2),
      detail: ratio <= 1
        ? `${euros(cost)} charges comprises, dans ton budget de ${euros(budget)}.`
        : `${euros(cost)} charges comprises, ${percent(ratio - 1)} au-dessus du budget de ${euros(budget)}.`,
    };
  },

  effortRate(tenant, listing) {
    if (tenant.monthlyIncome === null || tenant.monthlyIncome === undefined || tenant.monthlyIncome === '') return null;
    const income = Number(tenant.monthlyIncome);
    const cost = monthlyCost(listing);
    if (!(income > 0)) return { score: 0, detail: 'Aucun revenu déclaré pour payer le loyer.' };
    const rate = cost / income;
    return {
      score: decreasing(rate, 0.33, 0.5),
      detail: `Le loyer représente ${percent(rate)} des revenus (repère courant : 33 % maximum).`,
    };
  },

  guarantor(tenant, listing) {
    const type = tenant.guarantorType;
    if (!type) return null;
    if (type === 'visale' || type === 'organization') return { score: 1, detail: 'Garantie par un organisme (Visale ou caution).' };
    if (type === 'family') return { score: 1, detail: 'Garant familial ou proche.' };
    if (type === 'other') return { score: 0.7, detail: 'Autre forme de garantie.' };
    // Sans garant, des revenus confortables compensent en partie.
    const income = Number(tenant.monthlyIncome);
    const comfortable = income > 0 && monthlyCost(listing) / income <= 0.33;
    return {
      score: comfortable ? 0.6 : 0.2,
      detail: comfortable ? 'Pas de garant, mais des revenus suffisants.' : 'Pas de garant et des revenus justes.',
    };
  },

  location(tenant, listing) {
    if (!tenant.desiredCity) return null;
    const wanted = normalizeCity(tenant.desiredCity);
    const city = normalizeCity(listing.location?.city);
    const match = Boolean(city) && (city === wanted || city.startsWith(wanted + ' ') || wanted.startsWith(city + ' '));
    return {
      score: match ? 1 : 0,
      detail: match
        ? `Situé à ${listing.location.city}, la ville recherchée.`
        : `Situé à ${listing.location?.city || 'une autre ville'}, pas à ${tenant.desiredCity}.`,
    };
  },

  moveIn(tenant, listing, now) {
    if (!tenant.desiredMoveIn) return null;
    const desired = new Date(tenant.desiredMoveIn).getTime();
    const available = listing.availableFrom ? new Date(listing.availableFrom).getTime() : now.getTime();
    const daysLate = (available - desired) / DAY;
    if (daysLate <= 0) {
      // Disponible bien avant la date voulue : le bailleur devrait attendre plusieurs mois.
      const early = -daysLate > 60;
      return {
        score: early ? 0.7 : 1,
        detail: early ? 'Disponible plus de deux mois avant la date souhaitée.' : 'Disponible à la date souhaitée.',
      };
    }
    return {
      score: daysLate <= 30 ? 1 - (daysLate / 30) * 0.5 : decreasing(daysLate, 30, 90) * 0.5,
      detail: `Disponible ${Math.ceil(daysLate)} jour${Math.ceil(daysLate) > 1 ? 's' : ''} après la date souhaitée.`,
    };
  },

  size(tenant, listing) {
    const occupants = Number(tenant.householdSize);
    if (!occupants) return null;
    const area = Number(listing.areaM2);
    let result;
    if (area > 0) {
      const needed = minimumArea(occupants);
      result = {
        score: clamp((area / needed - 0.75) / 0.25),
        detail: `${area} m² pour ${occupants} occupant${occupants > 1 ? 's' : ''} (minimum conseillé : ${needed} m²).`,
      };
    } else if (Number(listing.bedrooms) > 0 || occupants === 1) {
      const bedrooms = Number(listing.bedrooms) || 0;
      result = {
        score: bedrooms >= occupants - 1 ? 1 : 0.5,
        detail: `${bedrooms} chambre${bedrooms > 1 ? 's' : ''} pour ${occupants} occupant${occupants > 1 ? 's' : ''}.`,
      };
    } else {
      return null;
    }
    if (listing.propertyType === 'room' && occupants > 1) {
      result = { score: Math.min(result.score, 0.3), detail: 'Une chambre seule pour plusieurs occupants.' };
    }
    return result;
  },

  dossier(tenant, listing, now, dossier) {
    if (!dossier?.requiredCount) return null;
    const ratio = dossier.providedCount / dossier.requiredCount;
    return {
      score: ratio,
      detail: dossier.complete
        ? 'Toutes les pièces obligatoires sont fournies.'
        : `${dossier.providedCount} pièce${dossier.providedCount > 1 ? 's' : ''} sur ${dossier.requiredCount} fournie${dossier.providedCount > 1 ? 's' : ''}.`,
    };
  },
};

function levelFor(score) {
  if (score >= 80) return { key: 'excellent', label: 'Excellente compatibilité' };
  if (score >= 60) return { key: 'good', label: 'Bonne compatibilité' };
  if (score >= 40) return { key: 'average', label: 'Compatibilité moyenne' };
  return { key: 'low', label: 'Compatibilité faible' };
}

// tenantProfile : profil locataire ; listing : annonce ; dossier : résumé de dossierSummary (facultatif).
function computeMatch(tenantProfile, listing, dossier = null, now = new Date()) {
  const tenant = tenantProfile || {};
  const details = Object.keys(weights).map((key) => {
    const result = criteria[key](tenant, listing, now, dossier);
    return {
      key,
      label: labels[key],
      weight: weights[key],
      score: result ? Math.round(result.score * 100) / 100 : null,
      detail: result ? result.detail : 'Information non renseignée dans le profil.',
    };
  });

  const used = details.filter((criterion) => criterion.score !== null);
  const usedWeight = used.reduce((sum, criterion) => sum + criterion.weight, 0);
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  // Le dossier seul ne dit rien de l'adéquation au logement : il faut au moins un critère du profil.
  const hasProfileData = used.some((criterion) => criterion.key !== 'dossier');
  const score = hasProfileData
    ? Math.round((used.reduce((sum, criterion) => sum + criterion.weight * criterion.score, 0) / usedWeight) * 100)
    : null;

  return {
    score,
    level: score === null ? null : levelFor(score),
    confidence: Math.round((usedWeight / totalWeight) * 100) / 100,
    criteria: details,
  };
}

module.exports = { weights, computeMatch, minimumArea, normalizeCity };
