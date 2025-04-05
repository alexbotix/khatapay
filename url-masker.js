
// url-masker.js
const fs = require('fs');
const crypto = require('crypto');

// Create a hash for each URL (will be stable between server restarts)
function createHash(input) {
  return crypto.createHash('md5').update(input).digest('hex').substring(0, 16);
}

// HTML pages to mask
const pages = [
  'landing.html',
  'payment.html',
  'success.html',
  'fail.html',
  'bankpage.html'
];

// Create mapping of original to masked URLs
const urlMapping = {};
pages.forEach(page => {
  urlMapping[page] = createHash(page + '-salt-string');
});

// Generate redirect HTML files
Object.entries(urlMapping).forEach(([originalPage, maskedPath]) => {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Processing Payment</title>
  <script>
    // Preserve query parameters when redirecting
    window.location.replace('/${originalPage}' + window.location.search);
  </script>
</head>
<body>
  <p>Processing payment, please wait...</p>
</body>
</html>
  `;
  
  fs.writeFileSync(`${maskedPath}.html`, htmlContent);
  console.log(`Created: ${maskedPath}.html -> ${originalPage}`);
});

// Export mappings for use in server.js
module.exports = {
  urlMapping
};
