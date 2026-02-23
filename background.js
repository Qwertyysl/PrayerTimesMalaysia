// Background script for prayer times extension

// Import prayer times calculator
try {
  importScripts('utils/prayer-times.js');
} catch (e) {
  console.error('Failed to import prayer times calculator:', e);
}

// Fallback: Define getNextPrayer function directly if import fails
if (typeof PrayerTimesCalculator === 'undefined') {
  var PrayerTimesCalculator = {
    getNextPrayer: function(prayerTimes) {
      const now = new Date();
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      
      const prayers = [
        { name: 'Subuh', time: prayerTimes.subuh },
        { name: 'Zohor', time: prayerTimes.zohor },
        { name: 'Asar', time: prayerTimes.asar },
        { name: 'Maghrib', time: prayerTimes.maghrib },
        { name: 'Isha', time: prayerTimes.isha }
      ];
      
      const prayerMinutes = prayers.map(prayer => {
        let timeStr = prayer.time;
        let hours, minutes;
        
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
          const timeParts = timeStr.split(' ');
          const time = timeParts[0];
          const period = timeParts[1];
          [hours, minutes] = time.split(':').map(Number);
          
          if (period === 'PM' && hours !== 12) {
            hours += 12;
          } else if (period === 'AM' && hours === 12) {
            hours = 0;
          }
        } else {
          [hours, minutes] = timeStr.split(':').map(Number);
        }
        
        return hours * 60 + minutes;
      });
      
      let nextPrayerIndex = -1;
      for (let i = 0; i < prayerMinutes.length; i++) {
        if (prayerMinutes[i] > currentTimeInMinutes) {
          nextPrayerIndex = i;
          break;
        }
      }
      
      if (nextPrayerIndex === -1) {
        nextPrayerIndex = 0;
      }
      
      let timeRemainingInMinutes;
      if (nextPrayerIndex === 0 && prayerMinutes[nextPrayerIndex] < currentTimeInMinutes) {
        timeRemainingInMinutes = (24 * 60 - currentTimeInMinutes) + prayerMinutes[nextPrayerIndex];
      } else {
        timeRemainingInMinutes = prayerMinutes[nextPrayerIndex] - currentTimeInMinutes;
      }
      
      const hours = Math.floor(timeRemainingInMinutes / 60);
      const minutes = timeRemainingInMinutes % 60;
      
      return {
        name: prayers[nextPrayerIndex].name,
        time: prayers[nextPrayerIndex].time,
        hours: hours,
        minutes: minutes,
        totalMinutes: timeRemainingInMinutes
      };
    },
    
    getPrayerTimes: async function(locationCode = 'trg01') {
      const response = await fetch(`https://api.waktusolat.app/v2/solat/${locationCode}`);
      const data = await response.json();
      const today = new Date();
      const todayDay = today.getDate();
      const todayData = data.prayers.find(day => day.day === todayDay);
      
      const formatTime12Hour = (timestamp) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      };
      
      return {
        subuh: formatTime12Hour(todayData.fajr),
        zohor: formatTime12Hour(todayData.dhuhr),
        asar: formatTime12Hour(todayData.asr),
        maghrib: formatTime12Hour(todayData.maghrib),
        isha: formatTime12Hour(todayData.isha),
        date: `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${todayDay.toString().padStart(2, '0')}`
      };
    }
  };
}

// Persistent AudioContext for volume boosting
let audioContext = null;

// Track which prayers have been triggered to prevent duplicates
let triggeredPrayers = new Set();

const PRAYER_DEFINITIONS = [
  { name: 'Subuh', key: 'subuh' },
  { name: 'Zohor', key: 'zohor' },
  { name: 'Asar', key: 'asar' },
  { name: 'Maghrib', key: 'maghrib' },
  { name: 'Isha', key: 'isha' }
];
const WARNING_MINUTES = new Set([1, 2, 3, 4, 5]);
const MAX_TRIGGERED_KEYS = 200;

const ALARM_NAMES = {
  UPDATE_PRAYER_TIMES: 'updatePrayerTimes',
  CHECK_NEXT_PRAYER: 'checkNextPrayer',
  CHECK_MINUTE_WARNINGS: 'checkMinuteWarnings'
};

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHourMinute(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function parsePrayerTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }
  
  const trimmedTime = timeStr.trim();
  const hasAmPm = trimmedTime.includes('AM') || trimmedTime.includes('PM');
  
  if (hasAmPm) {
    const parts = trimmedTime.split(' ');
    if (parts.length < 2) {
      return null;
    }
    
    const timePart = parts[0];
    const period = parts[1];
    const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})/);
    
    if (!timeMatch) {
      return null;
    }
    
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    
    return { hours, minutes };
  }
  
  const timeMatch = trimmedTime.match(/^(\d{1,2}):(\d{2})/);
  if (!timeMatch) {
    return null;
  }
  
  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  return { hours, minutes };
}

