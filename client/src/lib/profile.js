export const genderLabels = {
  female: 'Madame',
  male: 'Monsieur',
  other: 'Autre',
  undisclosed: 'Je préfère ne pas le dire',
}

export const situationLabels = {
  student: 'Étudiant·e',
  apprentice: 'Alternant·e / apprenti·e',
  employee_permanent: 'Salarié·e en CDI',
  employee_fixed_term: 'Salarié·e en CDD',
  temporary_worker: 'Intérimaire',
  self_employed: 'Indépendant·e / freelance',
  civil_servant: 'Fonctionnaire',
  job_seeker: 'En recherche d’emploi',
  retired: 'Retraité·e',
  other: 'Autre situation',
}

export const guarantorLabels = {
  none: 'Pas de garant',
  family: 'Garant familial ou proche',
  visale: 'Garantie Visale',
  organization: 'Organisme de caution',
  other: 'Autre garantie',
}

export const emptyProfile = {
  firstName: '',
  lastName: '',
  gender: '',
  tenantProfile: {
    birthDate: '',
    situation: '',
    occupationDetail: '',
    monthlyIncome: '',
    guarantorType: '',
    householdSize: '',
    desiredMoveIn: '',
    desiredCity: '',
    maxBudget: '',
  },
}

function dateInputValue(value) {
  return value ? String(value).slice(0, 10) : ''
}

// Convertit l'utilisateur renvoyé par l'API en valeurs de formulaire.
export function profileFormFromUser(user) {
  const tenant = user?.tenantProfile || {}
  return {
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    gender: user?.gender || '',
    tenantProfile: {
      birthDate: dateInputValue(tenant.birthDate),
      situation: tenant.situation || '',
      occupationDetail: tenant.occupationDetail || '',
      monthlyIncome: tenant.monthlyIncome ?? '',
      guarantorType: tenant.guarantorType || '',
      householdSize: tenant.householdSize ?? '',
      desiredMoveIn: dateInputValue(tenant.desiredMoveIn),
      desiredCity: tenant.desiredCity || '',
      maxBudget: tenant.maxBudget ?? '',
    },
  }
}

// Prépare le profil à envoyer à l'API selon le rôle.
export function profilePayload(profile, role) {
  const payload = { firstName: profile.firstName, lastName: profile.lastName, gender: profile.gender }
  if (role === 'tenant') payload.tenantProfile = profile.tenantProfile
  return payload
}

export function fullName(person) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ')
}

export function formatEuros(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}
