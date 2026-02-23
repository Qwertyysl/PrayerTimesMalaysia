// Adzan Player Script
let audio = null;
let audioContext = null;
let sourceNode = null;
let gainNode = null;
let audioDuration = 0;
let startTime = null;
let countdownInterval = null;

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const adzanVolume = parseInt(urlParams.get('volume')) || 100;
const prayerName = urlParams.get('prayer') || 'Prayer';
const enableDoa = urlParams.get('enableDoa') === 'true';

// Update UI with prayer name
document.getElementById('prayer-name').textContent = `${prayerName} Prayer`;

async function applyThemeFromStorage() {
  try {
    const result = await browser.storage.local.get('darkMode');
    const darkMode = result.darkMode === true;
    document.body.classList.toggle('dark-mode', darkMode);
  } catch (error) {
    console.error('Error applying theme in adzan player:', error);
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.darkMode) {
    document.body.classList.toggle('dark-mode', changes.darkMode.newValue === true);
  }
});

applyThemeFromStorage();

// Initialize and play adzan
async function playAdzan() {
  try {
    // Get custom audio file from storage
    const result = await browser.storage.local.get(['adzanFileData']);
    
    if (!result.adzanFileData) {
      document.getElementById('status').textContent = 'No adzan file uploaded';
      setTimeout(() => {
        window.close();
      }, 3000);
      return;
    }
    
    // Create audio element from base64 data
    audio = new Audio(result.adzanFileData);
    audio.preload = 'auto';
    
    // Set volume with boosting if needed
    const volumeMultiplier = Math.min(6.0, Math.max(0.0, (adzanVolume / 100) * 6));
    
    if (volumeMultiplier > 1.0) {
      // Use Web Audio API for volume boosting
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      sourceNode = audioContext.createMediaElementSource(audio);
      gainNode = audioContext.createGain();
      
      gainNode.gain.value = volumeMultiplier;
      
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      audio.volume = 1.0;
      document.getElementById('volume-info').textContent = `Volume: ${adzanVolume}% (Boosted)`;
    } else {
      audio.volume = volumeMultiplier;
      document.getElementById('volume-info').textContent = `Volume: ${adzanVolume}%`;
    }
    
    // Handle audio end
    audio.addEventListener('ended', () => {
      console.log('Adzan finished');
      
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      // Play doa after adzan if enabled
      if (enableDoa) {
        playDoa();
      } else {
        console.log('Doa playback disabled');
        document.getElementById('status').textContent = 'Completed';
        document.getElementById('countdown').textContent = '00:00';
        
        // Notify background script that everything is finished
        browser.runtime.sendMessage({ type: 'adzanFinished' });
        
        // Close tab after 3 seconds
        setTimeout(() => {
          window.close();
        }, 3000);
      }
    });
    
    // Handle audio error
    audio.addEventListener('error', (error) => {
      console.error('Audio error:', error);
      document.getElementById('status').textContent = 'Error playing adzan';
      
      // Notify background script
      browser.runtime.sendMessage({ type: 'adzanFinished' });
      
      setTimeout(() => {
        window.close();
      }, 3000);
    });
    
    // Wait for metadata to load before playing
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn('Metadata load timeout, trying to play anyway');
        resolve();
      }, 5000);
      
      audio.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        audioDuration = audio.duration;
        console.log('Audio duration:', audioDuration);
        resolve();
      });
      
      audio.addEventListener('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      
      // Explicitly load the audio
      audio.load();
    });
    
    // Add 5-second respect mode delay before playing adzan
    console.log('Respect mode: Waiting 5 seconds before playing adzan...');
    document.getElementById('status').textContent = '🤲 Respect Mode - Preparing...';
    
    // Countdown from 5 to 1
    for (let i = 5; i > 0; i--) {
      document.getElementById('countdown').textContent = `00:0${i}`;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Play audio
    console.log('Attempting to play audio...');
    await audio.play();
    console.log('Audio playing successfully');
    startTime = Date.now();
    
    document.getElementById('status').textContent = '🔊 Playing Adzan';
    
    // Notify background script that adzan started with duration
    browser.runtime.sendMessage({ 
      type: 'adzanStarted', 
      duration: audioDuration 
    });
    
    // Start countdown after audio starts playing
    startCountdown();
    
  } catch (error) {
    console.error('Error playing adzan:', error);
    document.getElementById('status').textContent = 'Error: ' + error.message;
    
    // Notify background script
    browser.runtime.sendMessage({ type: 'adzanFinished' });
    
    setTimeout(() => {
      window.close();
    }, 3000);
  }
}

