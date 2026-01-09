
import { User } from '../types';

// Mock users for demonstration
const MOCK_USERS: User[] = [
  {
    id: '1',
    username: 'admin',
    name: 'Administrator',
    role: 'ADMIN',
    avatar: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff'
  },
  {
    id: '2',
    username: 'manager',
    name: 'Trần Văn Quản Lý',
    role: 'MANAGER',
    avatar: 'https://ui-avatars.com/api/?name=Manager&background=6366f1&color=fff'
  },
  {
    id: '3',
    username: 'qc',
    name: 'Nguyễn Văn QC',
    role: 'QC',
    avatar: 'https://ui-avatars.com/api/?name=QC&background=10b981&color=fff'
  }
];

export const login = async (username: string, password: string): Promise<User | null> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  // Simple check (In real app, use backend)
  // Password for all mock users is '123456'
  if (password === '123456') {
    const user = MOCK_USERS.find(u => u.username === username);
    return user || null;
  }
  
  return null;
};

export const logout = async (): Promise<void> => {
    // Simulate logout
    return Promise.resolve();
};
