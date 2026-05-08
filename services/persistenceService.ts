import Dexie, { Table } from 'dexie';
import { Inspection } from '../types';

/**
 * Persistence Database for QMS Drafts
 * Using IndexedDB to support high-volume image storage (up to several GBs)
 */
export class QMSDatabase extends Dexie {
  drafts!: Table<InspectionDraft>;

  constructor() {
    super('QMSDatabase');
    this.version(1).stores({
      drafts: 'id, type, userId, updatedAt' // primary key is 'id' (formId + userId)
    });
  }
}

export interface InspectionDraft {
  id: string; // unique key: `${type}_${userId}`
  type: string;
  userId: string;
  data: Partial<Inspection>;
  updatedAt: string;
}

export const qmsDb = new QMSDatabase();

/**
 * Persistence Service
 */
export const PersistenceService = {
  async saveDraft(type: string, userId: string, data: Partial<Inspection>) {
    const id = `${type}_${userId}`;
    return qmsDb.drafts.put({
      id,
      type,
      userId,
      data,
      updatedAt: new Date().toISOString()
    });
  },

  async getDraft(type: string, userId: string): Promise<Partial<Inspection> | null> {
    const id = `${type}_${userId}`;
    const draft = await qmsDb.drafts.get(id);
    return draft ? draft.data : null;
  },

  async clearDraft(type: string, userId: string) {
    const id = `${type}_${userId}`;
    return qmsDb.drafts.delete(id);
  },

  async hasDraft(type: string, userId: string): Promise<boolean> {
    const id = `${type}_${userId}`;
    const draft = await qmsDb.drafts.get(id);
    return !!draft;
  }
};
