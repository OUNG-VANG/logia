const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const housingRoutes = require('./routes/housing');
const applicationRoutes = require('./routes/applications');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads'), {
  fallthrough: false,
  maxAge: '1d',
}));
app.use('/api/auth', authRoutes);
app.use('/api/housing', housingRoutes);
app.use('/api/applications', applicationRoutes);

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
