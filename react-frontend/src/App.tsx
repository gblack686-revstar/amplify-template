import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import GatekeepingPage from './components/GatekeepingPage';
import LoadingSpinner from './components/LoadingSpinner';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { Session } from './types';
import mockUserMappingService, { UserInfo } from './services/mockUserMapping';
import ProfileService from './services/profileService';
import AdminService from './services/adminService';
import ChatHistoryService from './services/chatHistoryService';
import { startUpdateChecker } from './utils/cacheControl';

// Lazy load heavy components to reduce initial bundle size (40% reduction target)
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const Roadmap = lazy(() => import('./components/Roadmap'));
const DocumentUpload = lazy(() => import('./components/DocumentUpload'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

const AppContent: React.FC = () => {
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [activeView, setActiveView] = useState<'chat' | 'roadmap' | 'documents' | 'admin'>('chat');
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const { isDarkMode, toggleTheme} = useTheme();

  // Check if user has already entered the access code
  useEffect(() => {
    const accessGranted = localStorage.getItem('access_granted');
    if (accessGranted === 'true') {
      setHasAccess(true);
    }

    // Start update checker to detect new deployments
    startUpdateChecker();
  }, []);

  // Load sessions from ChatHistoryService on component mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const loadedSessions = await ChatHistoryService.getSessions();
        setSessions(loadedSessions);

        // Set current session to the most recent one
        if (loadedSessions.length > 0) {
          setCurrentSession(loadedSessions[0]);
        }
      } catch (error) {
        console.error('Error loading sessions:', error);
      }
    };

    // Only load sessions if user is authenticated
    const token = localStorage.getItem('auth_token');
    if (token) {
      loadSessions();
    }
  }, []);

  // Check for existing authentication on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        setIsAuthenticated(true);

        // Get user information
        const info = mockUserMappingService.getCurrentUserInfo();
        if (info) {
          setUserInfo(info);
        }

        // Check if user is admin
        const adminStatus = AdminService.isAdmin();
        setIsAdmin(adminStatus);

        // Admins bypass onboarding and go straight to admin dashboard
        if (adminStatus) {
          setNeedsOnboarding(false);
          setActiveView('admin');
        } else {
          // Check if user needs onboarding from backend
          // First check localStorage for cached status
          const cachedOnboardingStatus = localStorage.getItem('onboarding_completed');
          if (cachedOnboardingStatus === 'true') {
            // User has completed onboarding before, don't re-check
            setNeedsOnboarding(false);
          } else {
            // Only check backend if not cached
            const hasCompletedOnboarding = await ProfileService.hasCompletedOnboarding();
            setNeedsOnboarding(!hasCompletedOnboarding);
          }
        }
      }
    };

    checkAuth();
  }, []);

  // NOTE: Individual sessions are saved in updateSession()
  // We don't need to save all sessions on every change
  // This was causing all sessions to get the same updatedAt timestamp

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const createNewSession = async (): Promise<void> => {
    try {
      const newSession = await ChatHistoryService.createSession(`New Chat ${sessions.length + 1}`);
      setSessions([newSession, ...sessions]);
      setCurrentSession(newSession);
    } catch (error) {
      console.error('Error creating new session:', error);
    }
  };

  const updateSession = async (sessionId: string, updates: Partial<Session>): Promise<void> => {
    // Update React state using functional update to avoid race conditions
    setSessions(prevSessions =>
      prevSessions.map(session =>
        session.id === sessionId
          ? {
              ...session,
              ...updates,
              updatedAt: new Date().toISOString()
            }
          : session
      )
    );

    // Update current session if it's the one being modified
    setCurrentSession(prevSession =>
      prevSession?.id === sessionId
        ? {
            ...prevSession,
            ...updates,
            updatedAt: new Date().toISOString()
          }
        : prevSession
    );

    // Immediately save to backend using ONLY the updates provided
    try {
      // Always use partial update to avoid race conditions with stale state
      const partialUpdates: Partial<Pick<Session, 'title' | 'messages'>> = {};
      if (updates.title !== undefined) partialUpdates.title = updates.title;
      if (updates.messages !== undefined) partialUpdates.messages = updates.messages;

      // Only call updateSessionFields if we actually have fields to update
      if (Object.keys(partialUpdates).length > 0) {
        await ChatHistoryService.updateSessionFields(sessionId, partialUpdates);
      }
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  const deleteSession = (sessionId: string): void => {
    setSessions(prevSessions => prevSessions.filter(session => session.id !== sessionId));

    if (currentSession?.id === sessionId) {
      const remainingSessions = sessions.filter(session => session.id !== sessionId);
      setCurrentSession(remainingSessions.length > 0 ? remainingSessions[0] : null);
    }
  };

  const handleSessionSelect = (session: Session): void => {
    setCurrentSession(session);
    setActiveView('chat'); // Always switch to chat view when selecting a session
  };

  const handleLogin = async (token: string) => {
    setIsAuthenticated(true);

    // Small delay to ensure localStorage is updated
    setTimeout(async () => {
      // Get user information after login
      const info = mockUserMappingService.getCurrentUserInfo();

      if (info) {
        setUserInfo(info);
      }

      // Check if user is admin
      const adminStatus = AdminService.isAdmin();
      setIsAdmin(adminStatus);

      // Load chat sessions after login
      try {
        const loadedSessions = await ChatHistoryService.getSessions();
        setSessions(loadedSessions);
        if (loadedSessions.length > 0) {
          setCurrentSession(loadedSessions[0]);
        }
      } catch (error) {
        console.error('Error loading sessions after login:', error);
      }

      // Admins bypass onboarding and go straight to admin dashboard
      if (adminStatus) {
        setNeedsOnboarding(false);
        setActiveView('admin');
      } else {
        // Check if user needs onboarding from backend
        const hasCompletedOnboarding = await ProfileService.hasCompletedOnboarding();
        setNeedsOnboarding(!hasCompletedOnboarding);
      }
    }, 100); // 100ms delay to ensure localStorage is updated
  };

  const handleOnboardingComplete = () => {
    setNeedsOnboarding(false);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setSessions([]);
    setCurrentSession(null);
    setUserInfo(null);
    ChatHistoryService.clearLocalSessions();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('upload_prompt_dismissed');
  };

  // Show gatekeeping page first if user hasn't entered access code
  if (!hasAccess) {
    return <GatekeepingPage onAccessGranted={() => setHasAccess(true)} />;
  }

  // Show authentication screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className={`flex h-screen font-sans transition-colors duration-500 ${
        isDarkMode
          ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100'
          : 'bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900'
      }`}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Auth
              onLogin={handleLogin}
              onLogout={handleLogout}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </div>
    );
  }

  // Show onboarding if authenticated but hasn't completed onboarding
  if (needsOnboarding) {
    return (
      <>
        <Suspense fallback={<LoadingSpinner message="Loading onboarding..." />}>
          <Onboarding onComplete={handleOnboardingComplete} />
        </Suspense>

        {/* User Menu - Top Right (also visible during onboarding) */}
        <div className="fixed top-6 right-6 z-50 user-menu-container">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl backdrop-blur-xl ${
              isDarkMode
                ? 'bg-slate-800/80 text-gray-100 hover:bg-slate-700/90 border border-slate-700/50'
                : 'bg-white/80 text-gray-900 hover:bg-white/90 border border-slate-200/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isDarkMode ? 'bg-blue-600' : 'bg-blue-500'
              }`}>
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-left hidden md:block">
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Logged in as
                </div>
                <div className="text-sm font-medium">
                  {userInfo?.displayName || 'User'}
                </div>
              </div>
            </div>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {/* User Dropdown Menu */}
          {showUserMenu && (
            <div className={`absolute right-0 mt-2 w-64 rounded-lg shadow-xl backdrop-blur-xl border ${
              isDarkMode
                ? 'bg-slate-800/95 border-slate-700'
                : 'bg-white/95 border-slate-200'
            }`}>
              <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="text-sm font-medium">
                  {userInfo?.displayName || 'User'}
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {userInfo?.role || 'User'} account
                </div>
              </div>
              <div className="py-2">
                <button
                  data-testid="logout-button"
                  onClick={() => {
                    setShowUserMenu(false);
                    handleLogout();
                  }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors ${
                    isDarkMode
                      ? 'hover:bg-red-900/20 text-red-400'
                      : 'hover:bg-red-50 text-red-600'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                  </svg>
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>

      </>
    );
  }

  return (
    <div className={`flex h-screen font-sans transition-colors duration-500 ${
      isDarkMode
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100'
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900'
    }`}>
      {/* Sidebar - Hidden for admin users */}
      {!isAdmin && (
        <Sidebar
          sessions={sessions}
          currentSession={currentSession}
          onSessionSelect={handleSessionSelect}
          onCreateSession={createNewSession}
          onDeleteSession={deleteSession}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          userInfo={userInfo}
          activeView={activeView}
          onViewChange={setActiveView}
          isAdmin={isAdmin}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        <Suspense fallback={<LoadingSpinner message="Loading..." />}>
        {activeView === 'admin' && isAdmin ? (
          <AdminDashboard onClose={() => setActiveView('chat')} />
        ) : activeView === 'roadmap' ? (
          <Roadmap
            onClose={() => setActiveView('chat')}
            onOpenChat={() => setActiveView('chat')}
          />
        ) : activeView === 'documents' ? (
          <DocumentUpload
            onClose={() => setActiveView('chat')}
            onUploadComplete={(doc) => {
              console.log('Document uploaded:', doc);
              // You could show a success toast notification here
            }}
          />
        ) : (
          <ChatInterface
            session={currentSession}
            onUpdateSession={updateSession}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
        )}
      </Suspense>
      </div>

    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <AppContent />
      </ProfileProvider>
    </ThemeProvider>
  );
};

export default App; 