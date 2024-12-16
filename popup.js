// popup.js

class FocusSession {
  constructor() {
    this.isActive = false;
    this.startTime = null;
    this.distractions = 0;
    this.timer = null;
    this.streak = 0;
    this.MIN_SESSION_DURATION = 5 * 1000;  // 5 seconds in milliseconds
    this.COLORS = {
      inactive: '#06C2D6', // Your primary color
      active: '#F44336',   // Red for active session
      disabled: '#3F4147'  // Your gray color
    };
    this.initializeElements();
    this.attachEventListeners();
    this.loadState();
    this.initializeDebugPanel();
    this.setupMessageListeners();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'TAB_CHANGED') {
        this.handleTabChange(message.tabId);
      }
      if (message.type === 'INACTIVITY_DETECTED') {
        this.handleInactivity(message.duration);
      }
      return true;
    });
  }

  async handleTabChange(tabId) {
    console.log('Tab changed:', tabId);
  }

  async handleInactivity(duration) {
    if (this.isActive) {
      console.log('Inactivity detected:', duration);
    }
  }

  initializeElements() {
    this.timerDisplay = document.getElementById('timer-display');
    this.toggleButton = document.getElementById('toggle-focus');
    this.distractionButton = document.getElementById('report-distraction');
    this.summarySection = document.getElementById('session-summary');
    this.summaryDuration = document.getElementById('summary-duration');
    this.summaryDistractions = document.getElementById('summary-distractions');
    this.newSessionButton = document.getElementById('new-session');
    this.streakCount = document.getElementById('streak-count');
    this.debugButton = document.getElementById('toggle-debug');
    this.debugData = document.getElementById('debug-data');
    this.sessionHistory = document.getElementById('session-history');
    this.insightsButton = document.getElementById('view-insights');
  }

  attachEventListeners() {
    this.toggleButton.addEventListener('click', () => this.toggleSession());
    this.distractionButton.addEventListener('click', () => this.reportDistraction());
    this.newSessionButton.addEventListener('click', () => this.resetUI());
    
    this.insightsButton.addEventListener('click', () => {
      chrome.windows.create({
        url: 'insights.html',
        type: 'popup',
        width: 800,
        height: 600,
        top: (screen.height - 600) / 2,
        left: (screen.width - 800) / 2
      });
    });
  }

  initializeDebugPanel() {
    this.debugButton.addEventListener('click', () => this.toggleDebugPanel());
    this.debugButton.addEventListener('click', () => this.updateDebugData());
  }

  async toggleDebugPanel() {
    this.debugData.classList.toggle('hidden');
    if (this.debugButton.textContent === 'Show Debug Data') {
      this.debugButton.textContent = 'Hide Debug Data';
    } else {
      this.debugButton.textContent = 'Show Debug Data';
    }
  }

  async updateDebugData() {
    const storageData = await chrome.storage.local.get(null);
    const sessionHistory = storageData.sessionHistory || [];
    let historyHtml = '';
    
    sessionHistory.reverse().forEach((session, index) => {
      const date = new Date(session.startTime);
      const duration = Math.floor(session.duration / 1000);
      
      historyHtml += `
        <div class="session-item">
          <div>Session ${sessionHistory.length - index}</div>
          <div>Date: ${date.toLocaleString()}</div>
          <div>Duration: ${duration} seconds</div>
          <div>Distractions: ${session.distractions}</div>
        </div>
      `;
    });

    historyHtml = `
      <div class="session-item">
        <div><strong>Current Streak:</strong> ${this.streak}</div>
        <div><strong>Last Session:</strong> ${storageData.lastSessionDate ? new Date(storageData.lastSessionDate).toLocaleString() : 'None'}</div>
      </div>
      <h3>Previous Sessions:</h3>
      ${historyHtml}
    `;

    this.sessionHistory.innerHTML = historyHtml;
  }

  async loadState() {
    const bgResponse = await chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' });
    
    if (bgResponse?.activeSession) {
      this.isActive = true;
      this.startTime = bgResponse.activeSession.startTime;
      this.distractions = bgResponse.activeSession.distractions;
      this.updateUI();
      this.startTimer();
    } else {
      const state = await chrome.storage.local.get([
        'isActive',
        'startTime',
        'distractions',
        'streak',
        'lastSessionDate'
      ]);
      
      this.streak = state.streak || 0;
      this.updateStreakDisplay();

      const lastSessionDate = state.lastSessionDate ? new Date(state.lastSessionDate) : null;
      if (lastSessionDate) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastSessionDate < yesterday) {
          this.streak = 0;
          this.updateStreakDisplay();
          await this.updateStorage();
        }
      }

      if (state.isActive) {
        this.isActive = true;
        this.startTime = state.startTime;
        this.distractions = state.distractions || 0;
        this.updateUI();
        this.startTimer();
      }
    }
  }

  async toggleSession() {
    this.toggleButton.disabled = true;
    this.updateToggleButtonState('disabled');

    if (!this.isActive) {
      const response = await chrome.runtime.sendMessage({
        type: 'START_SESSION'
      });

      if (response.status === 'started') {
        this.isActive = true;
        this.startTime = Date.now();
        this.distractions = 0;
        this.updateStorage();
        this.startTimer();
        this.updateUI();
      }
    } else {
      const response = await chrome.runtime.sendMessage({
        type: 'END_SESSION'
      });

      if (response.status === 'ended') {
        this.isActive = false;
        clearInterval(this.timer);
        
        const sessionDuration = Date.now() - this.startTime;
        
        if (sessionDuration >= this.MIN_SESSION_DURATION) {
          await this.updateStreak();
        }
        
        this.showSummary();
        await this.saveSessionToHistory();
        this.updateStorage();
      }
    }

    this.toggleButton.disabled = false;
    this.updateToggleButtonState();
  }

  updateToggleButtonState(state = null) {
    // Remove any existing transition classes
    this.toggleButton.classList.remove('active');
    
    if (state === 'disabled') {
      this.toggleButton.style.backgroundColor = this.COLORS.disabled;
      this.toggleButton.textContent = 'Processing...';
      return;
    }

    if (this.isActive) {
      this.toggleButton.style.backgroundColor = this.COLORS.active;
      this.toggleButton.classList.add('active');
      this.toggleButton.textContent = 'End Focus Session';
    } else {
      this.toggleButton.style.backgroundColor = this.COLORS.inactive;
      this.toggleButton.textContent = 'Start Focus Session';
    }

    // Add pulse animation
    this.toggleButton.classList.add('pulse');
    setTimeout(() => {
      this.toggleButton.classList.remove('pulse');
    }, 500);
  }

  async reportDistraction() {
    await chrome.runtime.sendMessage({
      type: 'REPORT_DISTRACTION'
    });
    
    this.distractions++;
    this.updateStorage();

    // Add pulse animation to distraction count
    const distractionDisplay = document.createElement('div');
    distractionDisplay.textContent = `+1`;
    distractionDisplay.className = 'distraction-pulse';
    document.body.appendChild(distractionDisplay);
    setTimeout(() => distractionDisplay.remove(), 1000);
  }

  async updateStreak() {
    const today = new Date();
    const lastSessionDate = await this.getLastSessionDate();
    
    if (lastSessionDate) {
      const lastDate = new Date(lastSessionDate);
      if (this.isYesterday(lastDate)) {
        this.streak++;
      } 
      else if (this.isSameDay(lastDate, today)) {
        // Streak stays the same
      } 
      else {
        this.streak = 1;
      }
    } else {
      this.streak = 1;
    }
    
    this.updateStreakDisplay();
    await chrome.storage.local.set({ 
      streak: this.streak,
      lastSessionDate: today.toISOString()
    });
  }

  isYesterday(date) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return this.isSameDay(date, yesterday);
  }

  isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  async getLastSessionDate() {
    const result = await chrome.storage.local.get('lastSessionDate');
    return result.lastSessionDate;
  }

  async saveSessionToHistory() {
    const sessionData = {
      startTime: this.startTime,
      endTime: Date.now(),
      duration: Date.now() - this.startTime,
      distractions: this.distractions
    };

    const result = await chrome.storage.local.get('sessionHistory');
    const sessionHistory = result.sessionHistory || [];
    sessionHistory.push(sessionData);

    if (sessionHistory.length > 100) {
      sessionHistory.shift();
    }

    await chrome.storage.local.set({ sessionHistory });
  }

  updateStreakDisplay() {
    this.streakCount.textContent = this.streak;
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.updateTimerDisplay();
    }, 1000);
  }

  updateTimerDisplay() {
    const duration = Date.now() - this.startTime;
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    this.timerDisplay.textContent = 
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async updateSiteTrackingSummary() {
    const result = await chrome.storage.local.get('siteVisits');
    const siteVisits = result.siteVisits || {};
    
    // Convert to array and sort by time spent
    const sortedSites = Object.entries(siteVisits)
      .map(([site, duration]) => ({
        site,
        minutes: Math.floor(duration / 60000)
      }))
      .sort((a, b) => b.minutes - a.minutes);
  
    // Create the summary HTML
    let siteHtml = '<h3>Site Activity:</h3><div class="site-tracking">';
    
    sortedSites.forEach(({ site, minutes }) => {
      if (minutes > 0) {
        siteHtml += `
          <div class="site-item">
            <span class="site-name">${site}</span>
            <span class="site-time">${minutes}m</span>
            <div class="site-bar" style="width: ${(minutes / sortedSites[0].minutes) * 100}%"></div>
          </div>
        `;
      }
    });
    
    siteHtml += '</div>';
    
    // Add to summary section
    const trackingDiv = document.getElementById('site-tracking-summary') || 
      document.createElement('div');
    trackingDiv.id = 'site-tracking-summary';
    trackingDiv.innerHTML = siteHtml;
    this.summarySection.appendChild(trackingDiv);
  }

  updateUI() {
    this.updateToggleButtonState();
    this.distractionButton.disabled = !this.isActive;
    this.summarySection.classList.add('hidden');
  }

  async showSummary() {
    const duration = Date.now() - this.startTime;
    const minutes = Math.floor(duration / 60000);
    
    this.summarySection.classList.remove('hidden');
    this.summaryDuration.textContent = `${minutes} minutes`;
    this.summaryDistractions.textContent = this.distractions;
    
    // Get and display site tracking data
    await this.updateSiteTrackingSummary();
  }
  
  async updateSiteTrackingSummary() {
    const result = await chrome.storage.local.get(['sessionHistory']);
    const sessionHistory = result.sessionHistory || [];
    const lastSession = sessionHistory[sessionHistory.length - 1];
    
    const trackingDiv = document.getElementById('site-tracking-summary');
    
    if (!lastSession?.siteVisits || Object.keys(lastSession.siteVisits).length === 0) {
      trackingDiv.innerHTML = `
        <div class="site-tracking-empty">
          <p>No site activity recorded in this session</p>
        </div>
      `;
      return;
    }
  
    // Convert to array and sort by time spent
    const sortedSites = Object.entries(lastSession.siteVisits)
      .map(([site, duration]) => ({
        site: this.formatSiteName(site),
        duration: duration,
        minutes: Math.floor(duration / 60000),
        seconds: Math.floor((duration % 60000) / 1000)
      }))
      .filter(site => site.duration > 0)
      .sort((a, b) => b.duration - a.duration);
  
    if (sortedSites.length > 0) {
      const maxDuration = sortedSites[0].duration;
      
      const trackingHtml = `
        <div class="site-tracking-header">
          <h3>Site Activity</h3>
          <span class="site-tracking-count">${sortedSites.length} sites tracked</span>
        </div>
        <div class="site-tracking">
          ${sortedSites.map(({ site, duration, minutes, seconds }) => {
            const percentage = (duration / maxDuration) * 100;
            const timeDisplay = minutes > 0 ? 
              `${minutes}m ${seconds}s` : 
              `${seconds}s`;
            
            return `
              <div class="site-item">
                <div class="site-bar" style="width: ${percentage}%"></div>
                <span class="site-name">${this.escapeHtml(site)}</span>
                <span class="site-time">${timeDisplay}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
  
      trackingDiv.innerHTML = trackingHtml;
      
      // Animate entries
      const entries = trackingDiv.querySelectorAll('.site-item');
      entries.forEach((entry, index) => {
        entry.style.animationDelay = `${index * 100}ms`;
      });
    }
  }
  
  // Add this helper method to your FocusSession class
  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  formatSiteName(site) {
    if (site === 'other_apps') {
      return 'Other Applications';
    }
    // Remove www. and handle empty/undefined cases
    return site.replace(/^www\./, '') || 'Unknown';
  }

  resetUI() {
    this.timerDisplay.textContent = '00:00:00';
    this.isActive = false;
    this.updateToggleButtonState();
    this.distractionButton.disabled = true;
    this.summarySection.classList.add('hidden');
  }

  async updateStorage() {
    await chrome.storage.local.set({
      isActive: this.isActive,
      startTime: this.startTime,
      distractions: this.distractions
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new FocusSession();
});