/**
 * User-Tenant Mapping Service
 * Maps users to their tenant access permissions
 * Using actual tenant IDs as usernames for clarity
 */

interface UserTenantInfo {
  username: string;
  tenants: string[];
  defaultTenant: string;
  role: 'admin' | 'analyst' | 'viewer';
  showTenantDropdown: boolean;
  displayName: string;
}

interface TenantInfo {
  id: string;
  name: string;
}

// Tenant information - using actual tenant IDs from database
const TENANT_INFO: Record<string, TenantInfo> = {
  'a4060f2d-096d-4d18-9bfc-fad512f6706d': {
    id: 'a4060f2d-096d-4d18-9bfc-fad512f6706d',
    name: 'ACME India (a4060f2d)'
  },
  'c9be4b31-0102-42ac-a920-4a696f138f49': {
    id: 'c9be4b31-0102-42ac-a920-4a696f138f49',
    name: 'ACME USA (c9be4b31)'
  },
  'ce91c62f-7372-4157-93e1-9f8f6c90d6fc': {
    id: 'ce91c62f-7372-4157-93e1-9f8f6c90d6fc',
    name: 'Tenant 3 (ce91c62f)'
  }
};

// User-tenant mappings - usernames ARE the tenant IDs for single-tenant users
const USER_TENANT_MAPPINGS: Record<string, UserTenantInfo> = {
  // Admin user - has access to all tenants
  'admin': {
    username: 'admin',
    tenants: [
      'a4060f2d-096d-4d18-9bfc-fad512f6706d',
      'c9be4b31-0102-42ac-a920-4a696f138f49',
      'ce91c62f-7372-4157-93e1-9f8f6c90d6fc'
    ],
    defaultTenant: 'a4060f2d-096d-4d18-9bfc-fad512f6706d',
    role: 'admin',
    showTenantDropdown: true,  // Admin sees dropdown to switch tenants
    displayName: 'Administrator'
  },
  
  // Tenant 1 user - username IS the tenant ID
  'a4060f2d-096d-4d18-9bfc-fad512f6706d': {
    username: 'a4060f2d-096d-4d18-9bfc-fad512f6706d',
    tenants: ['a4060f2d-096d-4d18-9bfc-fad512f6706d'],
    defaultTenant: 'a4060f2d-096d-4d18-9bfc-fad512f6706d',
    role: 'analyst',
    showTenantDropdown: false,  // Single tenant - no dropdown
    displayName: 'ACME India User'
  },
  
  // Tenant 2 user - username IS the tenant ID
  'c9be4b31-0102-42ac-a920-4a696f138f49': {
    username: 'c9be4b31-0102-42ac-a920-4a696f138f49',
    tenants: ['c9be4b31-0102-42ac-a920-4a696f138f49'],
    defaultTenant: 'c9be4b31-0102-42ac-a920-4a696f138f49',
    role: 'analyst',
    showTenantDropdown: false,  // Single tenant - no dropdown
    displayName: 'Tenant 2 User'
  },
  
  // Tenant 3 user - username IS the tenant ID
  'ce91c62f-7372-4157-93e1-9f8f6c90d6fc': {
    username: 'ce91c62f-7372-4157-93e1-9f8f6c90d6fc',
    tenants: ['ce91c62f-7372-4157-93e1-9f8f6c90d6fc'],
    defaultTenant: 'ce91c62f-7372-4157-93e1-9f8f6c90d6fc',
    role: 'analyst',
    showTenantDropdown: false,  // Single tenant - no dropdown
    displayName: 'Tenant 3 User'
  },
  
  // Demo users for client presentation
  'demouser': {
    username: 'demouser',
    tenants: ['a4060f2d-096d-4d18-9bfc-fad512f6706d'],
    defaultTenant: 'a4060f2d-096d-4d18-9bfc-fad512f6706d',
    role: 'analyst',
    showTenantDropdown: false,
    displayName: 'Demo Analyst (ACME India)'
  },
  
  'demoviewer': {
    username: 'demoviewer',
    tenants: ['c9be4b31-0102-42ac-a920-4a696f138f49'],
    defaultTenant: 'c9be4b31-0102-42ac-a920-4a696f138f49',
    role: 'analyst',
    showTenantDropdown: false,
    displayName: 'Demo Analyst (Acme US)'
  },
  
  // Test user for current testing
  'testuser': {
    username: 'testuser',
    tenants: ['a4060f2d-096d-4d18-9bfc-fad512f6706d'],
    defaultTenant: 'a4060f2d-096d-4d18-9bfc-fad512f6706d',
    role: 'analyst',
    showTenantDropdown: false,
    displayName: 'Test User - Tenant 1 (ACME)'
  }
};

class UserTenantService {
  /**
   * Get user tenant information from username
   */
  getUserTenantInfo(username: string): UserTenantInfo {
    // Get from static mapping
    const userInfo = USER_TENANT_MAPPINGS[username] || USER_TENANT_MAPPINGS[username.toLowerCase()];
    
    if (userInfo) {
      return userInfo;
    }
    
    // If username is a tenant ID but not in mappings, create single-tenant access
    if (TENANT_INFO[username]) {
      return {
        username: username,
        tenants: [username],
        defaultTenant: username,
        role: 'viewer',
        showTenantDropdown: false,
        displayName: `User for ${TENANT_INFO[username].name}`
      };
    }
    
    // Default for unknown users - no access
    return {
      username: username,
      tenants: [],
      defaultTenant: '',
      role: 'viewer',
      showTenantDropdown: false,
      displayName: 'Unknown User'
    };
  }

  /**
   * Get tenant information by ID
   */
  getTenantInfo(tenantId: string): TenantInfo | null {
    return TENANT_INFO[tenantId] || null;
  }

  /**
   * Get all tenants for a user
   */
  getUserTenants(username: string): TenantInfo[] {
    const userInfo = this.getUserTenantInfo(username);
    return userInfo.tenants
      .map(tenantId => this.getTenantInfo(tenantId))
      .filter(tenant => tenant !== null) as TenantInfo[];
  }

  /**
   * Check if user has access to a specific tenant
   */
  userHasAccessToTenant(username: string, tenantId: string): boolean {
    const userInfo = this.getUserTenantInfo(username);
    return userInfo.tenants.includes(tenantId);
  }

  /**
   * Parse JWT token to get username
   */
  parseJwtToken(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      
      const payload = JSON.parse(atob(parts[1]));
      return payload['cognito:username'] || payload.username || null;
    } catch (error) {
      console.error('Error parsing JWT token:', error);
      return null;
    }
  }

  /**
   * Get user info from stored auth token
   */
  getCurrentUserInfo(): UserTenantInfo | null {
    const token = localStorage.getItem('auth_token');
    const storedUsername = localStorage.getItem('user_id');
    
    if (!token && !storedUsername) {
      return null;
    }
    
    // Try to get username from token first, fall back to stored username
    let username = null;
    if (token) {
      username = this.parseJwtToken(token);
    }
    if (!username && storedUsername) {
      username = storedUsername;
    }
    
    if (!username) {
      return null;
    }
    
    return this.getUserTenantInfo(username);
  }

  /**
   * Get all available tenants (for admin dropdown)
   */
  getAllTenants(): TenantInfo[] {
    return Object.values(TENANT_INFO);
  }
}

const userTenantService = new UserTenantService();
export default userTenantService;
export type { UserTenantInfo, TenantInfo };