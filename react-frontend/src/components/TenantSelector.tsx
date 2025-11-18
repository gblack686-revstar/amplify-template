import React from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface Tenant {
  id: string;
  name: string;
  employeeCount: number;
  description: string;
}

interface TenantSelectorProps {
  selectedTenant: string;
  onTenantChange: (tenantId: string) => void;
}

const TenantSelector: React.FC<TenantSelectorProps> = ({ 
  selectedTenant, 
  onTenantChange 
}) => {
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);

  // Available tenants with their data
  const tenants: Tenant[] = [
    {
      id: 'demo-tenant-123',
      name: 'Demo Organization',
      employeeCount: 50,
      description: 'Template demo organization'
    }
  ];

  const currentTenant = tenants.find(t => t.id === selectedTenant) || tenants[0];

  return (
    <div className="relative">
      {/* Tenant Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all duration-200 ${
          isDarkMode
            ? 'bg-gray-800 border-gray-600 hover:border-gray-500 text-gray-100'
            : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
        } shadow-sm hover:shadow-md`}
      >
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${
            isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <Building2 className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="font-medium text-sm">{currentTenant.name}</div>
            <div className={`text-xs ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {currentTenant.employeeCount} employees
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${
          isOpen ? 'rotate-180' : ''
        }`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute top-full left-0 right-0 mt-2 rounded-xl border shadow-lg z-50 ${
          isDarkMode
            ? 'bg-gray-800 border-gray-600'
            : 'bg-white border-gray-200'
        }`}>
          <div className="p-2">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                onClick={() => {
                  onTenantChange(tenant.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                  tenant.id === selectedTenant
                    ? isDarkMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                    : isDarkMode
                    ? 'hover:bg-gray-700 text-gray-100'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{tenant.name}</div>
                    <div className={`text-xs ${
                      tenant.id === selectedTenant
                        ? isDarkMode ? 'text-blue-200' : 'text-blue-600'
                        : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {tenant.employeeCount} employees
                    </div>
                    <div className={`text-xs mt-1 ${
                      tenant.id === selectedTenant
                        ? isDarkMode ? 'text-blue-200' : 'text-blue-600'
                        : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {tenant.description}
                    </div>
                  </div>
                  {tenant.id === selectedTenant && (
                    <div className={`w-2 h-2 rounded-full ${
                      isDarkMode ? 'bg-blue-200' : 'bg-blue-600'
                    }`} />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default TenantSelector;
