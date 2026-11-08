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

- `POST /api/applications` : un locataire postule à une annonce publiée (`housingId`, `message` facultatif). Il faut un profil complet et toutes les pièces obligatoires du dossier, sinon la réponse est `403` avec `code` (`PROFILE_INCOMPLETE` ou `DOSSIER_INCOMPLETE`) et `missing` (pièces manquantes). Une candidature retirée peut être renvoyée, aux mêmes conditions.
- `GET /api/applications/readiness` : indique au locataire s’il peut postuler (`ready`) et ce qu’il lui manque.
- `GET /api/applications/mine` : le locataire consulte ses candidatures et leur statut.
- `GET /api/applications/received` : le propriétaire consulte les candidatures reçues sur ses annonces.
- `PATCH /api/applications/:id/status` : le propriétaire accepte (`accepted`) ou refuse (`rejected`) ; le locataire retire une candidature en attente (`withdrawn`).

Le dossier locataire passe par `/api/dossier` (authentification requise). Les pièces suivent le décret n° 2015-1437 : `identity`, `address`, `activity` et `income` sont obligatoires, `tax` est facultatif, et `guarantor` devient obligatoire si le locataire a déclaré un garant.

- `GET /api/dossier/mine` : le locataire consulte ses pièces et la complétude de son dossier.
- `POST /api/dossier/documents` : le locataire ajoute une pièce (`category`, `fileName`, `data` en data URL base64). PDF, JPG ou PNG, 5 Mo et 5 fichiers par pièce au maximum.
- `DELETE /api/dossier/documents/:id` : le locataire retire une pièce (le fichier est effacé).
- `GET /api/dossier/applicants/:tenantId` : un propriétaire consulte le dossier d’un candidat.
- `GET /api/dossier/documents/:id/file` : ouvre une pièce.

Les fichiers sont rangés dans `server/private-uploads/dossiers`, jamais servi publiquement. Un propriétaire n’y a accès que si le locataire a une candidature en attente ou acceptée sur l’une de ses annonces. `GET /api/applications/received` indique aussi l’état du dossier de chaque candidat (`dossier.providedCount`, `dossier.requiredCount`, `dossier.complete`).

## Score de compatibilité (matching)

Le score, de 0 à 100, mesure l’adéquation entre un locataire et un logement. Il est calculé dans `server/src/lib/matching.js` comme une moyenne pondérée de 7 critères notés de 0 à 1 :

| Critère | Poids | Note maximale si… | Note nulle si… |
| --- | --- | --- | --- |
| Budget | 20 | loyer + charges ≤ budget | 20 % au-dessus du budget |
| Taux d’effort | 25 | loyer + charges ≤ 33 % des revenus | ≥ 50 % des revenus |
| Garantie | 15 | Visale, organisme ou garant familial | sans garant et revenus justes (0,2) |
| Ville recherchée | 15 | même ville | autre ville |
| Date d’emménagement | 10 | disponible à la date voulue | disponible plus de 90 jours après |
| Taille du logement | 10 | surface ≥ 9 m² (1 pers.), 16 m² (2 pers.), +9 m² par personne | moins de 75 % de ce seuil |
| Dossier | 5 | toutes les pièces obligatoires | aucune pièce |

Un critère sans donnée est écarté et les poids restants sont renormalisés ; `confidence` indique la part des poids réellement utilisés. Il faut au moins un critère du profil (pas seulement le dossier) pour obtenir un score. L’âge, le sexe et la civilité ne sont jamais utilisés. Les seuils sont des repères courants (taux d’effort de 33 %, seuils de peuplement de la CAF) et peuvent être ajustés dans `weights` et `criteria`.

- `GET /api/matching/recommendations?limit=6` : annonces publiées classées par score pour le locataire connecté.
- `GET /api/matching/listings/:id` : score et détail par critère pour une annonce.
- `GET /api/applications/received` renvoie aussi `match` pour chaque candidat ; l’interface les trie par compatibilité.

Les tests du calcul se lancent depuis `server` avec `npm test`.
