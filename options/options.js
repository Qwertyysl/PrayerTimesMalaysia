// Options page script for prayer times extension

// Persistent AudioContext for volume boosting
let audioContext = null;

document.addEventListener('DOMContentLoaded', function() {
  // Load saved theme
  loadTheme();
  
  // Load saved settings
  loadSettings();
  
  // Load locations from JAKIM API
  loadLocations();
  
  // Set up form submission
  const form = document.getElementById('settings-form');
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    saveSettings();
  });
  
  // Set up test adzan button
  const testBtn = document.getElementById('test-adzan-btn');
  testBtn.addEventListener('click', function() {
    testAdzan();
  });

  const testMuteUnmuteBtn = document.getElementById('test-mute-unmute-btn');
  testMuteUnmuteBtn.addEventListener('click', function() {
    testTabMuteUnmute();
  });
  
  // Set up stop adzan button
  const stopBtn = document.getElementById('stop-adzan-btn');
  stopBtn.addEventListener('click', function() {
    stopAdzan();
  });
  
  // Set up changelog button
  const changelogBtn = document.getElementById('changelog-btn');
  if (changelogBtn) {
    changelogBtn.addEventListener('click', function() {
      // Open changelog in a new tab
      browser.tabs.create({
        url: browser.runtime.getURL('changelog.txt')
      });
    });
  }
  
  // Set up feedback button
  const feedbackBtn = document.getElementById('feedback-btn');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', function() {
      // Open Telegram link in a new tab
      browser.tabs.create({
        url: 'https://t.me/mnxzmi98'
      });
    });
  }
  
  // Set up volume slider display update
  const volumeSlider = document.getElementById('adzan-volume');
  const volumeValue = document.getElementById('volume-value');
  if (volumeSlider && volumeValue) {
    volumeSlider.addEventListener('input', function() {
      volumeValue.textContent = this.value + '%';
    });
  }
  
  // Set up developer mode toggle
  const developerModeCheckbox = document.getElementById('developer-mode');
  const testSection = document.getElementById('test-section');
  
  developerModeCheckbox.addEventListener('change', function() {
    if (this.checked) {
      testSection.style.display = 'block';
    } else {
      testSection.style.display = 'none';
    }
  });
  
  // Set up file input handlers
  const adzanFileInput = document.getElementById('adzan-file');
  const doaFileInput = document.getElementById('doa-file');
  const enableDoaCheckbox = document.getElementById('enable-doa');
  const doaFileGroup = document.getElementById('doa-file-group');
  
  adzanFileInput.addEventListener('change', handleAdzanFileSelect);
  doaFileInput.addEventListener('change', handleDoaFileSelect);
  
  enableDoaCheckbox.addEventListener('change', function() {
    doaFileGroup.style.display = this.checked ? 'block' : 'none';
  });
  
  // Set up change file buttons
  const changeAdzanBtn = document.getElementById('change-adzan-btn');
  const changeDoaBtn = document.getElementById('change-doa-btn');
  
  changeAdzanBtn.addEventListener('click', function() {
    adzanFileInput.click();
  });
  
  changeDoaBtn.addEventListener('click', function() {
    doaFileInput.click();
  });
});

// Listen for storage changes to sync theme across pages
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.darkMode) {
    const darkMode = changes.darkMode.newValue;
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }
});

