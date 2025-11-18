import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, StopCircle, ChevronDown, Upload, X, CheckCircle, Lightbulb } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { ChatInterfaceProps } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import DocumentService from '../services/documentService';
import RoadmapService from '../services/roadmapService';
import sessionManager from '../utils/sessionManager';

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  session,
  onUpdateSession,
  sidebarOpen,
  onToggleSidebar
}) => {
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  const [hasDocuments, setHasDocuments] = useState<boolean>(true);
  const [showUploadPrompt, setShowUploadPrompt] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<Array<{id: string, title: string, description: string}>>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(false);
  const [dismissedRecommendations, setDismissedRecommendations] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isDarkMode } = useTheme();
  const { profile, getChildName, getParentGreeting } = useProfile();

  // Check if user has uploaded documents and load recommendations
  useEffect(() => {
    const checkDocuments = async () => {
      try {
        const documents = await DocumentService.getDocuments();
        const hasUploaded = documents.length > 0;
        setHasDocuments(hasUploaded);

        // Show prompt if no documents and user hasn't dismissed it before
        const dismissedPrompt = localStorage.getItem('upload_prompt_dismissed');
        if (!hasUploaded && !dismissedPrompt) {
          setShowUploadPrompt(true);
        }

        // Load quick win recommendations if user has documents and has messages
        if (hasUploaded && session?.messages && session.messages.length > 2 && recommendations.length === 0) {
          loadRecommendations();
        }
      } catch (error) {
        console.error('Error checking documents:', error);
        // Assume they have documents if we can't check
        setHasDocuments(true);
      }
    };

    checkDocuments();
  }, [session?.id, session?.messages?.length]); // Re-run when session changes or messages are added

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  // Check if user should see scroll-to-bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom && (session?.messages?.length || 0) > 0);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [session?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const dismissUploadPrompt = () => {
    setShowUploadPrompt(false);
    localStorage.setItem('upload_prompt_dismissed', 'true');
  };

  const loadRecommendations = async () => {
    if (loadingRecommendations || !hasDocuments) return;

    setLoadingRecommendations(true);
    try {
      const childName = getChildName();
      const childAge = profile?.children?.[0]?.age;

      const prompt = `Based on ${childName ? `${childName}'s` : 'the child\'s'} profile${childAge ? ` (age ${childAge})` : ''} and uploaded documents, suggest 3 quick win recommendations - small, actionable steps parents can take this week to support their child. Keep each recommendation concise and practical.

Format each as:
1. [Title] - [Brief 1-2 sentence description]
2. [Title] - [Brief 1-2 sentence description]
3. [Title] - [Brief 1-2 sentence description]`;

      const apiUrl = process.env.REACT_APP_API_URL || 'https://1mn0x289zc.execute-api.us-east-1.amazonaws.com/prod';
      const authToken = localStorage.getItem('auth_token');
      const userId = localStorage.getItem('user_id') || 'testuser@example.com';

      const response = await fetch(`${apiUrl}/docs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          question: prompt,
          user_id: userId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to load recommendations');
      }

      const data = await response.json();
      const aiResponse = data.response || data.answer || '';

      // Parse recommendations
      const recMatches = aiResponse.match(/\d+\.\s*\[(.+?)\]\s*-\s*(.+?)(?=\n\d+\.|\n*$)/gs) || [];

      if (recMatches.length > 0) {
        const parsed = recMatches.slice(0, 3).map((match: string, index: number) => {
          const titleMatch = match.match(/\[(.+?)\]/);
          const descMatch = match.match(/\]\s*-\s*(.+)/s);

          return {
            id: `rec-${Date.now()}-${index}`,
            title: titleMatch ? titleMatch[1].trim() : `Recommendation ${index + 1}`,
            description: descMatch ? descMatch[1].trim() : match.replace(/^\d+\.\s*/, '').trim()
          };
        });

        setRecommendations(parsed);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const approveRecommendation = async (recommendation: {id: string, title: string, description: string}) => {
    // Add to roadmap
    await handleMoveToRoadmap(`${recommendation.title}\n\n${recommendation.description}`);

    // Remove from recommendations
    setDismissedRecommendations(prev => new Set(Array.from(prev).concat(recommendation.id)));
  };

  const dismissRecommendation = (id: string) => {
    setDismissedRecommendations(prev => new Set(Array.from(prev).concat(id)));
  };

  const handleMoveToRoadmap = async (content: string) => {
    try {
      // Get or create a roadmap for the user
      let roadmap = await RoadmapService.getCurrentRoadmap();

      if (!roadmap) {
        // Create a new 90-day roadmap with empty items
        roadmap = await RoadmapService.createRoadmap([]);
      }

      // Get existing recommendations for anti-duplication
      const existingItems = roadmap.items || [];
      const existingRecommendations = existingItems.map(item => ({
        title: item.title,
        description: item.description,
        category: item.category
      }));

      // Call unified Lambda function with mode='format' to transform chat message
      const apiUrl = process.env.REACT_APP_API_URL || 'https://1mn0x289zc.execute-api.us-east-1.amazonaws.com/prod';
      const authToken = localStorage.getItem('auth_token');

      const response = await fetch(`${apiUrl}/roadmap-transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          message: content,
          existingRecommendations: existingRecommendations,
          mode: 'format',  // Format existing AI message into roadmap item
          source: 'chat'   // Indicate this was added from chat, not auto-generated
        })
      });

      if (!response.ok) {
        throw new Error('Failed to transform message into roadmap item');
      }

      const data = await response.json();
      const roadmapItem = data.roadmapItem;

      // Create a roadmap item from the Lambda-generated structure
      await RoadmapService.addRoadmapItem(roadmap.id, {
        title: roadmapItem.title,
        description: roadmapItem.description,
        category: roadmapItem.category,
        status: 'not_started',
        notes: []
      });

      console.log('Successfully added goal to roadmap');
    } catch (error) {
      console.error('Error adding to roadmap:', error);
    }
  };

  const formatResponseNaturally = (rawResponse: string, userQuestion: string, hasData: boolean): string => {
    if (!rawResponse) return "I couldn't find the information you're looking for.";

    const questionLower = userQuestion.toLowerCase();
    const childName = getChildName();
    let prefix = "";

    if (questionLower.includes('iep') || questionLower.includes('accommodations')) {
      prefix = childName ? `Based on ${childName}'s IEP documents, ` : "Based on the IEP documents, ";
    } else if (questionLower.includes('therapy') || questionLower.includes('aba')) {
      prefix = childName ? `Looking at ${childName}'s therapy records, ` : "Looking at the therapy records, ";
    } else if (questionLower.includes('medical') || questionLower.includes('diagnosis')) {
      prefix = childName ? `From ${childName}'s medical records, ` : "From the medical records, ";
    } else if (hasData) {
      prefix = childName ? `Based on ${childName}'s profile and documents, ` : "Based on your child's profile and documents, ";
    } else {
      prefix = "";
    }

    const suffix = hasData ?
      "\n\nThis information is based on your uploaded documents and profile. Feel free to ask for more details or clarification!" :
      "\n\nIf you'd like more specific information, please let me know!";

    return `${prefix}${rawResponse}${suffix}`;
  };

  // Auto-resize textarea with smooth animation
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [inputMessage]);

  // Simulate typing indicator
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setIsTyping(true), 500);
      return () => clearTimeout(timer);
    } else {
      setIsTyping(false);
    }
  }, [isLoading]);

  const handleSendMessage = async (): Promise<void> => {
    if (!inputMessage.trim() || !session || isLoading) return;
    
    // Extend session on activity
    sessionManager.extendSession();

    const userMessage = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      role: 'user' as const,
      timestamp: new Date().toISOString()
    };

    // Add user message to session
    const updatedMessages = [...session.messages, userMessage];
    onUpdateSession(session.id, { 
      messages: updatedMessages,
      title: session.messages.length === 0 ? inputMessage.trim().substring(0, 50) : session.title
    });

    setInputMessage('');
    setIsLoading(true);

    try {
      // Use real backend API
      const apiUrl = process.env.REACT_APP_API_URL || 'https://1mn0x289zc.execute-api.us-east-1.amazonaws.com/prod';
      const authToken = localStorage.getItem('auth_token');
      const userId = localStorage.getItem('user_id') || 'testuser@example.com';

      // Include previous conversation history (last 10 messages) for context
      const conversationHistory = session.messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      console.log('Sending chat request to:', `${apiUrl}/docs`);
      console.log('Request payload:', {
        question: userMessage.content,
        user_id: userId,
        conversation_history: conversationHistory
      });

      const response = await fetch(`${apiUrl}/docs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          question: userMessage.content,
          user_id: userId,
          conversation_history: conversationHistory
        })
      });

      console.log('Chat API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Chat API error response:', errorText);
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Chat API response data:', data);

      const rawResponse = data.response || data.answer || 'Sorry, I encountered an error processing your request.';
      const hasData = !!(data.sources && data.sources.length > 0);
      const naturalResponse = formatResponseNaturally(rawResponse, userMessage.content, hasData);
      
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        content: naturalResponse,
        role: 'assistant' as const,
        timestamp: new Date().toISOString(),
        metadata: {
          approach: data.approach,
          processing_time_ms: data.processing_time_ms,
          follow_up_suggestions: data.follow_up_suggestions,
          data_summary: data.data_summary
        }
      };

      // Add assistant message to session
      onUpdateSession(session.id, { 
        messages: [...updatedMessages, assistantMessage]
      });
      
      // Store follow-up suggestions for quick access
      if (data.follow_up_suggestions && data.follow_up_suggestions.length > 0) {
        setSuggestedQuestions(data.follow_up_suggestions);
      }

    } catch (error: any) {
      console.error('Error sending message:', error);

      let errorContent = `I'm having trouble processing that question right now. `;

      if (error.message?.includes('401') || error.message?.includes('403')) {
        errorContent += `It looks like there might be an authentication issue. Please try logging in again.`;
      } else if (error.message?.includes('404')) {
        errorContent += `I couldn't find the information you're looking for. Please make sure your documents have been uploaded and processed.`;
      } else {
        errorContent += `Please try rephrasing your question, or ask about IEP accommodations, therapy approaches, or sensory support strategies.`;
      }

      const errorMessage = {
        id: (Date.now() + 1).toString(),
        content: errorContent,
        role: 'assistant' as const,
        timestamp: new Date().toISOString(),
        isError: true
      };

      onUpdateSession(session.id, {
        messages: [...updatedMessages, errorMessage]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!session) {
    return (
      <div className={`flex-1 flex items-center justify-center transition-colors duration-500 ${
        isDarkMode 
          ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
          : 'bg-gradient-to-br from-slate-50 via-white to-slate-50'
      }`}>
        <div className="text-center max-w-md mx-auto px-6 animate-fade-in">
          <div className="relative mb-8">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-2xl transition-all duration-500 ${
              isDarkMode
                ? 'bg-gradient-to-r from-slate-700 to-slate-800 shadow-slate-500/25'
                : 'bg-gradient-to-r from-slate-100 to-slate-200'
            }`}>
              <img
                src="/revstar-logo.jpg"
                alt="RevStar Wellness Navigator"
                className="w-16 h-16 object-cover rounded-full"
              />
            </div>
          </div>
          <h2 className={`text-2xl font-bold mb-3 transition-colors duration-500 ${
            isDarkMode ? 'text-slate-100' : 'text-slate-800'
          }`}>
            {getParentGreeting()}
          </h2>
          <p className={`leading-relaxed transition-colors duration-500 ${
            isDarkMode ? 'text-slate-300' : 'text-slate-600'
          }`}>
            I'm here to help answer your questions about interventions, IEPs, sensory needs, and provide personalized guidance{getChildName() ? ` for ${getChildName()}` : ''}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col h-full transition-colors duration-500 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-50'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b transition-all duration-500 ${
        isDarkMode
          ? 'bg-slate-800/80 backdrop-blur-sm border-slate-700/50 shadow-sm'
          : 'bg-white/80 backdrop-blur-sm border-slate-200/50 shadow-sm'
      }`}>
        <div className="flex items-center">
          <button
            onClick={onToggleSidebar}
            className={`lg:hidden p-2 rounded-lg transition-all duration-300 mr-3 ${
              isDarkMode
                ? 'hover:bg-slate-700 text-slate-300'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className={`text-lg font-semibold transition-colors duration-500 ${
              isDarkMode ? 'text-slate-100' : 'text-slate-900'
            }`}>
              {session.title}
            </h2>
            <p className={`text-sm transition-colors duration-500 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {session.messages.length} messages
            </p>
          </div>
        </div>
      </div>

      {/* Upload Documents Prompt Banner */}
      {showUploadPrompt && (
        <div className={`mx-4 mt-4 p-4 rounded-xl border-2 transition-all duration-300 animate-fade-in ${
          isDarkMode
            ? 'bg-blue-900/20 border-blue-700/50 backdrop-blur-sm'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${
              isDarkMode ? 'bg-blue-800/50' : 'bg-blue-100'
            }`}>
              <Upload className={`w-5 h-5 ${
                isDarkMode ? 'text-blue-300' : 'text-blue-600'
              }`} />
            </div>
            <div className="flex-1">
              <h4 className={`font-semibold mb-1 ${
                isDarkMode ? 'text-blue-200' : 'text-blue-900'
              }`}>
                {getChildName() ? `Get personalized recommendations for ${getChildName()}` : 'Get personalized recommendations'}
              </h4>
              <p className={`text-sm mb-3 ${
                isDarkMode ? 'text-blue-300' : 'text-blue-700'
              }`}>
                Upload IEPs, therapy reports, or medical records to receive tailored guidance based on {getChildName() ? `${getChildName()}'s` : 'your child\'s'} specific needs and goals.
              </p>
              <p className={`text-xs ${
                isDarkMode ? 'text-blue-400' : 'text-blue-600'
              }`}>
                Click "Documents" in the sidebar to get started →
              </p>
            </div>
            <button
              onClick={dismissUploadPrompt}
              className={`p-1 rounded-lg transition-colors ${
                isDarkMode
                  ? 'hover:bg-blue-800/50 text-blue-300'
                  : 'hover:bg-blue-100 text-blue-600'
              }`}
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6 relative">
        {session.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md animate-fade-in">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center shadow-2xl transition-all duration-500 ${
                isDarkMode
                  ? 'bg-gradient-to-r from-slate-700 to-slate-800 shadow-slate-500/25'
                  : 'bg-gradient-to-r from-slate-100 to-slate-200'
              }`}>
                <img
                  src="/revstar-logo.jpg"
                  alt="RevStar Wellness"
                  className="w-10 h-10 object-contain"
                />
              </div>
              <h3 className={`text-xl font-semibold mb-4 transition-colors duration-500 ${
                isDarkMode ? 'text-slate-100' : 'text-slate-700'
              }`}>
                {getChildName() ? `How can I help you support ${getChildName()} today?` : 'How can I help you today?'}
              </h3>
              <div className="space-y-3">
                {[
                  "How can I help my child with sensory sensitivities?",
                  "What should I know about IEP accommodations?",
                  "How do I handle meltdowns in public places?"
                ].map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInputMessage(suggestion);
                      setTimeout(() => handleSendMessage(), 100);
                    }}
                    className={`w-full px-4 py-3 rounded-xl text-sm text-left transition-all duration-300 hover:scale-105 ${
                      isDarkMode
                        ? 'bg-slate-700/30 hover:bg-slate-700/50 text-slate-300'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                    }`}
                  >
                    "{suggestion}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          session.messages.map((message, index) => (
            <div key={message.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
              <MessageBubble message={message} onMoveToRoadmap={handleMoveToRoadmap} />
            </div>
          ))
        )}
        
        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start animate-fade-in">
            <div className={`chat-bubble transition-all duration-500 ${
              isDarkMode
                ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700/50'
                : 'bg-white/80 backdrop-blur-sm border border-slate-200/50'
            }`}>
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className={`w-2 h-2 rounded-full animate-bounce ${
                    isDarkMode ? 'bg-slate-400' : 'bg-slate-400'
                  }`}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${
                    isDarkMode ? 'bg-slate-400' : 'bg-slate-400'
                  }`} style={{animationDelay: '0.1s'}}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${
                    isDarkMode ? 'bg-slate-400' : 'bg-slate-400'
                  }`} style={{animationDelay: '0.2s'}}></div>
                </div>
                <span className={`text-sm transition-colors duration-500 ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  RevStar Wellness is thinking...
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className={`fixed bottom-24 sm:bottom-32 right-4 sm:right-6 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full shadow-lg border transition-all duration-300 hover:scale-110 z-10 ${
              isDarkMode
                ? 'bg-slate-700/90 hover:bg-slate-600 border-slate-600 text-slate-300'
                : 'bg-white/90 hover:bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Follow-up Suggestions */}
      {suggestedQuestions.length > 0 && !isLoading && (
        <div className={`px-4 py-3 border-t transition-all duration-500 ${
          isDarkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border-slate-700/50'
            : 'bg-gray-50/80 backdrop-blur-sm border-slate-200/50'
        }`}>
          <div className="max-w-4xl mx-auto">
            <p className={`text-xs font-medium mb-2 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Suggested follow-ups:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setInputMessage(question);
                    setSuggestedQuestions([]);
                    // Automatically send the question
                    setTimeout(() => {
                      handleSendMessage();
                    }, 100);
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-200 hover:scale-105 ${
                    isDarkMode
                      ? 'bg-slate-700/70 hover:bg-slate-700 text-slate-200 border border-slate-600/50'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                  }`}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Win Recommendations */}
      {recommendations.filter(r => !dismissedRecommendations.has(r.id)).length > 0 && !isLoading && (
        <div className={`px-4 py-4 border-t transition-all duration-500 ${
          isDarkMode
            ? 'bg-gradient-to-r from-purple-900/20 to-blue-900/20 backdrop-blur-sm border-slate-700/50'
            : 'bg-gradient-to-r from-purple-50 to-blue-50 backdrop-blur-sm border-slate-200/50'
        }`}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className={`w-4 h-4 ${
                isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
              }`} />
              <p className={`text-sm font-semibold ${
                isDarkMode ? 'text-purple-200' : 'text-purple-900'
              }`}>
                Quick Win Recommendations
              </p>
            </div>
            <div className="space-y-3">
              {recommendations
                .filter(r => !dismissedRecommendations.has(r.id))
                .map((recommendation) => (
                  <div
                    key={recommendation.id}
                    className={`p-4 rounded-xl border transition-all duration-300 ${
                      isDarkMode
                        ? 'bg-slate-800/80 border-slate-700/50 hover:border-slate-600'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className={`font-semibold mb-1 text-sm ${
                          isDarkMode ? 'text-slate-100' : 'text-slate-900'
                        }`}>
                          {recommendation.title}
                        </h4>
                        <p className={`text-sm ${
                          isDarkMode ? 'text-slate-300' : 'text-slate-600'
                        }`}>
                          {recommendation.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveRecommendation(recommendation)}
                          className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                            isDarkMode
                              ? 'bg-green-900/30 hover:bg-green-800/50 text-green-400 border border-green-700/50'
                              : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
                          }`}
                          title="Add to roadmap"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => dismissRecommendation(recommendation.id)}
                          className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                            isDarkMode
                              ? 'hover:bg-slate-700 text-slate-400'
                              : 'hover:bg-slate-100 text-slate-500'
                          }`}
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            <p className={`text-xs mt-3 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Click ✓ to add to your roadmap, or × to dismiss
            </p>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className={`p-4 border-t transition-all duration-500 ${
        isDarkMode
          ? 'bg-slate-800/80 backdrop-blur-sm border-slate-700/50'
          : 'bg-white/80 backdrop-blur-sm border-slate-200/50'
      }`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end space-x-3">
            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isLoading ? "AI is thinking..." : "Ask about autism support, interventions, or your child's needs..."}
                className={`w-full px-4 py-3 border rounded-2xl resize-none transition-all duration-300 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 min-h-[44px] max-h-32 pr-12 ${
                  isDarkMode
                    ? 'bg-slate-700/80 backdrop-blur-sm border-slate-600 text-slate-100 placeholder-slate-400 focus:bg-slate-700/90'
                    : 'bg-white/90 backdrop-blur-sm border-slate-300 text-slate-900 placeholder-slate-500 focus:bg-white'
                }`}
                rows={1}
                disabled={isLoading}
              />
            </div>

            {/* Send button */}
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className={`px-6 py-3 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl min-w-[80px] justify-center flex items-center space-x-2 ${
                isDarkMode
                  ? 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white'
                  : 'bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white'
              }`}
            >
              {isLoading ? (
                <>
                  <StopCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Stop</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </>
              )}
            </button>
          </div>
          
          <div className={`mt-2 text-sm sm:text-xs flex items-center justify-between transition-colors duration-500 ${
            isDarkMode ? 'text-slate-400' : 'text-slate-500'
          }`}>
            <span className="hidden sm:inline">Press Enter to send, Shift+Enter for new line</span>
            <span className="sm:hidden">Tap to send</span>
            <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>
              {inputMessage.length}/4000
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface; 