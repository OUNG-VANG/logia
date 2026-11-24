const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const housingRoutes = require('./routes/housing');
const applicationRoutes = require('./routes/applications');
const dossierRoutes = require('./routes/dossier');
const matchingRoutes = require('./routes/matching');
const analyticsRoutes = require('./routes/analytics');
const accountRoutes = require('./routes/account');
const { securityHeaders, corsPolicy, limits } = require('./lib/security');

const app = express();
const PORT = process.env.PORT || 5001;

// Derrière un hébergeur (proxy), TRUST_PROXY=1 permet de lire la vraie adresse IP pour les limites.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(securityHeaders);
app.use(corsPolicy);
app.use('/api', limits.api);
app.use(express.json({ limit: '12mb' }));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads'), {
  fallthrough: false,
  maxAge: '1d',
}));
app.use('/api/auth', authRoutes);
app.use('/api/housing', housingRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/dossier', dossierRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/account', accountRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'API Logia opérationnelle.' });
});

app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    service: 'logia-api',
    database: connected ? 'connected' : 'disconnected',
  });
});

app.listen(PORT, () => {
  console.log(`Serveur Logia démarré sur le port ${PORT}.`);
});

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.warn('MONGODB_URI absent : le serveur démarre sans connexion MongoDB.');
} else {
  mongoose.connect(mongoUri)
    .then(() => console.log('Connexion à MongoDB établie.'))
    .catch((error) => console.error('Connexion à MongoDB impossible :', error.message));
}