// Load settings from storage
function loadSettings() {
  browser.storage.local.get([
    'selectedLocation',
    'adzanFileName',
    'doaFileName',
    'enableDoa',
    'enableNotifications',
    'enableBadge',
    'enableAthan',
    'muteTabsDuringAthan',
    'adzanVolume',
    'developerMode'
  ]).then((result) => {
    // Set location (will be set after locations are loaded)
    if (result.selectedLocation) {
      const locationSelect = document.getElementById('location-select');
      locationSelect.value = result.selectedLocation;
    }
    
    // Display file names if they exist and hide/show file pickers
    if (result.adzanFileName) {
      document.getElementById('adzan-file-info').textContent = result.adzanFileName;
      document.getElementById('adzan-file').style.display = 'none';
      document.getElementById('change-adzan-btn').style.display = 'inline-block';
    }
    
    if (result.doaFileName) {
      document.getElementById('doa-file-info').textContent = result.doaFileName;
      document.getElementById('doa-file').style.display = 'none';
      document.getElementById('change-doa-btn').style.display = 'inline-block';
    }
    
    // Set enable doa checkbox
    const enableDoa = result.enableDoa || false;
    document.getElementById('enable-doa').checked = enableDoa;
    document.getElementById('doa-file-group').style.display = enableDoa ? 'block' : 'none';
      
    document.getElementById('enable-notifications').checked = 
      result.enableNotifications !== false; // Default to true
      
    document.getElementById('enable-badge').checked = 
      result.enableBadge || false; // Default to false (off)
      
    document.getElementById('enable-athan').checked = 
      result.enableAthan || false; // Default to false (unchecked)
      
    document.getElementById('mute-tabs-during-athan').checked = 
      result.muteTabsDuringAthan || false;
      
    // Set volume slider (default to max volume 100%)
    const volumeSlider = document.getElementById('adzan-volume');
    const volumeValue = document.getElementById('volume-value');
    if (volumeSlider && volumeValue) {
      volumeSlider.value = result.adzanVolume !== undefined ? result.adzanVolume : 100;
      volumeValue.textContent = volumeSlider.value + '%';
    }
    
    // Set developer mode and show/hide test section
    const developerMode = result.developerMode || false;
    document.getElementById('developer-mode').checked = developerMode;
    document.getElementById('test-section').style.display = developerMode ? 'block' : 'none';
  });
}

// Save settings to storage
async function saveSettings() {
  const locationSelect = document.getElementById('location-select');
  const selectedLocation = locationSelect.value || 'trg01'; // Default to TRG01 if not selected
  
  const enableAthan = document.getElementById('enable-athan').checked;
  const enableDoa = document.getElementById('enable-doa').checked;
  
  // Check if audio files are uploaded when features are enabled
  const storage = await browser.storage.local.get(['adzanFileData', 'doaFileData']);
  
  if (enableAthan && !storage.adzanFileData) {
    showMessage('Please upload an adzan sound file before enabling adzan audio', 'error');
    return;
  }
  
  if (enableDoa && !storage.doaFileData) {
    showMessage('Please upload a doa sound file before enabling doa playback', 'error');
    return;
  }
  
  const settings = {
    selectedLocation: selectedLocation,
    enableDoa: enableDoa,
    enableNotifications: document.getElementById('enable-notifications').checked,
    enableBadge: document.getElementById('enable-badge').checked,
    enableAthan: enableAthan,
    muteTabsDuringAthan: document.getElementById('mute-tabs-during-athan').checked,
    adzanVolume: parseInt(document.getElementById('adzan-volume').value),
    developerMode: document.getElementById('developer-mode').checked
  };
  
  try {
    await browser.storage.local.set(settings);
    
    // Trigger prayer times update with new location
    browser.runtime.sendMessage({ type: 'updatePrayerTimes' });
    
    // Show success message
    showMessage('Settings saved successfully!', 'success');
  } catch (error) {
    // Show error message
    showMessage('Error saving settings: ' + error.message, 'error');
  }
}

// Show status message
function showMessage(text, type) {
  const messageElement = document.getElementById('status-message');
  messageElement.textContent = text;
  messageElement.className = type;
  messageElement.style.display = 'block';
  
  // Hide message after 3 seconds
  setTimeout(() => {
    messageElement.style.display = 'none';
  }, 3000);
}

