export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  isError?: boolean;
  metadata?: {
    sql_query?: string;
    source?: string;
    confidence?: number;
    follow_up_suggestions?: string[];
    raw_data?: any[];
  };
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatInterfaceProps {
  session: Session | null;
  onUpdateSession: (sessionId: string, updates: Partial<Session>) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export interface SidebarProps {
  sessions: Session[];
  currentSession: Session | null;
  onSessionSelect: (session: Session) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  userInfo?: any;
  activeView?: 'chat' | 'roadmap' | 'documents' | 'admin';
  onViewChange?: (view: 'chat' | 'roadmap' | 'documents' | 'admin') => void;
  isAdmin?: boolean;
}

export interface MessageBubbleProps {
  message: Message;
  onMoveToRoadmap?: (content: string) => void;
}

export interface AppProps {}

export interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
} 