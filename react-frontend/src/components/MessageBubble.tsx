import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, User, AlertCircle, Copy, Check, ThumbsUp, ThumbsDown, Table, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { MessageBubbleProps } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { formatMessageContent } from '../utils/formatters';
import FeedbackService from '../services/feedbackService';

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onMoveToRoadmap }) => {
  const isUser = message.role === 'user';
  const isError = message.isError;
  const [copied, setCopied] = useState<boolean>(false);
  const [showDataTable, setShowDataTable] = useState<boolean>(false);
  const [feedbackType, setFeedbackType] = useState<'positive' | 'negative' | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
  const [movedToRoadmap, setMovedToRoadmap] = useState<boolean>(false);
  const { isDarkMode } = useTheme();
  
  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatContent = (content: string): string => {
    // Apply number formatting first
    return formatMessageContent(content);
  };

  // Load existing feedback for this message
  useEffect(() => {
    if (!isUser && !isError) {
      const loadFeedback = async () => {
        try {
          const existingFeedback = await FeedbackService.getFeedback(message.id);
          if (existingFeedback) {
            setFeedbackType(existingFeedback.feedbackType as 'positive' | 'negative');
          }
        } catch (error) {
          // Ignore errors when loading feedback
          console.debug('Could not load existing feedback:', error);
        }
      };
      loadFeedback();
    }
  }, [message.id, isUser, isError]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleFeedback = async (type: 'positive' | 'negative'): Promise<void> => {
    if (isSubmittingFeedback) return;

    setIsSubmittingFeedback(true);
    try {
      // Get session ID from message metadata or localStorage
      const sessionId = localStorage.getItem('current_session_id') || 'default';

      if (type === 'negative') {
        // Negative feedback - just submit and don't show visual state
        if (feedbackType === 'negative') {
          // Already submitted negative, skip
          return;
        } else if (feedbackType === 'positive') {
          // Change from positive to negative
          await FeedbackService.updateFeedback(message.id, type);
          setFeedbackType(null); // Don't show visual state for negative
        } else {
          // New negative feedback
          await FeedbackService.submitFeedback({
            messageId: message.id,
            sessionId,
            feedbackType: type
          });
          // Don't set feedback type - no visual state for negative
        }
      } else {
        // Positive feedback - show persistent green state
        if (feedbackType === 'positive') {
          // Already positive, keep it green (no toggle off)
          return;
        } else if (feedbackType) {
          // Change from negative to positive
          await FeedbackService.updateFeedback(message.id, type);
          setFeedbackType(type);
        } else {
          // New positive feedback
          await FeedbackService.submitFeedback({
            messageId: message.id,
            sessionId,
            feedbackType: type
          });
          setFeedbackType(type);
        }
      }
    } catch (error) {
      console.error('Error handling feedback:', error);
      // Optionally show an error message to the user
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleMoveToRoadmap = (): void => {
    if (onMoveToRoadmap) {
      onMoveToRoadmap(message.content);
      setMovedToRoadmap(true);
      setTimeout(() => setMovedToRoadmap(false), 2000);
    }
  };

  const renderDataTable = (data: any[]): React.ReactNode => {
    if (!data || data.length === 0) return null;

    // Get all unique keys from the data
    const keySet = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => keySet.add(key));
    });
    const allKeys = Array.from(keySet);
    
    return (
      <div className={`mt-4 border rounded-lg overflow-hidden transition-all duration-300 ${
        isDarkMode 
          ? 'border-gray-600 bg-gray-800/50' 
          : 'border-gray-200 bg-gray-50'
      }`}>
        <div className={`flex items-center justify-between p-3 border-b transition-colors duration-300 ${
          isDarkMode 
            ? 'bg-gray-700/50 border-gray-600 text-gray-200' 
            : 'bg-gray-100 border-gray-200 text-gray-700'
        }`}>
          <div className="flex items-center space-x-2">
            <Table className="w-4 h-4" />
            <span className="font-medium text-sm">Query Results ({data.length} rows)</span>
          </div>
          <button
            onClick={() => setShowDataTable(!showDataTable)}
            className={`p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded transition-colors duration-200 ${
              isDarkMode
                ? 'hover:bg-gray-600 text-gray-300'
                : 'hover:bg-gray-200 text-gray-600'
            }`}
          >
            {showDataTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        
        {showDataTable && (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className={`w-full text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              <thead className={`sticky top-0 transition-colors duration-300 ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <tr>
                  {allKeys.map((key, index) => (
                    <th key={index} className={`px-4 py-2 text-left font-medium border-b ${
                      isDarkMode ? 'border-gray-600' : 'border-gray-200'
                    }`}>
                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, rowIndex) => (
                  <tr key={rowIndex} className={`transition-colors duration-200 ${
                    isDarkMode 
                      ? 'hover:bg-gray-700/30 border-gray-700' 
                      : 'hover:bg-gray-50 border-gray-100'
                  }`}>
                    {allKeys.map((key, colIndex) => (
                      <td key={colIndex} className={`px-4 py-2 border-b ${
                        isDarkMode ? 'border-gray-700' : 'border-gray-100'
                      }`}>
                        {typeof row[key] === 'number' ? 
                          (key.toLowerCase().includes('revenue') || key.toLowerCase().includes('cost') ? 
                            `$${row[key].toLocaleString()}` : 
                            row[key].toLocaleString()
                          ) : 
                          (row[key] || '-')
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex items-start space-x-3 max-w-3xl ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-all duration-300 ${
          isUser 
            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' 
            : isError 
              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
              : isDarkMode
                ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-gray-200'
                : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-600'
        }`}>
          {isUser ? (
            <User className="w-4 h-4" />
          ) : isError ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
        </div>

        {/* Message Content */}
        <div className={`relative ${isUser ? 'max-w-[85%]' : 'max-w-[85%]'}`}>
          <div className={`chat-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'} relative group transition-all duration-300 ${
            isDarkMode && !isUser
              ? 'bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 text-gray-100'
              : ''
          }`}>
            <div className={`prose prose-sm max-w-none ${
              isDarkMode && !isUser ? 'prose-invert' : ''
            }`}>
              <ReactMarkdown
                components={{
                  // Style code blocks
                  code: ({node, className, ...props}) => {
                    const isInline = !className?.includes('language-');
                    return (
                      <code
                        className={`${isInline ? 'px-1.5 py-0.5' : 'block px-3 py-2 my-2'} rounded text-sm font-mono ${
                          isDarkMode ? 'bg-gray-700/50 text-gray-200' : 'bg-gray-100 text-gray-800'
                        } ${className || ''}`}
                        {...props}
                      />
                    );
                  },
                  // Style paragraphs with MORE spacing
                  p: ({node, ...props}) => (
                    <p className="my-4 leading-relaxed" {...props} />
                  ),
                  // Style links
                  a: ({node, ...props}) => (
                    <a
                      className="text-blue-500 hover:text-blue-600 underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    />
                  ),
                  // Style lists with MORE spacing
                  ul: ({node, ...props}) => (
                    <ul className="list-disc list-inside my-4 space-y-3" {...props} />
                  ),
                  ol: ({node, ...props}) => (
                    <ol className="list-decimal list-inside my-4 space-y-3" {...props} />
                  ),
                  // Style list items
                  li: ({node, ...props}) => (
                    <li className="my-2 leading-relaxed" {...props} />
                  ),
                }}
              >
                {formatContent(message.content)}
              </ReactMarkdown>
            </div>
            
            {/* Data Table - only show for assistant messages with raw_data */}
            {!isUser && message.metadata?.raw_data && (
              renderDataTable(message.metadata.raw_data)
            )}
            
            {/* SQL Query Display */}
            {!isUser && message.metadata?.sql_query && (
              <div className={`mt-3 p-3 rounded-lg border transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-gray-800/30 border-gray-600 text-gray-300' 
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}>
                <div className="text-xs font-medium mb-1">Generated SQL:</div>
                <code className="text-xs break-all">{message.metadata.sql_query}</code>
              </div>
            )}
            
            {/* Timestamp and action buttons for assistant messages */}
            <div className={`flex items-center justify-between mt-3 pt-3 border-t transition-colors duration-300 ${
              isUser
                ? 'border-blue-400/30'
                : isDarkMode
                  ? 'border-gray-700'
                  : 'border-gray-200'
            }`}>
              <div className={`text-xs transition-colors duration-300 ${
                isUser
                  ? 'text-blue-100'
                  : isDarkMode
                    ? 'text-gray-400'
                    : 'text-gray-500'
              }`}>
                {formatTime(message.timestamp)}
              </div>

              {/* Action buttons for assistant messages - now always visible at bottom */}
              {!isUser && (
                <div className="flex items-center space-x-1">
                  <button
                    onClick={handleCopy}
                    className={`p-1.5 rounded transition-colors duration-200 ${
                      isDarkMode
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                    title="Copy message"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleFeedback('positive')}
                    disabled={isSubmittingFeedback}
                    className={`p-1.5 rounded transition-colors duration-200 ${
                      feedbackType === 'positive'
                        ? isDarkMode
                          ? 'text-green-400 bg-green-900/50'
                          : 'text-green-600 bg-green-100'
                        : isDarkMode
                          ? 'text-gray-400 hover:text-green-400 hover:bg-green-900/30'
                          : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={feedbackType === 'positive' ? 'Remove positive feedback' : 'Good response'}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleFeedback('negative')}
                    disabled={isSubmittingFeedback}
                    className={`p-1.5 rounded transition-colors duration-200 ${
                      feedbackType === 'negative'
                        ? isDarkMode
                          ? 'text-red-400 bg-red-900/50'
                          : 'text-red-600 bg-red-100'
                        : isDarkMode
                          ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/30'
                          : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={feedbackType === 'negative' ? 'Remove negative feedback' : 'Bad response'}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                  {onMoveToRoadmap && (
                    <button
                      onClick={handleMoveToRoadmap}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        movedToRoadmap
                          ? isDarkMode
                            ? 'text-green-400 bg-green-900/50'
                            : 'text-green-600 bg-green-100'
                          : isDarkMode
                            ? 'text-purple-400 bg-purple-900/30 hover:bg-purple-900/50'
                            : 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                      }`}
                    >
                      {movedToRoadmap ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Saved to Roadmap</span>
                        </>
                      ) : (
                        <>
                          <Target className="w-4 h-4" />
                          <span>Save to My Roadmap</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble; 