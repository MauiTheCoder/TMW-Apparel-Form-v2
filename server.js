const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// Import our Netlify function
const submitOrder = require('./netlify/functions/submit-order');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('.'));

console.log('🚀 Starting Te Mata Wānanga Apparel Form Server...');

// Serve the main HTML file
app.get('/', (req, res) => {
  console.log('📄 Serving index.html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle form submissions (simulate Netlify function)
app.post('/.netlify/functions/submit-order', async (req, res) => {
  try {
    console.log('📧 Received form submission:', req.body);

    // Create mock Netlify event object
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify(req.body),
      headers: req.headers
    };

    const context = {};

    // Call our function
    console.log('⚙️ Processing order...');
    const result = await submitOrder.handler(event, context);

    console.log('✅ Order processed successfully');

    // Send response
    res.status(result.statusCode).json(JSON.parse(result.body));

  } catch (error) {
    console.error('❌ Error processing submission:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  console.log(`⚠️ 404 - Not found: ${req.url}`);
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('💥 Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🎉 TMW Apparel Form running on port ${PORT}`);
  console.log(`🌐 Access your form at: http://localhost:${PORT}`);
  console.log(`📧 Make sure to set your environment variables in the Secrets tab`);
  console.log('');
  console.log('📋 Required environment variables:');
  console.log('   - SENDGRID_API_KEY');
  console.log('   - FROM_EMAIL');
  console.log('   - GOOGLE_SHEETS_ID');
  console.log('   - GOOGLE_SHEETS_CREDENTIALS');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});