function getPrayerSchedule(prayerTimes, referenceDate = new Date()) {
  return PRAYER_DEFINITIONS
    .map((prayer) => {
      const timeValue = prayerTimes[prayer.key];
      const parsedTime = parsePrayerTime(timeValue);
      
      if (!parsedTime) {
        return null;
      }
      
      const prayerDate = new Date(referenceDate);
      prayerDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
      
      return {
        name: prayer.name,
        time: timeValue,
        prayerDate
      };
    })
    .filter(Boolean);
}

function markTriggered(triggerKey) {
  if (triggeredPrayers.has(triggerKey)) {
    return false;
  }
  
  triggeredPrayers.add(triggerKey);
  
  if (triggeredPrayers.size > MAX_TRIGGERED_KEYS) {
    const oldestKey = triggeredPrayers.values().next().value;
    if (oldestKey) {
      triggeredPrayers.delete(oldestKey);
    }
  }
  
  return true;
}

function isSameMinute(firstDate, secondDate) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate() &&
    firstDate.getHours() === secondDate.getHours() &&
    firstDate.getMinutes() === secondDate.getMinutes()
  );
}

function ensureAlarms() {
  browser.alarms.create(ALARM_NAMES.UPDATE_PRAYER_TIMES, {
    periodInMinutes: 60
  });
  
  // Browser alarm APIs reliably support one-minute intervals.
  browser.alarms.create(ALARM_NAMES.CHECK_NEXT_PRAYER, {
    periodInMinutes: 1
  });
  
  browser.alarms.create(ALARM_NAMES.CHECK_MINUTE_WARNINGS, {
    periodInMinutes: 1
  });
}

ensureAlarms();

// Listen for alarm events
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAMES.UPDATE_PRAYER_TIMES) {
    updatePrayerTimes();
  } else if (alarm.name === ALARM_NAMES.CHECK_NEXT_PRAYER) {
    checkNextPrayer();
  } else if (alarm.name === ALARM_NAMES.CHECK_MINUTE_WARNINGS) {
    checkMinuteWarnings();
  }
});

// Update prayer times from API
async function updatePrayerTimes() {
  try {
    // Get selected location from storage
    const result = await browser.storage.local.get('selectedLocation');
    const locationCode = result.selectedLocation || 'trg01'; // Default to Kuala Terengganu
    
    // Get prayer times from API
    const prayerTimes = await PrayerTimesCalculator.getPrayerTimes(locationCode);
    
    // Save to storage
    await browser.storage.local.set({
      prayerTimes: prayerTimes,
      lastUpdated: new Date().toISOString()
    });
    
    // Update badge with next prayer
    updateBadgeText(prayerTimes);
  } catch (error) {
    console.error('Error updating prayer times:', error);
  }
}

// Update badge text with next prayer name
async function updateBadgeText(prayerTimes) {
  try {
    // Check if badge is enabled
    const result = await browser.storage.local.get('enableBadge');
    const enableBadge = result.enableBadge || false;
    
    if (!enableBadge) {
      // Clear badge if disabled
      browser.browserAction.setBadgeText({ text: '' });
      return;
    }
    
    if (!prayerTimes) {
      return;
    }
    
    // Check if PrayerTimesCalculator is available
    if (typeof PrayerTimesCalculator === 'undefined') {
      console.error('PrayerTimesCalculator is not defined! Cannot update badge.');
      return;
    }
    
    const nextPrayerInfo = PrayerTimesCalculator.getNextPrayer(prayerTimes);
    
    if (nextPrayerInfo && nextPrayerInfo.name) {
      // Shorten prayer names for badge (max 4 chars recommended)
      const shortNames = {
        'Subuh': 'SBH',
        'Zohor': 'ZHR',
        'Asar': 'ASR',
        'Maghrib': 'MGR',
        'Isha': 'ISA'
      };
      
      const badgeText = shortNames[nextPrayerInfo.name] || nextPrayerInfo.name.substring(0, 3);
      
      // Set badge text to shortened prayer name
      browser.browserAction.setBadgeText({ text: badgeText });
      
      // Set badge background color
      browser.browserAction.setBadgeBackgroundColor({ color: '#667eea' });
    }
  } catch (error) {
    console.error('Error updating badge text:', error);
  }
}

