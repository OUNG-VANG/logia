# Logia

Plateforme d’aide à la recherche de logements locatifs en France.

## Démarrer le backend

1. Depuis `server`, crée un fichier `.env` à partir de `.env.example`.
2. Renseigne `MONGODB_URI` avec l’adresse de ta base MongoDB locale ou Atlas.
3. Remplace `JWT_SECRET` par une valeur secrète aléatoire d’au moins 32 caractères. Tu peux en générer une avec `openssl rand -base64 32`.
4. Installe les dépendances si nécessaire avec `npm install`.
5. Lance le serveur avec `npm run dev`.

L’API répond sur `http://localhost:5001`. La route `GET /api/health` indique l’état de la connexion MongoDB. Sans `MONGODB_URI`, le serveur démarre quand même, mais la route de santé signale que la base est déconnectée.

Les modèles Mongoose se trouvent dans `server/src/models` : utilisateur, logement et candidature.

L’authentification est disponible avec `POST /api/auth/register` et `POST /api/auth/login`. Le jeton Bearer retourné permet d’accéder à `GET /api/auth/me`. Les rôles accessibles à l’inscription sont `tenant` et `landlord` ; les comptes administrateur ne peuvent pas être créés via l’API publique.

Les annonces sont accessibles avec `GET /api/housing` (filtres facultatifs `city` et `maxRent`). Un propriétaire authentifié peut publier une annonce avec `POST /api/housing` et consulter ses annonces avec `GET /api/housing/mine`.
