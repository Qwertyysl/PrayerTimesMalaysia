// Prayer times popup script

document.addEventListener('DOMContentLoaded', function() {
  // Load theme
  loadTheme();
  
  // Get DOM elements
  const subuhTimeElement = document.getElementById('subuh-time');
  const zohorTimeElement = document.getElementById('zohor-time');
  const asarTimeElement = document.getElementById('asar-time');
  const maghribTimeElement = document.getElementById('maghrib-time');
  const ishaTimeElement = document.getElementById('isha-time');
  const nextPrayerNameElement = document.getElementById('next-prayer-name');
  const nextPrayerTimeElement = document.getElementById('next-prayer-time');
  const countdownElement = document.getElementById('countdown');
  const refreshButton = document.getElementById('refresh-btn');
  const settingsButton = document.getElementById('settings-btn');
  const warningElement = document.getElementById('warning-message');
  const currentTimeElement = document.getElementById('current-time');
  const dayNameElement = document.getElementById('day-name');
  const dateValueElement = document.getElementById('date-value');

  // Update clock every second
  updateClock();
  setInterval(updateClock, 1000);

  // Check adzan status
  checkAdzanStatus();
  setInterval(checkAdzanStatus, 1000);

  // Refresh button event listener
  refreshButton.addEventListener('click', function() {
    forceRefreshPrayerTimes();
  });
  
  // Settings button event listener
  settingsButton.addEventListener('click', function() {
    browser.runtime.openOptionsPage();
  });
  
  // Theme toggle button event listener
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function() {
      toggleTheme();
    });
  }

  // Force refresh prayer times from API via background script
  async function forceRefreshPrayerTimes() {
    console.log('Force refreshing prayer times from API...');
    
    // Show loading state
    subuhTimeElement.textContent = 'Loading...';
    zohorTimeElement.textContent = 'Loading...';
    asarTimeElement.textContent = 'Loading...';
    maghribTimeElement.textContent = 'Loading...';
    ishaTimeElement.textContent = 'Loading...';
    
    try {
      // Ask background script to force-fetch from API
      const response = await browser.runtime.sendMessage({ type: 'forceUpdatePrayerTimes' });
      
      if (response && response.prayerTimes) {
        displayPrayerTimes(response.prayerTimes);
      } else {
        // Fallback: try fetching directly
        fetchPrayerTimesFromAPI();
      }
    } catch (error) {
      console.error('Error force refreshing prayer times:', error);
      fetchPrayerTimesFromAPI();
    }
  }

  // Display prayer times and calculate countdown
  function displayPrayerTimes(times) {
    subuhTimeElement.textContent = times.subuh || '--:--';
    zohorTimeElement.textContent = times.zohor || '--:--';
    asarTimeElement.textContent = times.asar || '--:--';
    maghribTimeElement.textContent = times.maghrib || '--:--';
    ishaTimeElement.textContent = times.isha || '--:--';
    
    console.log('Displaying prayer times:', times);
    
    // Calculate next prayer and countdown
    calculateNextPrayerAndCountdown(times);
  }

  // Update prayer times — checks staleness and fetches if needed
  async function updatePrayerTimes() {
    console.log('Updating prayer times in popup...');
    
    // Show loading state
    subuhTimeElement.textContent = 'Loading...';
    zohorTimeElement.textContent = 'Loading...';
    asarTimeElement.textContent = 'Loading...';
    maghribTimeElement.textContent = 'Loading...';
    ishaTimeElement.textContent = 'Loading...';
    
    try {
      // Get prayer times and location from storage
      const result = await browser.storage.local.get(['prayerTimes', 'selectedLocation', 'lastUpdated']);
      
      // Display location code
      if (result.selectedLocation) {
        document.getElementById('location-code').textContent = `(${result.selectedLocation.toUpperCase()})`;
      }
      console.log('Retrieved from storage:', result);
      
      // Check if stored data is stale (different day or too old)
      const isStale = isPrayerTimesStale(result.prayerTimes, result.lastUpdated);
      
      if (result.prayerTimes && !isStale) {
        // Data is fresh, display it
        displayPrayerTimes(result.prayerTimes);
      } else {
        // Data is stale or missing, force refresh via background script
        console.log('Prayer times are stale or missing, forcing refresh...');
        try {
          const response = await browser.runtime.sendMessage({ type: 'forceUpdatePrayerTimes' });
          if (response && response.prayerTimes) {
            displayPrayerTimes(response.prayerTimes);
          } else {
            fetchPrayerTimesFromAPI();
          }
        } catch (msgError) {
          console.error('Error requesting prayer times from background:', msgError);
          fetchPrayerTimesFromAPI();
        }
      }
    } catch (error) {
      console.error('Error retrieving prayer times from storage:', error);
      fetchPrayerTimesFromAPI();
    }
  }

  // Check if stored prayer times are stale (from a different day)
  function isPrayerTimesStale(prayerTimes, lastUpdated) {
    if (!prayerTimes || !lastUpdated) {
      return true;
    }
    
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    
    // Check if the stored date matches today
    if (prayerTimes.date && prayerTimes.date !== todayStr) {
      return true;
    }
    
    // Also check if lastUpdated was more than 6 hours ago
    const lastUpdatedDate = new Date(lastUpdated);
    const hoursSinceUpdate = (now.getTime() - lastUpdatedDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 6) {
      return true;
    }
    
    return false;
  }

  // Fetch prayer times directly from API
  async function fetchPrayerTimesFromAPI() {
    try {
      console.log('Fetching prayer times directly from API...');
      
      // First try to use the global PrayerTimesCalculator if already loaded
      if (typeof PrayerTimesCalculator !== 'undefined') {
        // Get prayer times from API
        const prayerTimes = await PrayerTimesCalculator.getPrayerTimes();
        
        // Display prayer times
        subuhTimeElement.textContent = prayerTimes.subuh || '--:--';
        zohorTimeElement.textContent = prayerTimes.zohor || '--:--';
        asarTimeElement.textContent = prayerTimes.asar || '--:--';
        maghribTimeElement.textContent = prayerTimes.maghrib || '--:--';
        ishaTimeElement.textContent = prayerTimes.isha || '--:--';
        
        console.log('Displaying prayer times from API:', prayerTimes);
        
        // Calculate next prayer and countdown
        calculateNextPrayerAndCountdown(prayerTimes);
        
        // Save to storage
        browser.storage.local.set({
          prayerTimes: prayerTimes
        });
        return;
      }
      
      // Dynamically import the prayer times calculator
      const response = await fetch(browser.runtime.getURL('utils/prayer-times.js'));
      const text = await response.text();
      
      // Execute the script to make PrayerTimesCalculator available globally
      const script = document.createElement('script');
      script.textContent = text;
      document.head.appendChild(script);
      
      // Get prayer times from API
      const prayerTimes = await PrayerTimesCalculator.getPrayerTimes();
      
      // Display prayer times
      subuhTimeElement.textContent = prayerTimes.subuh || '--:--';
      zohorTimeElement.textContent = prayerTimes.zohor || '--:--';
      asarTimeElement.textContent = prayerTimes.asar || '--:--';
      maghribTimeElement.textContent = prayerTimes.maghrib || '--:--';
      ishaTimeElement.textContent = prayerTimes.isha || '--:--';
      
      console.log('Displaying prayer times from API:', prayerTimes);
      
      // Calculate next prayer and countdown
      calculateNextPrayerAndCountdown(prayerTimes);
      
      // Save to storage
      browser.storage.local.set({
        prayerTimes: prayerTimes
      });
    } catch (error) {
      console.error('Error fetching prayer times from API:', error);
      // Display error message
      subuhTimeElement.textContent = 'Error';
      zohorTimeElement.textContent = 'Error';
      asarTimeElement.textContent = 'Error';
      maghribTimeElement.textContent = 'Error';
      ishaTimeElement.textContent = 'Error';
      nextPrayerNameElement.textContent = 'Error';
      nextPrayerTimeElement.textContent = '--:--';
      countdownElement.textContent = '--:--';
    }
  }

  // Calculate next prayer and countdown
  async function calculateNextPrayerAndCountdown(prayerTimes) {
    try {
      console.log('Calculating next prayer...');
      
      // First try to use the global PrayerTimesCalculator if already loaded
      if (typeof PrayerTimesCalculator !== 'undefined') {
        // Use the PrayerTimesCalculator to get next prayer info
        const nextPrayerInfo = PrayerTimesCalculator.getNextPrayer(prayerTimes);
        
        nextPrayerNameElement.textContent = nextPrayerInfo.name || '--';
        nextPrayerTimeElement.textContent = nextPrayerInfo.time || '--:--';
        
        console.log('Next prayer info:', nextPrayerInfo);
        
        // Update countdown display
        updateCountdownDisplay(nextPrayerInfo);
        
        // Set up interval to update countdown every minute
        setInterval(() => {
          updateCountdownDisplay(nextPrayerInfo);
        }, 60000); // Update every minute
        return;
      }
      
      // Dynamically import the prayer times calculator
      const response = await fetch(browser.runtime.getURL('utils/prayer-times.js'));
      const text = await response.text();
      
      // Execute the script to make PrayerTimesCalculator available globally
      const script = document.createElement('script');
      script.textContent = text;
      document.head.appendChild(script);
      
      // Use the PrayerTimesCalculator to get next prayer info
      const nextPrayerInfo = PrayerTimesCalculator.getNextPrayer(prayerTimes);
      
      nextPrayerNameElement.textContent = nextPrayerInfo.name || '--';
      nextPrayerTimeElement.textContent = nextPrayerInfo.time || '--:--';
      
      console.log('Next prayer info:', nextPrayerInfo);
      
      // Update countdown display
      updateCountdownDisplay(nextPrayerInfo);
      
      // Set up interval to update countdown every minute
      setInterval(() => {
        updateCountdownDisplay(nextPrayerInfo);
      }, 60000); // Update every minute
    } catch (error) {
      console.error('Error calculating next prayer:', error);
      nextPrayerNameElement.textContent = 'Error';
      nextPrayerTimeElement.textContent = '--:--';
      countdownElement.textContent = '--:--';
    }
  }

  // Update countdown display
  function updateCountdownDisplay(nextPrayerInfo) {
    try {
      const now = new Date();
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      
      // Handle both 12-hour and 24-hour formats
      let timeStr = nextPrayerInfo.time;
      let hours, minutes, period;
      
      // Check if it's 12-hour format (contains AM/PM)
      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        const timeParts = timeStr.split(' ');
        if (timeParts.length !== 2) {
          console.error('Invalid time format:', timeStr);
          countdownElement.textContent = '--:--';
          return;
        }
        
        const time = timeParts[0];
        period = timeParts[1];
        
        [hours, minutes] = time.split(':').map(Number);
        
        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period === 'AM' && hours === 12) {
          hours = 0;
        }
      } else {
        // Assume it's 24-hour format
        [hours, minutes] = timeStr.split(':').map(Number);
      }
      
      const prayerTimeInMinutes = hours * 60 + minutes;
      
      let timeRemainingInMinutes;
      if (prayerTimeInMinutes > currentTimeInMinutes) {
        timeRemainingInMinutes = prayerTimeInMinutes - currentTimeInMinutes;
      } else {
        // Prayer is tomorrow
        timeRemainingInMinutes = (24 * 60 - currentTimeInMinutes) + prayerTimeInMinutes;
      }
      
      // Check if it's 5 minutes or less to next prayer
      if (timeRemainingInMinutes <= 5 && timeRemainingInMinutes > 0) {
        warningElement.textContent = `⚠️ ${nextPrayerInfo.name} prayer in ${timeRemainingInMinutes} minutes!`;
        warningElement.style.display = 'block';
      } else {
        warningElement.style.display = 'none';
      }
      
      const countdownHours = Math.floor(timeRemainingInMinutes / 60);
      const countdownMinutes = timeRemainingInMinutes % 60;
      
      // Format countdown display
      countdownElement.textContent = `${countdownHours.toString().padStart(2, '0')}:${countdownMinutes.toString().padStart(2, '0')}`;
    } catch (error) {
      console.error('Error updating countdown display:', error);
      countdownElement.textContent = '--:--';
    }
  }

  // Update clock display in 12-hour format
  function updateClock() {
    const now = new Date();
    
    // Update time in 12-hour format
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    const formattedHours = hours.toString().padStart(2, '0');
    
    // Update the clock element with separate time and ampm elements
    currentTimeElement.innerHTML = `
      <span class="time">${formattedHours}:${minutes}:${seconds}</span>
      <span class="ampm">${ampm}</span>
    `;
    
    // Update date
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    dayNameElement.textContent = days[now.getDay()];
    dateValueElement.textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }
  
  // Check adzan status and update countdown
  async function checkAdzanStatus() {
    try {
      const response = await browser.runtime.sendMessage({ type: 'getAdzanStatus' });
      
      const adzanStatusElement = document.getElementById('adzan-status');
      const adzanCountdownElement = document.getElementById('adzan-countdown');
      
      if (response && response.isPlaying && response.startTime) {
        // Show adzan status
        adzanStatusElement.style.display = 'block';
        
        // Calculate remaining time using actual duration from adzan player
        const elapsed = (Date.now() - response.startTime) / 1000; // seconds
        const totalDuration = response.totalDuration || 300; // Use actual duration or fallback to 5 minutes
        const remaining = Math.max(0, totalDuration - elapsed);
        
        const minutes = Math.floor(remaining / 60);
        const seconds = Math.floor(remaining % 60);
        
        adzanCountdownElement.textContent = 
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        // Hide adzan status and refresh prayer times after adzan finishes
        if (adzanStatusElement.style.display === 'block') {
          // Adzan just finished, refresh the prayer times display
          updatePrayerTimes();
        }
        adzanStatusElement.style.display = 'none';
      }
    } catch (error) {
      console.error('Error checking adzan status:', error);
    }
  }
  
  // Stop adzan button handler
  document.getElementById('stop-adzan-btn').addEventListener('click', function() {
    browser.runtime.sendMessage({ type: 'stopAdzan' });
    document.getElementById('adzan-status').style.display = 'none';
  });

  // Initial update
  updatePrayerTimes();
});

