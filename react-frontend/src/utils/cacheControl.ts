/**
 * Cache control utilities to prevent aggressive browser caching
 */

export const checkForUpdates = async (): Promise<boolean> => {
  try {
    const response = await fetch('/version.json', {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    const currentVersion = localStorage.getItem('app_version');
    
    if (currentVersion && currentVersion !== data.version) {
      console.log(`New version detected: ${currentVersion} -> ${data.version}`);
      return true;
    }
    
    localStorage.setItem('app_version', data.version);
    return false;
  } catch (error) {
    console.error('Error checking for updates:', error);
    return false;
  }
};

export const forceReload = () => {
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  
  // Clear localStorage except auth
  const authToken = localStorage.getItem('auth_token');
  const userId = localStorage.getItem('user_id');
  localStorage.clear();
  if (authToken) localStorage.setItem('auth_token', authToken);
  if (userId) localStorage.setItem('user_id', userId);
  
  // Hard reload
  window.location.reload();
};

// Check for updates every 5 minutes
export const startUpdateChecker = () => {
  checkForUpdates().then(hasUpdate => {
    if (hasUpdate) {
      const shouldReload = window.confirm(
        'A new version of the app is available. Would you like to reload now?'
      );
      if (shouldReload) {
        forceReload();
      }
    }
  });
  
  setInterval(() => {
    checkForUpdates().then(hasUpdate => {
      if (hasUpdate) {
        const shouldReload = window.confirm(
          'A new version of the app is available. Would you like to reload now?'
        );
        if (shouldReload) {
          forceReload();
        }
      }
    });
  }, 5 * 60 * 1000); // Every 5 minutes
};