// Load locations from JAKIM API zones
async function loadLocations() {
  const locationSelect = document.getElementById('location-select');
  
  // JAKIM zone codes grouped by state
  const zones = {
    'Johor': [
      { code: 'jhr01', name: 'Pulau Aur dan Pulau Pemanggil' },
      { code: 'jhr02', name: 'Johor Bahru, Kota Tinggi, Mersing' },
      { code: 'jhr03', name: 'Kluang, Pontian' },
      { code: 'jhr04', name: 'Batu Pahat, Muar, Segamat, Gemas' }
    ],
    'Kedah': [
      { code: 'kdh01', name: 'Kota Setar, Kubang Pasu, Pokok Sena' },
      { code: 'kdh02', name: 'Kuala Muda, Yan, Pendang' },
      { code: 'kdh03', name: 'Padang Terap, Sik' },
      { code: 'kdh04', name: 'Baling' },
      { code: 'kdh05', name: 'Bandar Baharu, Kulim' },
      { code: 'kdh06', name: 'Langkawi' },
      { code: 'kdh07', name: 'Gunung Jerai' }
    ],
    'Kelantan': [
      { code: 'ktn01', name: 'Kota Bharu, Bachok, Pasir Puteh, Tumpat' },
      { code: 'ktn03', name: 'Jeli, Gua Musang (Mukim Galas, Bertam)' }
    ],
    'Melaka': [
      { code: 'mlk01', name: 'Bandar Melaka, Alor Gajah, Jasin, Masjid Tanah, Merlimau, Nyalas' }
    ],
    'Negeri Sembilan': [
      { code: 'ngs01', name: 'Tampin, Jempol' },
      { code: 'ngs02', name: 'Port Dickson, Seremban, Kuala Pilah, Jelebu, Rembau' }
    ],
    'Pahang': [
      { code: 'phg01', name: 'Pulau Tioman' },
      { code: 'phg02', name: 'Kuantan, Pekan, Rompin, Muadzam Shah' },
      { code: 'phg03', name: 'Jerantut, Temerloh, Maran, Bera, Chenor, Jengka' },
      { code: 'phg04', name: 'Bentong, Lipis, Raub' },
      { code: 'phg05', name: 'Genting Sempah, Janda Baik, Bukit Tinggi' },
      { code: 'phg06', name: 'Cameron Highlands, Genting Highlands, Bukit Fraser' }
    ],
    'Perlis': [
      { code: 'pls01', name: 'Kangar, Padang Besar, Arau' }
    ],
    'Pulau Pinang': [
      { code: 'png01', name: 'Pulau Pinang' }
    ],
    'Perak': [
      { code: 'prk01', name: 'Tapah, Slim River, Tanjung Malim' },
      { code: 'prk02', name: 'Kuala Kangsar, Sg. Siput, Ipoh, Batu Gajah, Kampar' },
      { code: 'prk03', name: 'Lenggong, Pengkalan Hulu, Grik' },
      { code: 'prk04', name: 'Temengor, Belum' },
      { code: 'prk05', name: 'Kg Gajah, Teluk Intan, Bagan Datuk, Seri Iskandar' },
      { code: 'prk06', name: 'Selama, Taiping, Bagan Serai, Parit Buntar' },
      { code: 'prk07', name: 'Bukit Larut' }
    ],
    'Sabah': [
      { code: 'sbh01', name: 'Bahagian Sandakan (Timur), Bukit Garam, Semawang, Temanggong, Tambisan' },
      { code: 'sbh02', name: 'Beluran, Telupid, Pinangah, Terusan, Kuamut, Bahagian Sandakan (Barat)' },
      { code: 'sbh03', name: 'Lahad Datu, Silabukan, Kunak, Sahabat, Semporna, Tungku, Bahagian Tawau (Timur)' },
      { code: 'sbh04', name: 'Bandar Tawau, Balong, Merotai, Kalabakan, Bahagian Tawau (Barat)' },
      { code: 'sbh05', name: 'Kudat, Kota Marudu, Pitas, Pulau Banggi, Bahagian Kudat' },
      { code: 'sbh06', name: 'Gunung Kinabalu' },
      { code: 'sbh07', name: 'Kota Kinabalu, Ranau, Kota Belud, Tuaran, Penampang, Papar, Putatan, Bahagian Pantai Barat' },
      { code: 'sbh08', name: 'Pensiangan, Keningau, Tambunan, Nabawan, Bahagian Pendalaman (Atas)' },
      { code: 'sbh09', name: 'Beaufort, Kuala Penyu, Sipitang, Tenom, Long Pa Sia, Membakut, Weston, Bahagian Pendalaman (Bawah)' }
    ],
    'Sarawak': [
      { code: 'swk01', name: 'Limbang, Lawas, Sundar, Trusan' },
      { code: 'swk02', name: 'Miri, Niah, Bekenu, Sibuti, Marudi' },
      { code: 'swk03', name: 'Pandan, Belaga, Suai, Tatau, Sebauh, Bintulu' },
      { code: 'swk04', name: 'Sibu, Mukah, Dalat, Song, Igan, Oya, Balingian, Kanowit, Kapit' },
      { code: 'swk05', name: 'Sarikei, Matu, Julau, Rajang, Daro, Bintangor, Belawai' },
      { code: 'swk06', name: 'Lubok Antu, Sri Aman, Roban, Debak, Kabong, Lingga, Engkelili, Betong, Spaoh, Pusa, Saratok' },
      { code: 'swk07', name: 'Serian, Simunjan, Samarahan, Sebuyau, Meludam' },
      { code: 'swk08', name: 'Kuching, Bau, Lundu, Sematan' },
      { code: 'swk09', name: 'Zon Khas (Kampung Patarikan)' }
    ],
    'Selangor': [
      { code: 'sgr01', name: 'Gombak, Petaling, Sepang, Hulu Langat, Hulu Selangor, Rawang, S.Alam' },
      { code: 'sgr02', name: 'Kuala Selangor, Sabak Bernam' },
      { code: 'sgr03', name: 'Klang, Kuala Langat' }
    ],
    'Terengganu': [
      { code: 'trg01', name: 'Kuala Terengganu, Marang' },
      { code: 'trg02', name: 'Besut, Setiu' },
      { code: 'trg03', name: 'Hulu Terengganu' },
      { code: 'trg04', name: 'Dungun, Kemaman' }
    ],
    'WP Kuala Lumpur': [
      { code: 'wlp01', name: 'Kuala Lumpur' }
    ],
    'WP Labuan': [
      { code: 'wlp02', name: 'Labuan' }
    ],
    'WP Putrajaya': [
      { code: 'wlp03', name: 'Putrajaya' }
    ]
  };
  
  // Clear loading option
  locationSelect.innerHTML = '';
  
  // Add locations grouped by state
  Object.keys(zones).sort().forEach(state => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = state;
    
    zones[state].forEach(zone => {
      const option = document.createElement('option');
      option.value = zone.code;
      option.textContent = `${zone.name} (${zone.code.toUpperCase()})`;
      optgroup.appendChild(option);
    });
    
    locationSelect.appendChild(optgroup);
  });
  
  // Load saved location or set default to TRG01
  const result = await browser.storage.local.get('selectedLocation');
  if (result.selectedLocation) {
    locationSelect.value = result.selectedLocation;
  } else {
    // Set default to TRG01 (Kuala Terengganu)
    locationSelect.value = 'trg01';
    await browser.storage.local.set({ selectedLocation: 'trg01' });
  }
}