// Check if it's time for the next prayer
async function checkNextPrayer() {
  try {
    // Don't trigger new adzan if one is already playing
    if (adzanTabId !== null) {
      return;
    }
    
    const result = await browser.storage.local.get([
      'prayerTimes', 
      'enableNotifications', 
      'enableAthan',
      'muteTabsDuringAthan',
      'adzanVolume',
      'enableDoa'
    ]);
    
    if (!result.prayerTimes) {
      return;
    }
    
    const now = new Date();
    
    // Keep badge updated even when popup is not open.
    updateBadgeText(result.prayerTimes);
    
    const prayerSchedule = getPrayerSchedule(result.prayerTimes, now);
    const currentPrayer = prayerSchedule.find((prayer) => isSameMinute(now, prayer.prayerDate));
    
    if (!currentPrayer) {
      return;
    }
    
    const prayerKey = `${formatDateKey(now)}-prayer-${currentPrayer.name}-${formatHourMinute(currentPrayer.prayerDate)}`;
    if (!markTriggered(prayerKey)) {
      return;
    }
    
    if (result.enableNotifications !== false) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/icon-48.png'),
        title: 'Prayer Time',
        message: `It's time for ${currentPrayer.name} prayer`
      });
    }
    
    if (result.enableAthan === true) {
      playAdzanSound(
        result.muteTabsDuringAthan,
        result.adzanVolume,
        currentPrayer.name,
        result.enableDoa
      );
    }
  } catch (error) {
    console.error('Error checking next prayer:', error);
  }
}

// Check for minute warnings (5, 4, 3, 2, 1 minutes before prayer)
async function checkMinuteWarnings() {
  try {
    const result = await browser.storage.local.get([
      'prayerTimes', 
      'enableNotifications'
    ]);
    
    // Check if notifications are enabled
    if (result.enableNotifications === false) {
      return;
    }
    
    if (!result.prayerTimes) {
      return;
    }
    
    const now = new Date();
    const prayerSchedule = getPrayerSchedule(result.prayerTimes, now);
    
    for (const prayer of prayerSchedule) {
      const nextPrayerTime = new Date(prayer.prayerDate);
      
      if (nextPrayerTime.getTime() <= now.getTime()) {
        nextPrayerTime.setDate(nextPrayerTime.getDate() + 1);
      }
      
      const diffMs = nextPrayerTime.getTime() - now.getTime();
      if (diffMs <= 0 || diffMs > 5 * 60000) {
        continue;
      }
      
      const minutesRemaining = Math.ceil(diffMs / 60000);
      if (!WARNING_MINUTES.has(minutesRemaining)) {
        continue;
      }
      
      const warningKey = `${formatDateKey(nextPrayerTime)}-warning-${prayer.name}-${minutesRemaining}`;
      if (!markTriggered(warningKey)) {
        continue;
      }
      
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/icon-48.png'),
        title: 'Prayer Time Reminder',
        message: `${prayer.name} prayer in ${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}`
      });
    }
  } catch (error) {
    console.error('Error checking minute warnings:', error);
  }
}

// Global variables for adzan playback control
let currentAdzanAudio = null;
let mutedTabs = [];
let pausedTabs = [];
let unmuteTimeout = null;
let adzanNotificationId = null;
let adzanTabId = null;
let adzanStartTime = null;

// Play adzan sound by opening a dedicated tab
async function playAdzanSound(muteTabs = false, adzanVolume = 100, prayerName = '', enableDoa = false) {
  try {
    // Store adzan start time
    adzanStartTime = Date.now();
    
    // Pause media in tabs FIRST if requested (respect mode - before adzan tab opens)
    if (muteTabs) {
      try {
        const tabs = await browser.tabs.query({});
        
        for (const currentTab of tabs) {
          try {
            // Execute script to pause all media elements
            await browser.tabs.executeScript(currentTab.id, {
              code: `
                (function() {
                  const mediaElements = document.querySelectorAll('video, audio');
                  let pausedCount = 0;
                  mediaElements.forEach(media => {
                    if (!media.paused) {
                      media.pause();
                      media.dataset.adzanPaused = 'true';
                      pausedCount++;
                    }
                  });
                  return pausedCount;
                })();
              `
            });
            
            // Also mute the tab as backup
            if (currentTab.audible) {
              await browser.tabs.update(currentTab.id, { muted: true });
              mutedTabs.push(currentTab.id);
            }
            
            pausedTabs.push(currentTab.id);
          } catch (tabError) {
            // Silently handle tab errors
          }
        }
      } catch (pauseError) {
        console.error('Error pausing media in tabs:', pauseError);
      }
    }
    
    // Create adzan player HTML page (after tabs are paused)
    const adzanPlayerUrl = browser.runtime.getURL('adzan-player.html') + 
      `?volume=${adzanVolume}&prayer=${encodeURIComponent(prayerName)}&enableDoa=${enableDoa}`;
    
    // Open adzan player in a new tab
    try {
      const tab = await browser.tabs.create({
        url: adzanPlayerUrl,
        active: true
      });
      
      adzanTabId = tab.id;
    } catch (tabCreateError) {
      // Fallback for cases where no browser window is currently available.
      const createdWindow = await browser.windows.create({
        url: adzanPlayerUrl,
        type: 'popup'
      });
      
      if (createdWindow && createdWindow.tabs && createdWindow.tabs.length > 0) {
        adzanTabId = createdWindow.tabs[0].id;
      } else {
        throw tabCreateError;
      }
    }
    
  } catch (error) {
    console.error('Error playing adzan sound:', error);
    // Make sure to unmute tabs even if there's an error
    await unmuteTabsAfterDelay();
  }
}

