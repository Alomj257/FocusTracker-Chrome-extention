// background.js

class MilestoneNotifier {
  constructor() {
    this.lastNotificationTime = 0;
    this.notifiedMilestones = new Set();
    
    // Define all milestones
    this.MILESTONES = {
      1800000: { // 30 minutes
        messages: [
          "🎯 Fantastic start! You've crushed 30 minutes of deep focus!",
          "🎯 Way to go! Your first 30 minutes of undistracted work is in the bag.",
          "🎯 You're off to a flying start! 30 minutes of deep work achieved.",
          "🎯 Keep it up! Your 30-minute milestone is a great warm-up.",
          "🎯 Awesome job! 30 minutes of focus sets the tone for success.",
          "🎯 Nice work! You've built a strong foundation with 30 minutes of focus.",
          "🎯 Great energy! Your first 30 minutes of deep work is done!",
          "🎯 You're building momentum! 30 focused minutes down."
        ]
      },
      3600000: { // 1 hour
        messages: [
          "⭐ Impressive! A full hour of deep work is no small feat.",
          "⭐ You're on fire! One hour of pure focus—amazing!",
          "⭐ Keep that energy going! One productive hour complete.",
          "⭐ Outstanding work! You've locked in one solid hour of focus.",
          "⭐ Amazing! One hour of focused effort puts you ahead of the game.",
          "⭐ You're unstoppable! A full hour of deep work down.",
          "⭐ One hour of pure concentration—well done!",
          "⭐ Fantastic focus! You've just completed a super-productive hour."
        ]
      },
      7200000: { // 2 hours
        messages: [
          "🏆 Two hours of deep focus—you're a productivity champion!",
          "🏆 Amazing dedication! Two hours of uninterrupted work done!",
          "🏆 That's next-level focus! Two hours of deep work achieved.",
          "🏆 Two hours of focus—you're in the productivity zone!",
          "🏆 Outstanding! Two hours of deep, uninterrupted progress.",
          "🏆 Your focus is unmatched! Two hours down like a pro.",
          "🏆 Two hours in—you're mastering the art of deep work!",
          "🏆 Amazing effort! Two focused hours brings big rewards."
        ]
      },
      14400000: { // 4 hours
        messages: [
          "🌟 Four hours of focus—this is mastery in motion!",
          "🌟 What an achievement! Four hours of deep work complete.",
          "🌟 You've reached the productivity elite—four focused hours!",
          "🌟 Four hours of deep focus shows incredible commitment!",
          "🌟 Legendary focus! Four hours of productivity unlocked.",
          "🌟 You're in the zone! Four hours of pure focus done.",
          "🌟 Four hours in—you're redefining productivity greatness.",
          "🌟 Exceptional! Four hours of deep, impactful work achieved."
        ]
      },
      21600000: { // 6 hours
        messages: [
          "🚀 Six hours of deep work—you're a force of nature!",
          "🚀 Incredible focus! Six hours of uninterrupted progress.",
          "🚀 You're setting the bar high! Six hours of productivity greatness.",
          "🚀 Six hours of focus—it's the stuff of legends!",
          "🚀 Epic work! Six hours of focus puts you in a league of your own.",
          "🚀 Amazing perseverance! Six hours of productive effort achieved.",
          "🚀 You're on a mission! Six hours of deep work down.",
          "🚀 Six hours of focus—you're officially unstoppable!"
        ]
      }
    };
  }

  async checkNotificationPermission() {
    return new Promise(resolve => {
      chrome.permissions.contains({
        permissions: ['notifications']
      }, (result) => {
        resolve(result);
      });
    });
  }

  getRandomMessage(messages) {
    return messages[Math.floor(Math.random() * messages.length)];
  }