// Start countdown timer
function startCountdown() {
  countdownInterval = setInterval(() => {
    if (!audio || audio.paused) {
      clearInterval(countdownInterval);
      return;
    }
    
    // Use audio.duration directly if audioDuration is not set or is 0
    const duration = audioDuration > 0 ? audioDuration : audio.duration;
    const currentTime = audio.currentTime;
    const remaining = duration - currentTime;
    
    if (remaining <= 0 || isNaN(remaining)) {
      document.getElementById('countdown').textContent = '00:00';
      clearInterval(countdownInterval);
      return;
    }
    
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    
    document.getElementById('countdown').textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// Stop button handler
document.getElementById('stop-button').addEventListener('click', () => {
  stopAdzan();
});

// Stop adzan function
function stopAdzan() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  if (audio) {
    audio.pause();
    audio = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  document.getElementById('status').textContent = 'Adzan stopped';
  document.getElementById('countdown').textContent = '00:00';
  
  // Notify background script
  browser.runtime.sendMessage({ type: 'adzanFinished' });
  
  // Close tab
  setTimeout(() => {
    window.close();
  }, 1000);
}

// Handle tab close
window.addEventListener('beforeunload', () => {
  if (audio && !audio.paused) {
    browser.runtime.sendMessage({ type: 'adzanFinished' });
  }
});

// Play doa after adzan
async function playDoa() {
  try {
    console.log('Starting doa playback...');
    document.getElementById('status').textContent = '🤲 Playing Doa';
    document.getElementById('prayer-name').textContent = 'Doa Selepas Azan';
    
    // Get custom doa file from storage
    const result = await browser.storage.local.get(['doaFileData']);
    
    if (!result.doaFileData) {
      console.log('No doa file uploaded, skipping');
      document.getElementById('status').textContent = 'Completed';
      document.getElementById('countdown').textContent = '00:00';
      
      // Notify background script that everything is finished
      browser.runtime.sendMessage({ type: 'adzanFinished' });
      
      // Close tab after 3 seconds
      setTimeout(() => {
        window.close();
      }, 3000);
      return;
    }
    
    // Change the audio source to doa (reuse existing audio element if using Web Audio API)
    if (sourceNode) {
      // If we're using Web Audio API, we need to disconnect and create new audio element
      sourceNode.disconnect();
      if (gainNode) {
        gainNode.disconnect();
      }
      
      // Create new audio element for doa from base64 data
      audio = new Audio(result.doaFileData);
      audio.preload = 'auto';
      
      // Recreate the audio graph with new source
      const volumeMultiplier = Math.min(6.0, Math.max(0.0, (adzanVolume / 100) * 6));
      
      sourceNode = audioContext.createMediaElementSource(audio);
      gainNode = audioContext.createGain();
      gainNode.gain.value = volumeMultiplier;
      
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      audio.volume = 1.0;
    } else {
      // Not using Web Audio API, just change the src to base64 data
      audio.src = result.doaFileData;
      audio.load();
    }
    
    // Handle doa end
    audio.addEventListener('ended', () => {
      console.log('Doa finished');
      document.getElementById('status').textContent = 'Completed';
      document.getElementById('countdown').textContent = '00:00';
      
      // Notify background script that everything is finished
      browser.runtime.sendMessage({ type: 'adzanFinished' });
      
      // Close tab after 3 seconds
      setTimeout(() => {
        window.close();
      }, 3000);
    });
    
    // Handle doa error
    audio.addEventListener('error', (error) => {
      console.error('Doa audio error:', error);
      document.getElementById('status').textContent = 'Error playing doa';
      
      // Notify background script
      browser.runtime.sendMessage({ type: 'adzanFinished' });
      
      setTimeout(() => {
        window.close();
      }, 3000);
    });
    
    // Wait for metadata to load
    await new Promise((resolve) => {
      audio.addEventListener('loadedmetadata', () => {
        audioDuration = audio.duration;
        console.log('Doa duration:', audioDuration);
        resolve();
      });
    });
    
    // Play doa
    await audio.play();
    
    // Notify background script that doa started with duration
    browser.runtime.sendMessage({ 
      type: 'adzanStarted', 
      duration: audioDuration 
    });
    
    // Start countdown for doa
    startCountdown();
    
  } catch (error) {
    console.error('Error playing doa:', error);
    document.getElementById('status').textContent = 'Error: ' + error.message;
    
    // Notify background script
    browser.runtime.sendMessage({ type: 'adzanFinished' });
    
    setTimeout(() => {
      window.close();
    }, 3000);
  }
}

// Start playing when page loads
window.addEventListener('load', () => {
  applyThemeFromStorage();
  playAdzan();
});