// Listen for storage changes to sync theme across pages
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.darkMode) {
      const darkMode = changes.darkMode.newValue;
      if (darkMode) {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-icon').textContent = '☀️';
      } else {
        document.body.classList.remove('dark-mode');
        document.getElementById('theme-icon').textContent = '🌙';
      }
    }
    
    if (changes.appTheme) {
      const appTheme = changes.appTheme.newValue || 'ramadhan';
      document.body.classList.remove('theme-classic', 'theme-ramadhan', 'theme-raya');
      document.body.classList.add(`theme-${appTheme}`);
    }
    
    // Auto-update popup when prayer times are updated in the background
    if (changes.prayerTimes && changes.prayerTimes.newValue) {
      const times = changes.prayerTimes.newValue;
      const subuhEl = document.getElementById('subuh-time');
      const zohorEl = document.getElementById('zohor-time');
      const asarEl = document.getElementById('asar-time');
      const maghribEl = document.getElementById('maghrib-time');
      const ishaEl = document.getElementById('isha-time');
      
      if (subuhEl) {
        subuhEl.textContent = times.subuh || '--:--';
        zohorEl.textContent = times.zohor || '--:--';
        asarEl.textContent = times.asar || '--:--';
        maghribEl.textContent = times.maghrib || '--:--';
        ishaEl.textContent = times.isha || '--:--';
      }
      
      // Recalculate next prayer countdown
      if (typeof PrayerTimesCalculator !== 'undefined') {
        const nextPrayerInfo = PrayerTimesCalculator.getNextPrayer(times);
        const nextPrayerNameEl = document.getElementById('next-prayer-name');
        const nextPrayerTimeEl = document.getElementById('next-prayer-time');
        if (nextPrayerNameEl) {
          nextPrayerNameEl.textContent = nextPrayerInfo.name || '--';
          nextPrayerTimeEl.textContent = nextPrayerInfo.time || '--:--';
        }
      }
    }
  }
});

// Load theme from storage
async function loadTheme() {
  try {
    const result = await browser.storage.local.get(['darkMode', 'appTheme']);
    const darkMode = result.darkMode || false;
    const appTheme = result.appTheme || 'ramadhan';
    
    document.body.classList.remove('theme-classic', 'theme-ramadhan', 'theme-raya');
    document.body.classList.add(`theme-${appTheme}`);
    
    if (darkMode) {
      document.body.classList.add('dark-mode');
      document.getElementById('theme-icon').textContent = '☀️';
    } else {
      document.body.classList.remove('dark-mode');
      document.getElementById('theme-icon').textContent = '🌙';
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
}

// Toggle theme
async function toggleTheme() {
  try {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    
    // Update icon
    const themeIcon = document.getElementById('theme-icon');
    themeIcon.textContent = isDarkMode ? '☀️' : '🌙';
    
    // Save preference
    await browser.storage.local.set({ darkMode: isDarkMode });
  } catch (error) {
    console.error('Error toggling theme:', error);
  }
}