  async checkMilestones(sessionStartTime) {
    if (!sessionStartTime) return;
    
    const hasPermission = await this.checkNotificationPermission();
    if (!hasPermission) return;
    
    const currentDuration = Date.now() - sessionStartTime;
    
    // Check each milestone
    for (const [duration, milestone] of Object.entries(this.MILESTONES)) {
      const durationNum = parseInt(duration);
      if (currentDuration >= durationNum && !this.notifiedMilestones.has(durationNum)) {
        const message = this.getRandomMessage(milestone.messages);
        this.showNotification({
          title: message.split(' ')[0], // Use the emoji as title
          message: message.split(' ').slice(1).join(' ') // Rest of the message
        });
        this.notifiedMilestones.add(durationNum);
      }
    }
  }

  showNotification(options) {
    const now = Date.now();
    if (now - this.lastNotificationTime < 5000) return;
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: options.title,
      message: options.message,
      priority: 1,
      silent: true
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('Notification error:', chrome.runtime.lastError);
        return;
      }
      this.lastNotificationTime = now;
    });
  }

  reset() {
    this.notifiedMilestones.clear();
  }
}

// Airtable API Setup
const AIRTABLE_API_URL = 'https://api.airtable.com/v0/'; // Base URL for Airtable API
const AIRTABLE_API_KEY = ''; // Airtable API key for authorization

// Function to save data to Airtable
async function saveToAirtable(tableName, fields) {
  try {
    const response = await fetch(`${AIRTABLE_API_URL}/${tableName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`, // Bearer token for authentication
        'Content-Type': 'application/json' // Ensures JSON format for the body
      },
      body: JSON.stringify({ fields }) // Payload containing the fields to save
    });
    const data = await response.json(); // Parse the JSON response

    if (data.error) {
      console.error('Error saving to Airtable:', data.error); // Log errors if any
    } else {
      console.log('Data saved to Airtable:', data); // Log success response
    }
  } catch (error) {
    console.error('Error saving to Airtable:', error); // Catch network or other errors
  }
}

// State variables for session and activity tracking
let activeSession = null; // Stores the current active session details
let siteVisits = new Map(); // Tracks time spent on each site
let lastActiveTab = null; // Stores the hostname of the last active tab
let lastActiveTime = null; // Timestamp of the last activity on a tab
const milestoneNotifier = new MilestoneNotifier(); // Notifies session milestones

// Periodic check for session milestones
setInterval(() => {
  if (activeSession?.startTime) {
    milestoneNotifier.checkMilestones(activeSession.startTime);
  }
}, 1000); // Checks every second

// Listener for tab activation (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeSession) await updateSiteTracking(activeInfo.tabId); // Update site tracking for the new tab
});

// Listener for tab updates (e.g., URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (activeSession && changeInfo.url) await updateSiteTracking(tabId); // Update tracking if URL changes
});

// Listener for window focus changes (e.g., switching between apps)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (activeSession) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await recordSiteTime('other_apps'); // Log time spent on non-browser activities
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.url) await updateSiteTracking(tabs[0].id); // Update site tracking for the active tab
    }
  }
});

// Function to update tracking of the current active site
async function updateSiteTracking(tabId) {
  try {
    // Record time spent on the previous site
    if (lastActiveTab && lastActiveTime) {
      const timeSpent = Date.now() - lastActiveTime;
      await recordSiteTime(lastActiveTab, timeSpent);
    }

    // Update the current active tab details
    const tab = await chrome.tabs.get(tabId);
    const hostname = tab?.url ? new URL(tab.url).hostname : 'invalid_url';
    lastActiveTab = hostname;
    lastActiveTime = Date.now();
  } catch (error) {
    console.error('Error updating site tracking:', error);
  }
}

// Function to record time spent on a site
async function recordSiteTime(site, duration = null) {
  duration = duration || (Date.now() - lastActiveTime); // Calculate duration if not provided
  const currentTime = siteVisits.get(site) || 0; // Get previously logged time
  siteVisits.set(site, currentTime + duration); // Update the total time spent on the site

  console.log(`Updated Site Time: ${site}, Total: ${currentTime + duration}ms`);

  lastActiveTab = site; // Update the last active site
  lastActiveTime = Date.now(); // Reset the last active time
}

