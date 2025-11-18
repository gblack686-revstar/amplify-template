import React, { useState, useEffect } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Menu,
  X,
  Clock,
  Settings,
  Search,
  User,
  Palette,
  LogOut,
  FileText,
  Upload,
  FolderOpen,
  FileIcon,
  Calendar,
  Target,
  BarChart3,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { SidebarProps } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import MockAuthService from '../services/mockAuth';
import CognitoAuthService from '../services/cognitoAuth';
import FamilyProfile from './FamilyProfile';
import { DocumentMetadata } from '../services/documentService';

const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSession,
  onSessionSelect,
  onCreateSession,
  onDeleteSession,
  isOpen,
  onToggle,
  userInfo,
  activeView = 'chat',
  onViewChange,
  isAdmin = false
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState<boolean>(false);
  const [showFamilyProfile, setShowFamilyProfile] = useState<boolean>(false);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [documentStatuses, setDocumentStatuses] = useState<Map<string, {
    status: 'uploading' | 'processing' | 'ingesting' | 'ready' | 'error';
    message: string;
    progress: number;
  }>>(new Map());
  const [loadingDocs, setLoadingDocs] = useState<boolean>(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const { getChildName } = useProfile();

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const truncateTitle = (title: string, maxLength: number = 30): string => {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  };

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCurrentUsername = () => {
    // Get username from localStorage (set during login)
    const username = localStorage.getItem('username');
    if (username) {
      return username;
    }

    // If not in localStorage, try to get from Cognito current user
    try {
      const cognitoUser = CognitoAuthService.getCurrentUser();
      if (cognitoUser) {
        return cognitoUser.getUsername();
      }
    } catch (error) {
      console.error('Error getting current username:', error);
    }

    // Fallback to empty string instead of test email
    return '';
  };

  // Fetch documents using DocumentService
  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const DocumentService = (await import('../services/documentService')).default;
      const docs = await DocumentService.getDocuments();

      // Ensure docs is an array
      if (!Array.isArray(docs)) {
        console.error('Documents response is not an array:', docs);
        setDocuments([]);
        return;
      }

      setDocuments(docs);

      // Fetch real-time status for each document
      const statusMap = new Map();

      // Use Promise.allSettled to handle individual failures gracefully
      const statusResults = await Promise.allSettled(
        docs.map(async (doc) => {
          try {
            const statusInfo = await DocumentService.getDocumentStatus(doc.documentId);
            return {
              documentId: doc.documentId,
              status: statusInfo.currentStatus,
              message: statusInfo.statusMessage,
              progress: statusInfo.progress
            };
          } catch (error) {
            console.error(`Error fetching status for document ${doc.documentId}:`, error);
            // Return a default status if API call fails
            return {
              documentId: doc.documentId,
              status: 'ready' as const,
              message: 'Document processed',
              progress: 100
            };
          }
        })
      );

      // Process results and set status map
      statusResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { documentId, status, message, progress } = result.value;
          statusMap.set(documentId, { status, message, progress });
        }
      });

      setDocumentStatuses(statusMap);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  // Delete document handler
  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const DocumentService = (await import('../services/documentService')).default;
      await DocumentService.deleteDocument(documentId);

      // Refresh document list
      await fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document. Please try again.');
    }
  };

  // Helper function to get status display info
  const getStatusDisplay = (documentId: string) => {
    const statusInfo = documentStatuses.get(documentId);
    if (!statusInfo) {
      return {
        text: 'Loading...',
        color: isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600',
        icon: <Loader2 className="w-3 h-3 animate-spin" />
      };
    }

    const statusConfig = {
      uploading: {
        text: 'Uploading',
        color: isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700',
        icon: <Loader2 className="w-3 h-3 animate-spin" />
      },
      processing: {
        text: 'Processing',
        color: isDarkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-700',
        icon: <Loader2 className="w-3 h-3 animate-spin" />
      },
      ingesting: {
        text: 'Adding to KB',
        color: isDarkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-700',
        icon: <Loader2 className="w-3 h-3 animate-spin" />
      },
      ready: {
        text: 'Ready',
        color: isDarkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700',
        icon: null
      },
      error: {
        text: 'Error',
        color: isDarkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700',
        icon: null
      }
    };

    return statusConfig[statusInfo.status] || statusConfig.ready;
  };

  // Fetch documents when Knowledge Base is opened
  useEffect(() => {
    if (showKnowledgeBase) {
      fetchDocuments();
    }
  }, [showKnowledgeBase]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-35 lg:hidden backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettings(false);
            }
          }}
          className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4"
        >
          <div className={`w-full max-w-md rounded-2xl shadow-2xl transition-all duration-300 ${
            isDarkMode
              ? 'bg-gray-800 border border-gray-700'
              : 'bg-white border border-gray-200'
          }`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between p-6 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold transition-colors duration-300 ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}>
                Navigator Settings
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  isDarkMode
                    ? 'hover:bg-gray-700 text-gray-300'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* User Profile */}
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className={`font-medium transition-colors duration-300 ${
                      isDarkMode ? 'text-gray-100' : 'text-gray-900'
                    }`}>
                      {getChildName() ? `${getChildName()}'s Family` : 'Family Profile'}
                    </p>
                    <p className={`text-sm transition-colors duration-300 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {getCurrentUsername()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Settings Options */}
              <div className="space-y-4">
                {/* Family Profile */}
                <button
                  onClick={() => {
                    setShowSettings(false);
                    setShowFamilyProfile(true);
                  }}
                  className={`w-full p-4 rounded-xl border transition-all duration-300 hover:scale-105 ${
                    isDarkMode
                      ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}>
                  <div className="flex items-center space-x-3">
                    <User className={`w-5 h-5 ${
                      isDarkMode ? 'text-blue-400' : 'text-blue-600'
                    }`} />
                    <div className="flex-1 text-left">
                      <p className={`font-medium transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        Family Profile
                      </p>
                      <p className={`text-sm transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        View parent & child info
                      </p>
                    </div>
                  </div>
                </button>

                {/* Knowledge Base */}
                <button
                  onClick={() => {
                    setShowSettings(false);
                    setShowKnowledgeBase(true);
                  }}
                  className={`w-full p-4 rounded-xl border transition-all duration-300 hover:scale-105 ${
                    isDarkMode
                      ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}>
                  <div className="flex items-center space-x-3">
                    <FileText className={`w-5 h-5 ${
                      isDarkMode ? 'text-purple-400' : 'text-purple-600'
                    }`} />
                    <div className="flex-1 text-left">
                      <p className={`font-medium transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        Knowledge Base
                      </p>
                      <p className={`text-sm transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        View & manage your uploaded documents
                      </p>
                    </div>
                  </div>
                </button>

                {/* Theme */}
                <button
                  onClick={toggleTheme}
                  className={`w-full p-4 rounded-xl border transition-all duration-300 hover:scale-105 ${
                    isDarkMode
                      ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Palette className={`w-5 h-5 ${
                      isDarkMode ? 'text-purple-400' : 'text-purple-600'
                    }`} />
                    <div className="flex-1 text-left">
                      <p className={`font-medium transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        Theme
                      </p>
                      <p className={`text-sm transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Logout Button */}
              <div className="px-4 pb-4">
                <button
                  onClick={async () => {
                    try {
                      // Clear all local storage
                      localStorage.clear();
                      sessionStorage.clear();

                      // Sign out from Cognito
                      MockAuthService.signOut();

                      // Reload page to reset state
                      window.location.reload();
                    } catch (error) {
                      console.error('Logout failed:', error);
                    }
                  }}
                  className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                    isDarkMode
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
                      : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                  }`}
                >
                  <LogOut className="w-5 h-5" />
                  <span>Logout</span>
                </button>
              </div>

              {/* Version Info */}
              <div className={`text-center pt-4 border-t ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <p className={`text-xs transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  RevStar Wellness v1.0.0
                </p>
                <p className={`text-xs transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  Powered by AWS Bedrock
                </p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Family Profile Modal */}
      <FamilyProfile isOpen={showFamilyProfile} onClose={() => setShowFamilyProfile(false)} />

      {/* Knowledge Base Modal */}
      {showKnowledgeBase && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowKnowledgeBase(false);
            }
          }}
          className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4"
        >
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl transition-all duration-300 max-h-[80vh] flex flex-col ${
            isDarkMode
              ? 'bg-gray-800 border border-gray-700'
              : 'bg-white border border-gray-200'
          }`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center space-x-3">
                <FolderOpen className={`w-6 h-6 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Knowledge Base
                </h3>
              </div>
              <button
                onClick={() => setShowKnowledgeBase(false)}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Documents List */}
            <div className="p-6 overflow-y-auto flex-1">
              {loadingDocs ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileIcon className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No documents uploaded yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.documentId}
                      className={`p-4 rounded-xl border transition-all duration-300 ${
                        isDarkMode
                          ? 'bg-gray-700/30 border-gray-600 hover:bg-gray-700/50'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-start justify-between space-x-3">
                        <div className="flex items-start space-x-3 flex-1 min-w-0">
                          <FileText className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                            isDarkMode ? 'text-purple-400' : 'text-purple-600'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-medium truncate ${
                              isDarkMode ? 'text-gray-100' : 'text-gray-900'
                            }`}>
                              {doc.originalFilename}
                            </h4>
                            <div className={`flex items-center flex-wrap gap-2 mt-1 text-xs ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              <span className="flex items-center space-x-1">
                                <FileIcon className="w-3 h-3" />
                                <span className="uppercase">{(doc.documentType || 'other').replace('_', ' ')}</span>
                              </span>
                              <span>•</span>
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                              </span>
                              {doc.fileSize && (
                                <>
                                  <span>•</span>
                                  <span>{(doc.fileSize / 1024).toFixed(1)} KB</span>
                                </>
                              )}
                            </div>
                            <div className="mt-2">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                                getStatusDisplay(doc.documentId).color
                              }`}>
                                {getStatusDisplay(doc.documentId).icon}
                                {getStatusDisplay(doc.documentId).text}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteDocument(doc.documentId)}
                          className={`p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                            isDarkMode
                              ? 'hover:bg-red-900/30 hover:text-red-400 text-gray-400'
                              : 'hover:bg-red-100 hover:text-red-600 text-gray-500'
                          }`}
                          title="Delete document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`p-6 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <p className={`text-xs text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                These documents are used to provide personalized guidance and recommendations
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Menu Button - Always visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className={`fixed top-4 left-4 z-50 p-3 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 btn-touch ${
            isDarkMode
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              : 'bg-white hover:bg-gray-100 text-gray-600'
          }`}
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <Menu className="w-6 h-6" />
        </button>
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-40 w-[90vw] sm:w-80 max-w-sm border-r transform transition-all duration-300 ease-in-out shadow-xl lg:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        flex flex-col overflow-x-hidden
        ${isDarkMode
          ? 'bg-gray-900/95 backdrop-blur-md border-gray-700/50'
          : 'bg-white/95 backdrop-blur-md border-gray-200/50'
        }
      `}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b transition-all duration-300 ${
          isDarkMode ? 'border-slate-700/50' : 'border-slate-200/50'
        }`}>
          <div className="flex items-center space-x-3">
            <img
              src="/revstar-logo.jpg"
              alt="RevStar Wellness Navigator"
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <h1 className={`text-lg font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                RevStar Wellness
              </h1>
              <p className={`text-xs font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                Navigator
              </p>
            </div>
          </div>
          {/* Toggle button - visible on all screens */}
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
              isDarkMode
                ? 'hover:bg-slate-700 text-slate-300'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
            title={isOpen ? "Close sidebar" : "Open sidebar"}
          >
            {isOpen ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>


        {/* Search */}
        <div className={`p-4 border-b transition-all duration-300 ${
          isDarkMode ? 'border-gray-700/50' : 'border-gray-200/50'
        }`}>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-400'
            }`} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all duration-200 ${
                isDarkMode
                  ? 'bg-gray-800/80 border-gray-600 text-gray-100 placeholder-gray-400'
                  : 'bg-white/80 border-gray-200 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-4 space-y-3">
          <button
            onClick={() => {
              onViewChange?.('chat');
              onCreateSession();
              // Close sidebar on mobile after navigation
              if (window.innerWidth < 1024) {
                console.log('[SIDEBAR DEBUG] Mobile detected (<1024px), calling onToggle()');
                onToggle();
              }
            }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow-md ${
              activeView === 'chat'
                ? 'bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700'
                : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>

          {/* Roadmap Button */}
          <button
            onClick={() => {
              console.log('[SIDEBAR DEBUG] Roadmap clicked, width:', window.innerWidth);
              onViewChange?.('roadmap');
              // Close sidebar on mobile after navigation
              if (window.innerWidth < 1024) {
                console.log('[SIDEBAR DEBUG] Mobile detected (<1024px), calling onToggle()');
                onToggle();
              }
            }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md ${
              activeView === 'roadmap'
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700'
                : isDarkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
            }`}
          >
            <Target className="w-4 h-4" />
            Roadmap
          </button>

          {/* Documents Button */}
          <button
            onClick={() => {
              onViewChange?.('documents');
              // Close sidebar on mobile after navigation
              if (window.innerWidth < 1024) {
                console.log('[SIDEBAR DEBUG] Mobile detected (<1024px), calling onToggle()');
                onToggle();
              }
            }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md ${
              activeView === 'documents'
                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:from-purple-600 hover:to-pink-700'
                : isDarkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Documents
          </button>

          {/* Admin Dashboard Button - Only visible for admins */}
          {isAdmin && (
            <button
              onClick={() => {
                onViewChange?.('admin');
                // Close sidebar on mobile after navigation
                if (window.innerWidth < 1024) {
                console.log('[SIDEBAR DEBUG] Mobile detected (<1024px), calling onToggle()');
                onToggle();
                }
              }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md ${
                activeView === 'admin'
                  ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-600 hover:to-red-700'
                  : isDarkMode
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Admin Dashboard
            </button>
          )}
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-6 text-center animate-fade-in">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center transition-all duration-300 ${
                isDarkMode
                  ? 'bg-gradient-to-r from-gray-700 to-gray-800'
                  : 'bg-gradient-to-r from-gray-100 to-gray-200'
              }`}>
                <MessageSquare className={`w-8 h-8 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-400'
                }`} />
              </div>
              <p className={`font-medium mb-2 transition-colors duration-300 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-500'
              }`}>
                No conversations yet
              </p>
              <p className={`text-sm transition-colors duration-300 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                Start a new chat to begin
              </p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-6 text-center">
              <p className={`text-sm transition-colors duration-300 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                No conversations match your search
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredSessions.map((session, index) => (
                <div
                  key={session.id}
                  className={`
                    sidebar-item group relative rounded-xl transition-all duration-200 cursor-pointer
                    ${currentSession?.id === session.id
                      ? isDarkMode
                        ? 'bg-gradient-to-r from-slate-700/50 to-slate-800/50 text-slate-300 border border-slate-600/50 shadow-sm'
                        : 'bg-gradient-to-r from-slate-100/50 to-slate-200/50 text-slate-700 border border-slate-300/50 shadow-sm'
                      : isDarkMode
                        ? 'hover:bg-gray-800/50 text-gray-300'
                        : 'hover:bg-gray-50 text-gray-700'
                    }
                  `}
                  onClick={() => onSessionSelect(session)}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center p-3">
                    <MessageSquare className={`w-4 h-4 mr-3 flex-shrink-0 transition-colors duration-300 ${
                      currentSession?.id === session.id
                        ? 'text-slate-400'
                        : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate transition-colors duration-300 ${
                        currentSession?.id === session.id
                          ? isDarkMode ? 'text-slate-300' : 'text-slate-700'
                          : isDarkMode ? 'text-gray-200' : 'text-gray-700'
                      }`}>
                        {truncateTitle(session.title)}
                      </p>
                      <div className={`flex items-center text-sm sm:text-xs mt-1 transition-colors duration-300 ${
                        isDarkMode ? 'text-gray-500' : 'text-gray-500'
                      }`}>
                        <Clock className="w-3 h-3 mr-1" />
                        {formatDate(session.updatedAt)}
                        <span className="mx-2">•</span>
                        <span>{session.messages.length} messages</span>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className={`opacity-0 group-hover:opacity-100 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-all duration-200 ${
                        isDarkMode
                          ? 'hover:bg-red-900/30 hover:text-red-400'
                          : 'hover:bg-red-100 hover:text-red-600'
                      }`}
                      title="Delete conversation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t transition-all duration-300 ${
          isDarkMode ? 'border-gray-700/50' : 'border-gray-200/50'
        }`}>
          <button
            onClick={() => {
              // Toggle settings modal
              setShowSettings(!showSettings);
              // Close sidebar on mobile when opening settings
              if (!showSettings && window.innerWidth < 1024) {
                onToggle();
              }
            }}
            className={`sidebar-item w-full rounded-xl transition-all duration-300 flex items-center p-3 ${
              isDarkMode
                ? 'text-gray-300 hover:bg-gray-800/50'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Settings className="w-4 h-4 mr-3" />
            Settings
          </button>
        </div>
      </div>

      {/* Mobile toggle button */}
      <button
        onClick={onToggle}
        className={`lg:hidden fixed top-4 left-4 z-30 p-3 rounded-xl shadow-lg border transition-all duration-200 hover:scale-105 ${
          isDarkMode
            ? 'bg-gray-800/90 backdrop-blur-sm border-gray-600/50 hover:bg-gray-700'
            : 'bg-white/90 backdrop-blur-sm border-gray-200/50 hover:bg-white'
        }`}
      >
        <Menu className="w-5 h-5" />
      </button>
    </>
  );
};

export default Sidebar;
