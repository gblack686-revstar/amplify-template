import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'Loading...' }) => {
  const { isDarkMode } = useTheme();

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen ${
      isDarkMode
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100'
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900'
    }`}>
      <div className="flex flex-col items-center gap-4">
        <div className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin ${
          isDarkMode ? 'border-blue-500' : 'border-blue-600'
        }`} />
        <p className={`text-sm font-medium ${
          isDarkMode ? 'text-slate-300' : 'text-slate-600'
        }`}>
          {message}
        </p>
      </div>
    </div>
  );
};

export default LoadingSpinner;