// Stop adzan playback
async function stopAdzan() {
  try {
    // Close adzan tab if open
    if (adzanTabId) {
      try {
        await browser.tabs.remove(adzanTabId);
      } catch (tabError) {
        // Silently handle tab errors
      }
      adzanTabId = null;
    }
    
    // Clear start time
    adzanStartTime = null;
    
    // Close the notification
    if (adzanNotificationId) {
      browser.notifications.clear(adzanNotificationId);
      adzanNotificationId = null;
    }
    
    // Unpause media and unmute tabs immediately
    await unpauseMediaAndUnmuteTabs();
  } catch (error) {
    console.error('Error stopping adzan:', error);
  }
}

// Store total duration from adzan player
let adzanTotalDuration = 0;

// Listen for messages from adzan player
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'adzanFinished') {
    adzanTabId = null;
    adzanStartTime = null;
    adzanTotalDuration = 0;
    unmuteTabsAfterDelay();
  } else if (message.type === 'adzanStarted') {
    // Store the total duration and reset start time when adzan/doa starts
    adzanTotalDuration = message.duration || 0;
    adzanStartTime = Date.now(); // Reset start time for accurate countdown
  } else if (message.type === 'getAdzanStatus') {
    // Return adzan status to popup
    return Promise.resolve({
      isPlaying: adzanTabId !== null,
      startTime: adzanStartTime,
      tabId: adzanTabId,
      totalDuration: adzanTotalDuration
    });
  } else if (message.type === 'stopAdzan') {
    stopAdzan();
  } else if (message.type === 'updatePrayerTimes') {
    // Update prayer times when location changes
    updatePrayerTimes();
  }
});

// Unpause media and unmute tabs
async function unpauseMediaAndUnmuteTabs() {
  try {
    // Unpause media in all paused tabs
    for (const tabId of pausedTabs) {
      try {
        await browser.tabs.executeScript(tabId, {
          code: `
            (function() {
              const mediaElements = document.querySelectorAll('video, audio');
              let unpausedCount = 0;
              mediaElements.forEach(media => {
                if (media.dataset.adzanPaused === 'true') {
                  media.play();
                  delete media.dataset.adzanPaused;
                  unpausedCount++;
                }
              });
              return unpausedCount;
            })();
          `
        });
      } catch (tabError) {
        // Silently handle tab errors
      }
    }
    
    // Unmute tabs
    await unmuteTabs(mutedTabs);
    
    // Clear arrays
    pausedTabs = [];
    mutedTabs = [];
  } catch (error) {
    console.error('Error unpausing media and unmuting tabs:', error);
  }
}

// Unmute tabs after a 10-second delay
async function unmuteTabsAfterDelay() {
  try {
    // Clear any existing unmute timeout
    if (unmuteTimeout) {
      clearTimeout(unmuteTimeout);
      unmuteTimeout = null;
    }
    
    // Schedule automatic unpausing and unmuting in 10 seconds
    unmuteTimeout = setTimeout(async () => {
      await unpauseMediaAndUnmuteTabs();
    }, 10000); // 10 seconds
  } catch (error) {
    console.error('Error scheduling unmute:', error);
  }
}

// Unmute previously muted tabs
async function unmuteTabs(tabIds) {
  try {
    for (const tabId of tabIds) {
      try {
        await browser.tabs.update(tabId, { muted: false });
      } catch (tabError) {
        // Silently handle tab errors
      }
    }
  } catch (unmuteError) {
    console.error('Error unmuting tabs:', unmuteError);
  }
}

async function initializeBackground() {
  try {
    ensureAlarms();
    
    const result = await browser.storage.local.get('prayerTimes');
    
    if (result.prayerTimes) {
      updateBadgeText(result.prayerTimes);
    } else {
      // Trigger initial update
      await updatePrayerTimes();
    }
    
    // Run checks once immediately in case alarms were delayed.
    await checkMinuteWarnings();
    await checkNextPrayer();
  } catch (error) {
    console.error('Error initializing background:', error);
  }
}

// Initialize on extension install
browser.runtime.onInstalled.addListener(() => {
  triggeredPrayers.clear();
  initializeBackground();
});

// Initialize on extension startup
browser.runtime.onStartup.addListener(() => {
  triggeredPrayers.clear();
  initializeBackground();
});

// Initialize immediately when script loads
initializeBackground();
