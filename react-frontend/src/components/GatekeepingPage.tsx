import React, { useState } from 'react';

interface GatekeepingPageProps {
  onAccessGranted: () => void;
}

const GatekeepingPage: React.FC<GatekeepingPageProps> = ({ onAccessGranted }) => {
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password.toLowerCase() === 'revstar') {
      localStorage.setItem('access_granted', 'true');
      onAccessGranted();
    } else {
      setError('Incorrect access code. Please try again.');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img
              src="/revstar-logo.jpg"
              alt="RevStar Wellness Navigator"
              className="w-20 h-20 rounded-full object-cover shadow-lg"
            />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-1">
              RevStar Wellness
            </h1>
            <p className="text-2xl font-semibold text-blue-600 mb-3">
              Navigator
            </p>
          </div>
          <p className="text-gray-600">
            Supporting you on your wellness journey
          </p>
        </div>

        {/* Access Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Welcome
          </h2>
          <p className="text-gray-600 mb-6">
            Enter your access code to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Access Code
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                placeholder="Enter access code"
                autoFocus
              />
              {error && (
                <p className="mt-2 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium py-3 px-6 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-[1.02]"
            >
              Enter
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500">
              Need an access code?{' '}
              <a href="mailto:support@revstar.com" className="text-blue-600 hover:text-blue-700 font-medium">
                Contact us
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            A comprehensive platform for wellness support and guidance
          </p>
        </div>
      </div>
    </div>
  );
};

export default GatekeepingPage;