// Handle adzan file selection
async function handleAdzanFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    // Convert file to base64
    const base64 = await fileToBase64(file);
    
    // Save to storage
    await browser.storage.local.set({
      adzanFileData: base64,
      adzanFileName: file.name,
      adzanFileType: file.type
    });
    
    // Update UI - hide file picker and show change button
    document.getElementById('adzan-file-info').textContent = file.name;
    document.getElementById('adzan-file').style.display = 'none';
    document.getElementById('change-adzan-btn').style.display = 'inline-block';
    showMessage('Adzan file uploaded successfully!', 'success');
  } catch (error) {
    console.error('Error uploading adzan file:', error);
    showMessage('Error uploading adzan file: ' + error.message, 'error');
  }
}

// Handle doa file selection
async function handleDoaFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    // Convert file to base64
    const base64 = await fileToBase64(file);
    
    // Save to storage
    await browser.storage.local.set({
      doaFileData: base64,
      doaFileName: file.name,
      doaFileType: file.type
    });
    
    // Update UI - hide file picker and show change button
    document.getElementById('doa-file-info').textContent = file.name;
    document.getElementById('doa-file').style.display = 'none';
    document.getElementById('change-doa-btn').style.display = 'inline-block';
    showMessage('Doa file uploaded successfully!', 'success');
  } catch (error) {
    console.error('Error uploading doa file:', error);
    showMessage('Error uploading doa file: ' + error.message, 'error');
  }
}

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Global variables for adzan test
let testAudio = null;
let mutedTabs = [];
let countdownInterval = null;
let unmuteTimeout = null;
let muteUnmuteTestTimeout = null;
let muteUnmuteTestTabs = [];

// Test adzan with 10s countdown
function testAdzan() {
  const countdownDisplay = document.getElementById('countdown-display');
  let countdown = 10;
  
  // Disable the test button and show stop button
  const testBtn = document.getElementById('test-adzan-btn');
  const stopBtn = document.getElementById('stop-adzan-btn');
  testBtn.disabled = true;
  stopBtn.style.display = 'inline-block';
  
  // Clear any existing unmute timeout
  if (unmuteTimeout) {
    clearTimeout(unmuteTimeout);
    unmuteTimeout = null;
  }
  
  // Start countdown
  countdownInterval = setInterval(() => {
    countdownDisplay.textContent = `Adzan will play in ${countdown} seconds...`;
    countdown--;
    
    if (countdown < 0) {
      clearInterval(countdownInterval);
      countdownDisplay.textContent = 'Playing adzan...';
      
      // Play adzan sound
      playAdzanSound();
    }
  }, 1000);
}

