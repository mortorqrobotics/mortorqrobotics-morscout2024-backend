const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const routes = require('./routes');
const admin = require("firebase-admin");

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Routes
app.use('/api', routes);

// Add this route to check configuration
app.get('/api/config-test', (req, res) => {
    try {
        res.json({
            environment: process.env.NODE_ENV,
            hasFirebaseConfig: !!process.env.FIREBASE_SERVICE_ACCOUNT,
            firebaseInitialized: !!admin.apps.length,
            message: 'Configuration check endpoint'
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Basic test route
app.get('/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Export for Vercel
module.exports = app; 