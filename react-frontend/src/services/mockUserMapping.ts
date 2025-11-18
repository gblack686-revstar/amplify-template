// Mock User Management for Template
// Replace with your actual user management logic

export interface UserInfo {
  role: string;
  displayName: string;
}

class MockUserMappingService {
  private userMappings: { [key: string]: UserInfo } = {
    'testuser@example.com': {
      role: 'user',
      displayName: 'Test User'
    },
    'admin@test.com': {
      role: 'admin',
      displayName: 'Admin'
    }
  };

  getUserInfo(username: string): UserInfo {
    return this.userMappings[username] || {
      role: 'user',
      displayName: username  // Use email as display name for unmapped users
    };
  }

  getCurrentUserInfo(): UserInfo | null {
    const userRole = localStorage.getItem('user_role');
    const userDisplayName = localStorage.getItem('user_display_name');

    if (userRole && userDisplayName) {
      return {
        role: userRole,
        displayName: userDisplayName
      };
    }
    return null;
  }
}

export default new MockUserMappingService();