// Stop adzan playback
function stopAdzan() {
  const countdownDisplay = document.getElementById('countdown-display');
  const testBtn = document.getElementById('test-adzan-btn');
  const stopBtn = document.getElementById('stop-adzan-btn');
  
  // Stop countdown if active
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  // Stop audio if playing
  if (testAudio) {
    testAudio.pause();
    testAudio = null;
    countdownDisplay.textContent = 'Adzan stopped!';
  } else {
    countdownDisplay.textContent = 'Adzan was not playing.';
  }
  
  // Unmute tabs immediately
  unmuteTestTabs();
  
  // Re-enable buttons
  testBtn.disabled = false;
  stopBtn.style.display = 'none';
}

async function testTabMuteUnmute() {
  const countdownDisplay = document.getElementById('countdown-display');
  const testMuteUnmuteBtn = document.getElementById('test-mute-unmute-btn');

  if (muteUnmuteTestTimeout) {
    countdownDisplay.textContent = 'Mute/unmute test is already running...';
    return;
  }

  if (countdownInterval || testAudio) {
    countdownDisplay.textContent = 'Stop the Adzan test before testing tab mute/unmute.';
    return;
  }

  try {
    testMuteUnmuteBtn.disabled = true;
    countdownDisplay.textContent = 'Finding audible tabs to mute...';

    muteUnmuteTestTabs = await muteAudibleTabsExcludingCurrentTab();

    if (muteUnmuteTestTabs.length === 0) {
      countdownDisplay.textContent = 'No other audible tabs found to test.';
      testMuteUnmuteBtn.disabled = false;
      return;
    }

    countdownDisplay.textContent = `Muted ${muteUnmuteTestTabs.length} tab(s). Unmuting in 5 seconds...`;

    muteUnmuteTestTimeout = setTimeout(async () => {
      await unmuteSpecificTabs(muteUnmuteTestTabs);
      countdownDisplay.textContent = `Unmuted ${muteUnmuteTestTabs.length} tab(s). Test completed.`;
      muteUnmuteTestTabs = [];
      muteUnmuteTestTimeout = null;
      testMuteUnmuteBtn.disabled = false;
    }, 5000);
  } catch (error) {
    console.error('Error running mute/unmute test:', error);
    countdownDisplay.textContent = 'Mute/unmute test failed.';
    muteUnmuteTestTabs = [];
    if (muteUnmuteTestTimeout) {
      clearTimeout(muteUnmuteTestTimeout);
      muteUnmuteTestTimeout = null;
    }
    testMuteUnmuteBtn.disabled = false;
  }
}

