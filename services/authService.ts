
// DEPRECATED: This service has been removed to comply with ISO Security Standards.
// All authentication logic is now handled by `services/apiService.ts` via Server API.
// Do not use this file.

import { User } from '../types';

export const login = async (username: string, password: string): Promise<User | null> => {
  throw new Error("Legacy login method disabled. Use apiService.login()");
};

export const logout = async (): Promise<void> => {
    return Promise.resolve();
};
