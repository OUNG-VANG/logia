// Jeu de démonstration pour l'Observatoire et le matching.
// Crée 3 propriétaires, 10 annonces, 12 locataires avec dossier complet, ~36 candidatures et des réponses.
//
// À lancer UNIQUEMENT contre une API branchée sur une base de test, jamais sur tes vraies données :
//   PORT=5099 MONGODB_URI=mongodb://127.0.0.1:27017/logia_demo npm start
//   node scripts/seed-demo.mjs http://localhost:5099/api
const API = process.argv[2]
if (!API) {
  console.error('Indique l’adresse d’une API de test, par exemple : node scripts/seed-demo.mjs http://localhost:5099/api')
  process.exit(1)
}
const run = Date.now().toString(36)
const password = 'motdepasse-test'
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64')

// Générateur pseudo-aléatoire déterministe : le jeu est reproductible.
let seed = 42
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

async function call(method, path, body, token) {
  const response = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

async function register(prefix, role, profile) {
  const { data } = await call('POST', '/auth/register', { email: `${prefix}.${run}@test.local`, password, role, ...profile })
  return data.token
}

const landlords = [
  { firstName: 'Lina', lastName: 'Moreau', gender: 'female' },
  { firstName: 'Paul', lastName: 'Roy', gender: 'male' },
  { firstName: 'Nadia', lastName: 'Haddad', gender: 'female' },
]

const listings = [
  ['Studio Croix-Rousse', 'studio', 'Lyon', '69004', 560, 40, 24, 0, 45.774, 4.83],
  ['T2 Part-Dieu', 'apartment', 'Lyon', '69003', 820, 70, 42, 1, 45.761, 4.857],
  ['Chambre Guillotière', 'room', 'Lyon', '69007', 410, 30, 12, 0, 45.753, 4.843],
  ['T3 Monplaisir', 'apartment', 'Lyon', '69008', 1090, 90, 64, 2, 45.745, 4.871],
  ['Studio Oberkampf', 'studio', 'Paris', '75011', 890, 60, 20, 0, 48.865, 2.378],
  ['T2 Batignolles', 'apartment', 'Paris', '75017', 1380, 110, 38, 1, 48.887, 2.317],
  ['T2 Chartrons', 'apartment', 'Bordeaux', '33000', 740, 60, 45, 1, 44.853, -0.571],
  ['Studio Victoire', 'studio', 'Bordeaux', '33000', 520, 40, 22, 0, 44.831, -0.572],
  ['T3 Capitole', 'apartment', 'Toulouse', '31000', 880, 70, 62, 2, 43.604, 1.444],
  ['Studio Saint-Cyprien', 'studio', 'Toulouse', '31300', 480, 35, 21, 0, 43.598, 1.432],
]

const tenants = [
  ['Amel', 'Saidi', 'female', 'employee_permanent', 2400, 'visale', 1, 'Lyon', 750],
  ['Bruno', 'Costa', 'male', 'student', 900, 'family', 1, 'Lyon', 500],
  ['Chloé', 'Fabre', 'female', 'student', 650, 'none', 1, 'Paris', 700],
  ['Driss', 'Benali', 'male', 'employee_fixed_term', 1700, 'family', 1, 'Bordeaux', 700],
  ['Emma', 'Roux', 'female', 'civil_servant', 2600, 'none', 2, 'Toulouse', 1000],
  ['Farid', 'Lopez', 'male', 'job_seeker', 900, 'none', 1, 'Lyon', 600],
  ['Gaëlle', 'Martin', 'female', 'employee_permanent', 3900, 'organization', 3, 'Lyon', 1300],
  ['Hugo', 'Leroy', 'male', 'apprentice', 1200, 'visale', 1, 'Toulouse', 550],
  ['Inès', 'Petit', 'female', 'self_employed', 2200, 'other', 1, 'Paris', 1100],
  ['Jules', 'Morel', 'male', 'student', 500, 'visale', 1, 'Bordeaux', 550],
  ['Kenza', 'Durand', 'female', 'employee_permanent', 1900, 'family', 2, 'Bordeaux', 900],
  ['Léo', 'Garnier', 'male', 'temporary_worker', 1300, 'none', 1, 'Paris', 900],
]

const landlordTokens = []
for (const [index, landlord] of landlords.entries()) landlordTokens.push(await register('proprio' + index, 'landlord', landlord))

const listingIds = []
for (const [index, [title, propertyType, city, postalCode, rent, charges, areaM2, bedrooms, latitude, longitude]] of listings.entries()) {
  const owner = landlordTokens[index % landlordTokens.length]
  const { data } = await call('POST', '/housing', { title, propertyType, city, postalCode, rent, charges, areaM2, bedrooms, availableFrom: '2026-12-15', latitude, longitude }, owner)
  listingIds.push({ id: data.listing._id, owner, city })
}

const decisions = []
for (const [index, [firstName, lastName, gender, situation, monthlyIncome, guarantorType, householdSize, desiredCity, maxBudget]] of tenants.entries()) {
  const token = await register('locataire' + index, 'tenant', {
    firstName, lastName, gender,
    tenantProfile: { birthDate: '1999-05-01', situation, monthlyIncome, guarantorType, householdSize, desiredCity, maxBudget, desiredMoveIn: '2026-12-15' },
  })
  const categories = ['identity', 'address', 'activity', 'income', ...(guarantorType !== 'none' ? ['guarantor'] : [])]
  for (const category of categories) await call('POST', '/dossier/documents', { category, fileName: category + '.pdf', data: pdf }, token)

  // Chaque locataire postule à 2 ou 3 annonces : surtout dans sa ville, parfois ailleurs.
  const local = listingIds.filter((listing) => listing.city === desiredCity)
  const others = listingIds.filter((listing) => listing.city !== desiredCity)
  const choices = [...local.slice(0, 2), others[Math.floor(random() * others.length)]]
  for (const listing of choices) {
    const { status, data } = await call('POST', '/applications', { housingId: listing.id, message: 'Bonjour, je suis intéressé·e.' }, token)
    if (status === 201) decisions.push({ id: data.application._id, owner: listing.owner, score: data.application.matchScore })
  }
}

// Réponses des propriétaires : plus le score est haut, plus l'acceptation est probable (avec du bruit).
// Quelques candidatures restent en attente.
let answered = 0
for (const decision of decisions) {
  if (random() < 0.2) continue
  const probability = 0.1 + 0.8 * ((decision.score ?? 50) / 100) ** 2
  const status = random() < probability ? 'accepted' : 'rejected'
  const { status: code } = await call('PATCH', `/applications/${decision.id}/status`, { status }, decision.owner)
  if (code === 200) answered += 1
}

console.log(`Jeu de démonstration créé : ${listingIds.length} annonces, ${tenants.length} locataires, ${decisions.length} candidatures dont ${answered} avec réponse.`)
console.log(`Comptes : proprio0.${run}@test.local (propriétaire) et locataire0.${run}@test.local (locataire), mot de passe « ${password} ».`)