// Play adzan sound with tab muting for test and volume boosting
async function playAdzanSound() {
  try {
    // Get settings from storage
    const result = await browser.storage.local.get([
      'adzanFileData',
      'adzanVolume', 
      'muteTabsDuringAthan'
    ]);
    
    const adzanVolume = result.adzanVolume !== undefined ? result.adzanVolume : 100;
    const muteTabs = result.muteTabsDuringAthan || false;
    const adzanFileData = result.adzanFileData;
    
    // Check if adzan file is uploaded
    if (!adzanFileData) {
      showMessage('Please upload an adzan sound file first', 'error');
      finishTestAdzan();
      return;
    }
    
    // Mute audio tabs if requested
    if (muteTabs) {
      await muteAudioTabsForTest();
    }
    
    // Create audio element from base64 data
    testAudio = new Audio(adzanFileData);
    
    // Set volume (convert percentage to 0.0-6.0 range for up to 600% boost)
    try {
      // Convert 0-100% to 0.0-6.0 for up to 600% volume boost
      const volumeMultiplier = Math.min(6.0, Math.max(0.0, (adzanVolume / 100) * 6));
      testAudio.volume = volumeMultiplier > 1.0 ? 1.0 : volumeMultiplier; // HTML5 audio max is 1.0
      
      // If volume boost is requested (>100%), use Web Audio API for boosting
      if (volumeMultiplier > 1.0) {
        // Create persistent AudioContext for volume boosting (reuse if exists)
        if (!audioContext) {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Ensure AudioContext is running (required for modern browsers)
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        const source = audioContext.createMediaElementSource(testAudio);
        const gainNode = audioContext.createGain();
        
        // Set gain to boost volume (1.0 = 100%, 6.0 = 600%)
        gainNode.gain.value = volumeMultiplier;
        
        // Connect the audio graph: source -> gain -> destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        console.log(`Volume boosted to ${volumeMultiplier * 100}% (${volumeMultiplier}x)`);
      }
    } catch (volumeError) {
      console.warn('Could not set volume boost:', volumeError);
      testAudio.volume = 1.0; // Max volume as fallback
    }
    
    // Preload audio for faster playback
    testAudio.preload = 'auto';
    
    // Handle audio events
    testAudio.addEventListener('ended', () => {
      console.log('Test adzan finished playing');
      finishTestAdzan();
    });
    
    testAudio.addEventListener('error', (error) => {
      console.error('Test adzan error:', error);
      finishTestAdzan();
    });
    
    // Play audio
    await testAudio.play();
    
  } catch (error) {
    console.error('Error playing adzan sound:', error);
    showMessage('Error playing adzan sound: ' + error.message, 'error');
    finishTestAdzan();
  }
}

// Mute audio tabs for test (excluding current tab)
async function muteAudioTabsForTest() {
  try {
    console.log('Muting audio tabs for test (excluding current tab)...');
    mutedTabs = await muteAudibleTabsExcludingCurrentTab();
    
    console.log(`Muted ${mutedTabs.length} audio tabs during test adzan`);
  } catch (muteError) {
    console.error('Error muting audio tabs for test:', muteError);
  }
}

async function muteAudibleTabsExcludingCurrentTab() {
  const mutedTabIds = [];

  // Get current tab ID
  let currentTabId = null;
  try {
    const currentTabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (currentTabs && currentTabs.length > 0) {
      currentTabId = currentTabs[0].id;
    }
  } catch (tabError) {
    console.warn('Could not get current tab ID:', tabError);
  }

  // Get all tabs
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    if ((tab.id === currentTabId) || (!tab.audible)) {
      continue;
    }

    try {
      await browser.tabs.update(tab.id, { muted: true });
      mutedTabIds.push(tab.id);
      console.log(`Muted audio tab ${tab.id} for test`);
    } catch (tabError) {
      console.warn(`Could not mute tab ${tab.id}:`, tabError);
    }
  }

  return mutedTabIds;
}

// Unmute tabs after test
async function unmuteTestTabs() {
  try {
    if (mutedTabs.length > 0) {
      console.log('Unmuting tabs after test...');
      await unmuteSpecificTabs(mutedTabs);
      console.log(`Unmuted ${mutedTabs.length} tabs after test adzan`);
      mutedTabs = []; // Clear the array
    }
  } catch (unmuteError) {
    console.error('Error unmuting tabs after test:', unmuteError);
  }
}

async function unmuteSpecificTabs(tabIds) {
  for (const tabId of tabIds) {
    try {
      await browser.tabs.update(tabId, { muted: false });
      console.log(`Unmuted tab ${tabId} after test`);
    } catch (tabError) {
      console.warn(`Could not unmute tab ${tabId}:`, tabError);
    }
  }
}

// Finish test adzan and schedule automatic unmuting
function finishTestAdzan() {
  const countdownDisplay = document.getElementById('countdown-display');
  const testBtn = document.getElementById('test-adzan-btn');
  const stopBtn = document.getElementById('stop-adzan-btn');
  
  // Update display
  countdownDisplay.textContent = 'Adzan finished!';
  
  // Schedule automatic unmuting in 10 seconds
  if (unmuteTimeout) {
    clearTimeout(unmuteTimeout);
  }
  
  unmuteTimeout = setTimeout(() => {
    unmuteTestTabs();
    countdownDisplay.textContent = 'Tabs unmuted automatically after 10 seconds.';
  }, 10000); // 10 seconds
  
  // Re-enable test button and hide stop button
  testBtn.disabled = false;
  stopBtn.style.display = 'none';
  
  // Clear audio reference
  testAudio = null;
}

// Load theme from storage
async function loadTheme() {
  try {
    const result = await browser.storage.local.get('darkMode');
    const darkMode = result.darkMode || false;
    
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
}
