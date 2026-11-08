// Validation et mise en forme des informations de profil (nom, civilité, profil locataire).

const genders = ['female', 'male', 'other', 'undisclosed'];
const situations = [
  'student', 'apprentice', 'employee_permanent', 'employee_fixed_term', 'temporary_worker',
  'self_employed', 'civil_servant', 'job_seeker', 'retired', 'other',
];
const guarantorTypes = ['none', 'family', 'visale', 'organization', 'other'];

class ProfileError extends Error {}

function text(value, label, { required, max = 60 }) {
  const result = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (required && !result) throw new ProfileError(`${label} est obligatoire.`);
  if (result.length > max) throw new ProfileError(`${label} doit faire ${max} caractères au maximum.`);
  return result;
}

function choice(value, allowed, label, { required }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ProfileError(`${label} est obligatoire.`);
    return undefined;
  }
  if (!allowed.includes(value)) throw new ProfileError(`${label} est invalide.`);
  return value;
}

function number(value, label, { min = 0, max, integer = false }) {
  if (value === undefined || value === null || value === '') return undefined;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || (max !== undefined && result > max) || (integer && !Number.isInteger(result))) {
    throw new ProfileError(`${label} est invalide.`);
  }
  return result;
}

function date(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ProfileError(`${label} est obligatoire.`);
    return undefined;
  }
  const result = new Date(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(result.getTime())) {
    throw new ProfileError(`${label} est invalide.`);
  }
  return result;
}

function ageOn(birthDate, today = new Date()) {
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday = today.getMonth() < birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Lit le profil envoyé par le client. Lève ProfileError avec un message lisible si un champ est invalide.
function parseProfile(body, role) {
  const input = body || {};
  const profile = {
    firstName: text(input.firstName, 'Le prénom', { required: true }),
    lastName: text(input.lastName, 'Le nom', { required: true }),
    gender: choice(input.gender, genders, 'La civilité', { required: true }),
  };

  if (role !== 'tenant') return profile;

  const tenant = input.tenantProfile || {};
  const birthDate = date(tenant.birthDate, 'La date de naissance', { required: true });
  const age = ageOn(birthDate);
  if (age < 16 || age > 120) {
    throw new ProfileError('La date de naissance est invalide : il faut avoir au moins 16 ans.');
  }

  profile.tenantProfile = {
    birthDate,
    situation: choice(tenant.situation, situations, 'La situation', { required: true }),
    occupationDetail: text(tenant.occupationDetail, 'Le détail de la situation', { required: false, max: 120 }),
    monthlyIncome: number(tenant.monthlyIncome, 'Le revenu mensuel', { max: 1000000 }),
    guarantorType: choice(tenant.guarantorType, guarantorTypes, 'Le type de garant', { required: false }),
    householdSize: number(tenant.householdSize, 'Le nombre de personnes', { min: 1, max: 20, integer: true }),
    desiredMoveIn: date(tenant.desiredMoveIn, 'La date d’emménagement'),
    desiredCity: text(tenant.desiredCity, 'La ville recherchée', { required: false, max: 80 }),
    maxBudget: number(tenant.maxBudget, 'Le budget maximum', { max: 100000 }),
  };
  return profile;
}

function isProfileComplete(user) {
  if (!user.firstName || !user.lastName || !user.gender) return false;
  if (user.role !== 'tenant') return true;
  return Boolean(user.tenantProfile?.birthDate && user.tenantProfile?.situation);
}

// Ce que le compte voit de lui-même.
function publicUser(user) {
  const result = {
    id: user._id,
    email: user.email,
    role: user.role,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    gender: user.gender || '',
    profileComplete: isProfileComplete(user),
  };
  if (user.role === 'tenant') {
    const tenant = user.tenantProfile || {};
    result.tenantProfile = {
      birthDate: tenant.birthDate || null,
      situation: tenant.situation || '',
      occupationDetail: tenant.occupationDetail || '',
      monthlyIncome: tenant.monthlyIncome ?? null,
      guarantorType: tenant.guarantorType || '',
      householdSize: tenant.householdSize ?? null,
      desiredMoveIn: tenant.desiredMoveIn || null,
      desiredCity: tenant.desiredCity || '',
      maxBudget: tenant.maxBudget ?? null,
    };
  }
  return result;
}

// Ce qu'un propriétaire voit d'un candidat. La date de naissance et la civilité ne sont pas
// transmises : le sexe et l'âge ne doivent pas servir à choisir un locataire (art. 225-1 du Code pénal).
function applicantSummary(user) {
  if (!user) return null;
  const tenant = user.tenantProfile || {};
  return {
    id: user._id,
    email: user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    situation: tenant.situation || '',
    occupationDetail: tenant.occupationDetail || '',
    monthlyIncome: tenant.monthlyIncome ?? null,
    guarantorType: tenant.guarantorType || '',
    householdSize: tenant.householdSize ?? null,
    desiredMoveIn: tenant.desiredMoveIn || null,
  };
}

// Nom affiché publiquement pour un propriétaire : « Marie D. ».
function publicLandlordName(user) {
  if (!user?.firstName) return '';
  return user.lastName ? `${user.firstName} ${user.lastName.charAt(0).toUpperCase()}.` : user.firstName;
}

module.exports = {
  genders,
  situations,
  guarantorTypes,
  ProfileError,
  parseProfile,
  publicUser,
  applicantSummary,
  publicLandlordName,
};
