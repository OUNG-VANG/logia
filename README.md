# Logia

Plateforme d’aide à la recherche de logements locatifs en France.

## Démarrer le frontend

Depuis `client`, lance `npm run dev`. Vite redirige les appels `/api` vers `http://127.0.0.1:5001`. Pour viser une autre API (par exemple un serveur de test), définis `LOGIA_API_URL`, par exemple `LOGIA_API_URL=http://127.0.0.1:5099 npm run dev`.

## Démarrer le backend

1. Depuis `server`, crée un fichier `.env` à partir de `.env.example`.
2. Renseigne `MONGODB_URI` avec l’adresse de ta base MongoDB locale ou Atlas.
3. Remplace `JWT_SECRET` par une valeur secrète aléatoire d’au moins 32 caractères. Tu peux en générer une avec `openssl rand -base64 32`.
4. Installe les dépendances si nécessaire avec `npm install`.
5. Lance le serveur avec `npm run dev`.

L’API répond sur `http://localhost:5001`. La route `GET /api/health` indique l’état de la connexion MongoDB. Sans `MONGODB_URI`, le serveur démarre quand même, mais la route de santé signale que la base est déconnectée.

Les modèles Mongoose se trouvent dans `server/src/models` : utilisateur, logement et candidature.

L’authentification est disponible avec `POST /api/auth/register` et `POST /api/auth/login`. Le jeton Bearer retourné permet d’accéder à `GET /api/auth/me` et de modifier son profil avec `PATCH /api/auth/me`.

À l’inscription, chaque compte renseigne `firstName`, `lastName` et `gender` (`female`, `male`, `other`, `undisclosed`). Un locataire renseigne aussi `tenantProfile` : `birthDate` et `situation` sont obligatoires (`student`, `apprentice`, `employee_permanent`, `employee_fixed_term`, `temporary_worker`, `self_employed`, `civil_servant`, `job_seeker`, `retired`, `other`) ; `occupationDetail`, `monthlyIncome`, `guarantorType` (`none`, `family`, `visale`, `organization`, `other`), `householdSize`, `desiredMoveIn`, `desiredCity` et `maxBudget` sont facultatifs. Les règles de validation sont dans `server/src/lib/profile.js`.

Un propriétaire voit le nom, la situation, les revenus, le garant, le nombre d’occupants et la date d’emménagement de ses candidats, mais jamais leur date de naissance ni leur civilité : le sexe et l’âge ne doivent pas servir à choisir un locataire (article 225-1 du Code pénal). La fiche publique d’une annonce affiche le prénom et l’initiale du propriétaire. Les rôles accessibles à l’inscription sont `tenant` et `landlord` ; les comptes administrateur ne peuvent pas être créés via l’API publique.

Les annonces sont accessibles avec `GET /api/housing` (filtres facultatifs `city` et `maxRent`). Un propriétaire authentifié peut publier une annonce avec `POST /api/housing` et consulter ses annonces avec `GET /api/housing/mine`. Il peut supprimer une de ses annonces avec `DELETE /api/housing/:id` : ses photos et les candidatures reçues sont supprimées avec elle.

Les candidatures passent par `/api/applications` (authentification requise) :

- `POST /api/applications` : un locataire postule à une annonce publiée (`housingId`, `message` facultatif). Une candidature retirée peut être renvoyée.
- `GET /api/applications/mine` : le locataire consulte ses candidatures et leur statut.
- `GET /api/applications/received` : le propriétaire consulte les candidatures reçues sur ses annonces.
- `PATCH /api/applications/:id/status` : le propriétaire accepte (`accepted`) ou refuse (`rejected`) ; le locataire retire une candidature en attente (`withdrawn`).
