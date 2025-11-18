import React, { useState, useEffect } from 'react';
import {
  Users,
  FileText,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Baby,
  BarChart3,
  Clock,
  Activity,
  CheckCircle,
  Target,
  Trash2,
  Shield,
  ShieldOff,
  Info,
  Sparkles,
  LogOut,
  Download
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import AdminService, { AdminAnalytics, ActivityLogEntry } from '../services/adminService';

interface AdminDashboardProps {
  onClose?: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const { isDarkMode } = useTheme();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // User deletion states
  const [deleteEmail, setDeleteEmail] = useState<string>('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<string>('');
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // Filter states
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [descriptionFilter, setDescriptionFilter] = useState<string>('');
  const [activityTypeSearch, setActivityTypeSearch] = useState<string>('');
  const [userSearch, setUserSearch] = useState<string>('');
  const [timeFilter, setTimeFilter] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{userId: string, email: string, name?: string}>>([]);

  const fetchAnalytics = async (timeFilterHours?: number | null) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch analytics with time filter if specified
      const url = timeFilterHours
        ? `${process.env.REACT_APP_API_URL}/admin/analytics?timeFilter=${timeFilterHours}`
        : `${process.env.REACT_APP_API_URL}/admin/analytics`;

      const token = localStorage.getItem('auth_token');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const data = await response.json();
      setAnalytics(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLog = async () => {
    setActivityLoading(true);
    try {
      // Fetch all activity logs (filtering happens on frontend)
      const log = await AdminService.getActivityLog(50);
      setActivityLog(log);
    } catch (err: any) {
      console.error('Failed to load activity log:', err);
      // Don't show error for activity log, just use empty array
      setActivityLog([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const users = await AdminService.getUsers();
      setAllUsers(users);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      // Don't show error, will fallback to users from activity log
      setAllUsers([]);
    }
  };

  const exportActivityLogsToCSV = async () => {
    setExportingCSV(true);
    try {
      // Call backend API directly (no mock fallback)
      const token = localStorage.getItem('auth_token');
      const apiUrl = process.env.REACT_APP_API_URL;

      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      const response = await fetch(`${apiUrl}/admin/activity-log?limit=10000`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Unauthorized: Admin access required');
        }
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const allLogs: ActivityLogEntry[] = await response.json();

      if (!allLogs || allLogs.length === 0) {
        alert('No activity logs found. The database may be empty.');
        return;
      }

      // CSV Headers
      const headers = ['Timestamp', 'Activity Type', 'User Email', 'User Name', 'Description', 'Metadata'];

      // Optimized CSV field escaping
      const escape = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };

      // Build CSV efficiently with minimal processing
      const csvRows = [
        headers.join(','),
        ...allLogs.map(log =>
          [
            escape(log.timestamp),
            escape(log.activityType),
            escape(log.userEmail),
            escape(log.userName || ''),
            escape(log.description),
            escape(log.metadata ? JSON.stringify(log.metadata) : '')
          ].join(',')
        )
      ];

      // Create and download
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `activity-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;

      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`Exported ${allLogs.length} activity logs to ${filename}`);
    } catch (err: any) {
      console.error('CSV Export Error:', err);

      // Show detailed error message
      let errorMsg = 'Failed to export activity logs:\n\n';
      if (err.message?.includes('Unauthorized')) {
        errorMsg += 'You do not have admin permissions.';
      } else if (err.message?.includes('API URL not configured')) {
        errorMsg += 'API URL is not configured. Check your environment variables.';
      } else if (err.message?.includes('API error')) {
        errorMsg += `${err.message}\n\nThe backend API may be down or unreachable.`;
      } else if (err.message?.includes('Failed to fetch')) {
        errorMsg += 'Network error: Could not reach the API server.\n\nCheck your internet connection and API endpoint.';
      } else {
        errorMsg += err.message || 'Unknown error occurred.';
      }

      alert(errorMsg);
    } finally {
      setExportingCSV(false);
    }
  };

  const handleLogout = () => {
    // Clear all authentication data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_display_name');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('upload_prompt_dismissed');

    // Reload the page to reset the app state
    window.location.reload();
  };

  useEffect(() => {
    fetchAnalytics();
    fetchActivityLog();
    fetchAllUsers();
  }, []);

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const formatted = date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return `${formatted} PST`;
  };

  const handleDeleteUser = async () => {
    if (!deleteEmail) {
      setDeleteError('Please enter an email address');
      return;
    }

    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }

    setDeletingUser(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      await AdminService.deleteUser(deleteEmail);
      setDeleteSuccess(`User ${deleteEmail} has been deleted successfully`);
      setDeleteEmail('');
      setDeleteConfirmation('');

      // Refresh analytics and activity log
      fetchAnalytics();
      fetchActivityLog();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  };

  // Apply search-based filters if search box has text and no dropdown selection
  const effectiveActivityTypeFilter = activityTypeFilter || (activityTypeSearch ? activityTypeSearch : '');
  const effectiveUserFilter = userFilter || (userSearch ? userSearch : '');

  // Get filtered and sorted activity log
  const filteredActivityLog = activityLog
    .filter(entry => {
      // Support partial matching for activity type and user email filters
      const activityTypeMatch = !effectiveActivityTypeFilter ||
        entry.activityType.toLowerCase().includes(effectiveActivityTypeFilter.toLowerCase());
      const userMatch = !effectiveUserFilter ||
        entry.userEmail.toLowerCase().includes(effectiveUserFilter.toLowerCase());
      const descriptionMatch = !descriptionFilter ||
        entry.description.toLowerCase().includes(descriptionFilter.toLowerCase());

      // Apply time filter
      let timeMatch = true;
      if (timeFilter !== null) {
        const entryTime = new Date(entry.timestamp).getTime();
        const now = Date.now();
        const filterMs = timeFilter * 60 * 60 * 1000; // Convert hours to milliseconds
        timeMatch = (now - entryTime) <= filterMs;
      }

      return activityTypeMatch && userMatch && descriptionMatch && timeMatch;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Get unique values for filters
  const uniqueActivityTypes = Array.from(new Set(activityLog.map(entry => entry.activityType)));
  const uniqueUsersFromLog = Array.from(new Set(activityLog.map(entry => entry.userEmail)));

  // Use all users from the system if available, otherwise fallback to users from activity log
  const userOptions = allUsers.length > 0
    ? allUsers.map(u => u.email)
    : uniqueUsersFromLog;

  // Filter options based on search - if searching and nothing selected, use search as filter
  const filteredActivityTypes = uniqueActivityTypes.filter(type =>
    type.toLowerCase().includes(activityTypeSearch.toLowerCase())
  );
  const filteredUsers = userOptions.filter(email =>
    email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const getActivityIcon = (activityType: ActivityLogEntry['activityType']) => {
    switch (activityType) {
      case 'user_signup':
        return <Users className="w-4 h-4" />;
      case 'onboarding_complete':
        return <CheckCircle className="w-4 h-4" />;
      case 'document_upload':
        return <FileText className="w-4 h-4" />;
      case 'chat_session_start':
        return <MessageSquare className="w-4 h-4" />;
      case 'recommendation_approved':
      case 'goal_added':
        return <ThumbsUp className="w-4 h-4" />;
      case 'recommendation_dismissed':
        return <ThumbsDown className="w-4 h-4" />;
      case 'goal_completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'goal_generated':
        return <Target className="w-4 h-4" />;
      case 'goal_removed':
        return <Trash2 className="w-4 h-4" />;
      case 'feedback_positive':
        return <ThumbsUp className="w-4 h-4" />;
      case 'feedback_negative':
        return <ThumbsDown className="w-4 h-4" />;
      case 'mfa_enabled':
        return <Shield className="w-4 h-4" />;
      case 'mfa_disabled':
        return <ShieldOff className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityColor = (activityType: ActivityLogEntry['activityType']) => {
    switch (activityType) {
      case 'user_signup':
      case 'onboarding_complete':
        return isDarkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-600 bg-blue-100';
      case 'document_upload':
        return isDarkMode ? 'text-green-400 bg-green-900/30' : 'text-green-600 bg-green-100';
      case 'chat_session_start':
        return isDarkMode ? 'text-purple-400 bg-purple-900/30' : 'text-purple-600 bg-purple-100';
      case 'recommendation_approved':
      case 'goal_added':
      case 'goal_completed':
      case 'goal_generated':
      case 'feedback_positive':
        return isDarkMode ? 'text-green-400 bg-green-900/30' : 'text-green-600 bg-green-100';
      case 'recommendation_dismissed':
      case 'goal_removed':
      case 'feedback_negative':
        return isDarkMode ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-100';
      case 'mfa_enabled':
        return isDarkMode ? 'text-emerald-400 bg-emerald-900/30' : 'text-emerald-600 bg-emerald-100';
      case 'mfa_disabled':
        return isDarkMode ? 'text-orange-400 bg-orange-900/30' : 'text-orange-600 bg-orange-100';
      default:
        return isDarkMode ? 'text-gray-400 bg-gray-700' : 'text-gray-600 bg-gray-200';
    }
  };

  if (loading && !analytics) {
    return (
      <div className={`h-full flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className={`h-full flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex-1 flex items-center justify-center">
          <div className={`p-6 rounded-lg border ${
            isDarkMode ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-200'
          }`}>
            <AlertCircle className={`w-12 h-12 mx-auto mb-4 ${
              isDarkMode ? 'text-red-400' : 'text-red-600'
            }`} />
            <p className={`text-center ${isDarkMode ? 'text-red-300' : 'text-red-800'}`}>
              {error}
            </p>
            <button
              onClick={() => fetchAnalytics()}
              className={`mt-4 w-full px-4 py-2 rounded-lg transition-colors ${
                isDarkMode
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const feedbackMeetsTarget = analytics.feedback.positive_percentage > 50;

  return (
    <div className={`h-full flex flex-col overflow-x-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b p-6 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Admin Dashboard
              </h1>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Platform analytics and metrics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                isDarkMode
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
            <button
              onClick={() => {
                fetchAnalytics(timeFilter);
                fetchActivityLog();
              }}
              disabled={loading}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                isDarkMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
        {lastUpdated && (
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Last updated: {formatLastUpdated()} (Pacific Time)
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 max-w-full">
        {/* Filter Bar */}
        <div className={`mb-6 p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
              <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Time Period:</span>
            </div>
            <select
              value={timeFilter === null ? 'all' : timeFilter.toString()}
              onChange={(e) => {
                const value = e.target.value === 'all' ? null : parseInt(e.target.value);
                setTimeFilter(value);
                fetchAnalytics(value);
              }}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600'
                  : 'bg-gray-50 border-gray-300 text-gray-900 hover:border-gray-400'
              }`}
            >
              <option value="all">All Time</option>
              <option value="1">Last Hour</option>
              <option value="24">Last 24 Hours</option>
              <option value="168">Last 7 Days</option>
              <option value="720">Last 30 Days</option>
              <option value="2160">Last 90 Days</option>
            </select>
          </div>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {/* Total Families */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                  <Users className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Families</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Total number of registered families on the platform. Calculated by counting unique user accounts in Cognito user pool.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{analytics.families.total}</p>
                </div>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{analytics.families.with_documents} with documents</p>
            </div>
          </div>

          {/* Documents Uploaded */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
                  <FileText className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>User Documents</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Total documents uploaded by families (IEPs, evaluations, etc.). Stored in S3 and tracked in DynamoDB. Helps measure family engagement.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{analytics.documents.total}</p>
                </div>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Avg {analytics.documents.average_per_family.toFixed(1)} per family</p>
            </div>
          </div>

          {/* Positive Feedback Ratio */}
          <div className={`p-4 rounded-xl border-2 group relative ${
            feedbackMeetsTarget
              ? isDarkMode ? 'bg-green-900/20 border-green-600' : 'bg-green-50 border-green-400'
              : isDarkMode ? 'bg-red-900/20 border-red-600' : 'bg-red-50 border-red-400'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${
                  feedbackMeetsTarget
                    ? isDarkMode ? 'bg-green-900/50' : 'bg-green-100'
                    : isDarkMode ? 'bg-red-900/50' : 'bg-red-100'
                }`}>
                  {feedbackMeetsTarget ? (
                    <ThumbsUp className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                  ) : (
                    <ThumbsDown className={`w-5 h-5 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
                  )}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${
                      feedbackMeetsTarget
                        ? isDarkMode ? 'text-green-300' : 'text-green-700'
                        : isDarkMode ? 'text-red-300' : 'text-red-700'
                    }`}>Positive Feedback Ratio</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Percentage of positive feedback (thumbs up) vs negative (thumbs down). Calculated from chat response feedback. Target: &gt;50% positive. Shows content quality and helpfulness.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${
                    feedbackMeetsTarget
                      ? isDarkMode ? 'text-green-100' : 'text-green-900'
                      : isDarkMode ? 'text-red-100' : 'text-red-900'
                  }`}>{analytics.feedback.positive_percentage.toFixed(1)}%</p>
                </div>
              </div>
              {feedbackMeetsTarget && (
                <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  isDarkMode ? 'bg-green-600 text-white' : 'bg-green-500 text-white'
                }`}>TARGET MET</div>
              )}
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
              <div
                className={`h-full ${feedbackMeetsTarget ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${analytics.feedback.positive_percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                +{analytics.feedback.positive_count}
              </span>
              <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                -{analytics.feedback.negative_count}
              </span>
            </div>
          </div>

          {/* Time to First Win */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-yellow-900/30' : 'bg-yellow-50'}`}>
                  <Clock className={`w-5 h-5 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Time to First Win</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Average days from signup to first positive feedback. Calculated as time between account creation and first thumbs-up on chat response. Lower is better.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {analytics.time_to_first_win?.average_days !== undefined && analytics.time_to_first_win?.average_days !== null && analytics.time_to_first_win?.sample_size > 0
                      ? analytics.time_to_first_win.average_hours < 1
                        ? `${Math.round(analytics.time_to_first_win.average_hours * 60)}m`
                        : analytics.time_to_first_win.average_hours < 24
                        ? `${Math.round(analytics.time_to_first_win.average_hours * 10) / 10}h`
                        : `${analytics.time_to_first_win.average_days}d`
                      : 'N/A'}
                  </p>
                </div>
              </div>
              {analytics.time_to_first_win?.sample_size && analytics.time_to_first_win.sample_size > 0 && (
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  {analytics.time_to_first_win.sample_size} user{analytics.time_to_first_win.sample_size !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Engagement Retention */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}>
                  <Activity className={`w-5 h-5 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Engagement Retention</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Percentage of users who return for multiple sessions. Calculated by counting users with 2+ chat sessions divided by total active users. Higher retention indicates product stickiness.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {analytics.engagement_retention?.retention_rate ?? 0}%
                  </p>
                </div>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                {analytics.engagement_retention?.returning_users ?? 0} of {analytics.engagement_retention?.total_active_users ?? 0}
              </p>
            </div>
          </div>

          {/* Conversations */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-purple-900/30' : 'bg-purple-50'}`}>
                  <MessageSquare className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Conversations</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Total number of chat queries submitted by families. Tracked from Knowledge Base query logs. Each query represents a family seeking guidance or support.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {analytics.conversations?.total_queries ?? 0}
                  </p>
                </div>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                {analytics.conversations?.unique_sessions ?? 0} sessions
              </p>
            </div>
          </div>

          {/* Weekly Active Families */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
                  <TrendingUp className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Weekly Active Families</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Percentage of families active in the last 7 days. Calculated from activity log entries (queries, uploads, feedback). Shows current engagement health.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {analytics.weekly_active_families?.active_percentage ?? 0}%
                  </p>
                </div>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                {analytics.weekly_active_families?.active_families_last_7_days ?? 0} of {analytics.weekly_active_families?.total_families ?? 0}
              </p>
            </div>
          </div>

          {/* Recommendations Generated */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-orange-900/30' : 'bg-orange-50'}`}>
                  <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Avg Recommendations per User</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Average number of roadmap recommendations created per user (from chat, manually added, or AI-generated). Indicates engagement depth with the roadmap feature.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {analytics.roadmap?.avg_recommendations_per_user?.toFixed(1) ?? '0.0'}
                  </p>
                </div>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                {analytics.roadmap?.total_items_created ?? 0} total
              </p>
            </div>
          </div>

          {/* Roadmap Items Completed */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} group relative`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-teal-900/30' : 'bg-teal-50'}`}>
                  <CheckCircle className={`w-5 h-5 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Roadmap Items Completed</p>
                    <div className="relative">
                      <Info className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} cursor-help`} />
                      <div className={`absolute left-0 bottom-full mb-2 w-64 p-2 rounded-lg shadow-lg text-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${
                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-900 text-white'
                      }`}>
                        Number of roadmap items marked as completed by families. Completion rate: {analytics.roadmap?.completion_rate ?? 0}%. Higher completion rates indicate engaged families actively working on their goals.
                      </div>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {analytics.roadmap?.total_items_completed ?? 0}
                  </p>
                </div>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                {analytics.roadmap?.completion_rate ?? 0}% rate
              </p>
            </div>
          </div>
        </div>

        {/* Activity Log Section */}
        <div className={`mb-6 rounded-xl border ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className={`px-6 py-4 border-b flex items-center justify-between ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${
                isDarkMode ? 'bg-purple-900/30' : 'bg-purple-50'
              }`}>
                <Clock className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Activity Log
                </h2>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Recent platform activity across all users (use filters below to narrow)
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={exportActivityLogsToCSV}
                disabled={exportingCSV}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  exportingCSV
                    ? 'opacity-50 cursor-not-allowed'
                    : isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {exportingCSV ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </>
                )}
              </button>
              {activityLoading && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className={`px-6 py-4 border-b grid grid-cols-1 md:grid-cols-3 gap-4 ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            {/* Activity Type Filter */}
            <div>
              <label className={`block text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Activity Type
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search activity types..."
                  value={activityTypeSearch}
                  onChange={(e) => setActivityTypeSearch(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
                <select
                  value={activityTypeFilter}
                  onChange={(e) => setActivityTypeFilter(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-200'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="">All Types</option>
                  {filteredActivityTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* User Filter */}
            <div>
              <label className={`block text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                User Email
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-200'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="">All Users</option>
                  {filteredUsers.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description Filter */}
            <div>
              <label className={`block text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Description
              </label>
              <input
                type="text"
                placeholder="Search descriptions..."
                value={descriptionFilter}
                onChange={(e) => setDescriptionFilter(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm mt-[calc(2rem+0.5rem)] ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'}`}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Activity Type
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    User Email
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Description
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Timestamp (PST)
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {filteredActivityLog.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center">
                      <Activity className={`w-12 h-12 mx-auto mb-2 ${
                        isDarkMode ? 'text-gray-600' : 'text-gray-300'
                      }`} />
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {activityLoading ? 'Loading activity...' : 'No activity matches your filters'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredActivityLog.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`transition-colors ${
                        isDarkMode ? 'hover:bg-gray-700/30' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center space-x-2 px-2 py-1 rounded-full ${
                          getActivityColor(entry.activityType)
                        }`}>
                          {getActivityIcon(entry.activityType)}
                          <span className="text-xs font-medium capitalize">
                            {entry.activityType.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          isDarkMode ? 'text-gray-200' : 'text-gray-900'
                        }`}>
                          {entry.userEmail}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {entry.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                          {formatTimestamp(entry.timestamp)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Danger Zone: User Deletion */}
        <div className={`rounded-xl border-2 ${
          isDarkMode ? 'bg-red-900/10 border-red-800' : 'bg-red-50 border-red-300'
        }`}>
          <div className={`px-6 py-4 border-b-2 ${
            isDarkMode ? 'border-red-800' : 'border-red-300'
          }`}>
            <div className="flex items-center space-x-3">
              <AlertCircle className={`w-6 h-6 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
              <div>
                <h2 className={`text-lg font-bold ${isDarkMode ? 'text-red-300' : 'text-red-800'}`}>
                  Danger Zone
                </h2>
                <p className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>
                  Delete user and all associated data (GDPR/CCPA compliance)
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {deleteSuccess && (
              <div className={`mb-4 p-4 rounded-lg border ${
                isDarkMode ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-green-100 border-green-400 text-green-800'
              }`}>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>{deleteSuccess}</span>
                </div>
              </div>
            )}

            {deleteError && (
              <div className={`mb-4 p-4 rounded-lg border ${
                isDarkMode ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-red-100 border-red-400 text-red-800'
              }`}>
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>{deleteError}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  User Email to Delete
                </label>
                <input
                  type="email"
                  value={deleteEmail}
                  onChange={(e) => setDeleteEmail(e.target.value)}
                  placeholder="user@example.com"
                  disabled={deletingUser}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  } ${deletingUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Type DELETE to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE"
                  disabled={deletingUser}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  } ${deletingUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>

            <div className={`mb-4 p-4 rounded-lg ${
              isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-300'
            }`}>
              <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                This action will permanently delete:
              </p>
              <ul className={`text-sm space-y-1 ml-4 list-disc ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                <li>User profile and all personal information</li>
                <li>All uploaded documents (IEPs, medical records, etc.) from S3</li>
                <li>All chat sessions and conversation history</li>
                <li>All feedback and activity logs</li>
                <li>All personalized insights and recommendations</li>
                <li>User account from Cognito (cannot be recovered)</li>
              </ul>
            </div>

            <button
              onClick={handleDeleteUser}
              disabled={deletingUser || !deleteEmail || deleteConfirmation !== 'DELETE'}
              className={`w-full px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center space-x-2 ${
                deletingUser || !deleteEmail || deleteConfirmation !== 'DELETE'
                  ? 'bg-gray-400 cursor-not-allowed text-gray-700'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {deletingUser ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Deleting User...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  <span>Delete User and All Data</span>
                </>
              )}
            </button>

            <p className={`text-xs mt-3 text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
              This action cannot be undone. All data will be permanently deleted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