// Listener for messages from other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_SESSION':
      startSession(sendResponse); // Start a new session
      break;

    case 'END_SESSION':
      endSession(sendResponse); // End the current session
      break;

    case 'REPORT_DISTRACTION':
      reportDistraction(sendResponse); // Log a distraction
      break;

    case 'GET_SESSION_STATE':
      sendResponse({ activeSession }); // Respond with the current session state
      break;
  }
  return true; // Keep the message channel open for asynchronous responses
});

// Function to start a new session
function startSession(sendResponse) {
  activeSession = {
    startTime: Date.now(),
    distractions: 0, // Initialize distraction count
    sessionId: generateSessionId() // Generate a unique session ID
  };
  siteVisits = new Map(); // Reset site visits
  milestoneNotifier.reset(); // Reset milestone notifier
  chrome.storage.local.set({ activeSession }); // Save session data to local storage

  // Save the session to Airtable
  saveToAirtable('Sessions', {
    SessionID: activeSession.sessionId,
    StartTime: new Date(activeSession.startTime).toISOString(),
    EndTime: null, // Placeholder for session end time
    Duration: 0, // Placeholder for session duration
    Distractions: activeSession.distractions
  }).then(response => {
    if (response?.id) activeSession.sessionId = response.id; // Update session ID with Airtable response
  });

  sendResponse({ status: 'started' });
}

// Function to end the current session
async function endSession(sendResponse) {
  if (activeSession) {
    if (lastActiveTab && lastActiveTime) await recordSiteTime(lastActiveTab); // Record time for the last active site

    const sessionData = {
      startTime: activeSession.startTime,
      endTime: Date.now(),
      duration: (Date.now() - activeSession.startTime) / 60000, // Convert duration to minutes
      distractions: activeSession.distractions,
      siteVisits: Object.fromEntries(siteVisits), // Convert Map to object
      sessionId: activeSession.sessionId
    };

    await saveSessionData(sessionData); // Save the session data

    // Reset session-related variables
    activeSession = null;
    lastActiveTab = null;
    lastActiveTime = null;
    siteVisits.clear();

    chrome.storage.local.set({ activeSession: null }); // Clear session data in local storage
    sendResponse({ status: 'ended' });
  }
}

// Function to report a distraction during a session
function reportDistraction(sendResponse) {
  if (activeSession) {
    activeSession.distractions++; // Increment the distraction count
    chrome.storage.local.set({ activeSession }); // Update local storage
  }
  sendResponse({ status: 'distraction_recorded' });
}

// Function to save session data to Airtable and local storage
async function saveSessionData(sessionData) {
  const combinedVisits = [];
  for (const [site, timeSpent] of Object.entries(sessionData.siteVisits)) {
    combinedVisits.push({ URL: site, TimeSpent: timeSpent / 1000 }); // Convert to seconds
  }

  console.log('Saving aggregated site visits:', combinedVisits);

  // Save each site visit to Airtable
  for (const visit of combinedVisits) {
    await saveToAirtable('Site Visits', {
      URL: visit.URL,
      TimeSpent: visit.TimeSpent,
      Session: sessionData.sessionId
    });
  }

  // Update session details in Airtable
  await saveToAirtable('Sessions', {
    SessionID: sessionData.sessionId,
    StartTime: new Date(sessionData.startTime).toISOString(),
    EndTime: new Date(sessionData.endTime).toISOString(),
    Duration: sessionData.duration,
    DistractionCount: sessionData.distractions
  });

  saveSessionToHistory(sessionData); // Save the session to local history
}

// Function to save session data to local history
async function saveSessionToHistory(sessionData) {
  const result = await chrome.storage.local.get('sessionHistory'); // Retrieve current session history
  const sessionHistory = result.sessionHistory || [];
  sessionHistory.push(sessionData); // Add the new session to history

  if (sessionHistory.length > 100) sessionHistory.shift(); // Limit history to 100 entries

  await chrome.storage.local.set({ sessionHistory }); // Save updated history to local storage
}

// Utility function to generate a unique session ID
function generateSessionId() {
  return 'session_' + Math.random().toString(36).substring(2, 15); // Generate random string
}
