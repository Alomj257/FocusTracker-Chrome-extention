// storage.test.js

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import FocusStorage from './storage';

describe('FocusStorage', () => {
  let storage;
  let indexedDB;
  
  beforeEach(async () => {
    // Mock IndexedDB
    indexedDB = {
      open: vi.fn(),
      deleteDatabase: vi.fn()
    };
    
    global.indexedDB = indexedDB;
    storage = new FocusStorage();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initializes database successfully', async () => {
    const mockDB = {
      objectStoreNames: {
        contains: () => false
      },
      createObjectStore: vi.fn(() => ({
        createIndex: vi.fn()
      }))
    };

    indexedDB.open.mockImplementation(() => {
      const request = {
        error: null,
        result: mockDB,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null
      };

      setTimeout(() => {
        request.onupgradeneeded({ target: { result: mockDB } });
        request.onsuccess();
      }, 0);

      return request;
    });

    const result = await storage.initialize();
    expect(result).toBe(true);
    expect(mockDB.createObjectStore).toHaveBeenCalledTimes(4);
  });

  test('migrates data from Chrome storage', async () => {
    const chromeData = {
      sessionHistory: [
        {
          startTime: Date.now(),
          duration: 1800000,
          distractions: 2
        }
      ],
      streak: 5,
      lastSessionDate: '2024-11-26'
    };

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue(chromeData),
          set: vi.fn().mockResolvedValue()
        }
      }
    };

    storage.bulkAdd = vi.fn().mockResolvedValue();
    storage.set = vi.fn().mockResolvedValue();

    await storage.migrateFromChromeStorage();

    expect(storage.bulkAdd).toHaveBeenCalledWith(storage.STORES.sessions, expect.any(Array));
    expect(storage.set).toHaveBeenCalledTimes(2); // streak and lastSessionDate
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ dbMigrationCompleted: true });
  });

  test('handles session storage operations', async () => {
    const mockSession = {
      startTime: Date.now(),
      duration: 1800000,
      distractions: 2,
      date: '2024-11-26'
    };

    storage.db = {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          put: vi.fn(() => ({
            onsuccess: null,
            onerror: null
          })),
          get: vi.fn(() => ({
            onsuccess: null,
            onerror: null
          }))
        }))
      }))
    };

    // Test setting session
    const setResult = await storage.set(storage.STORES.sessions, mockSession);
    expect(setResult).toBeDefined();

    // Test getting session
    const getResult = await storage.get(storage.STORES.sessions, mockSession.startTime);
    expect(getResult).toBeDefined();
  });

  test('performs data cleanup', async () => {
    const mockSessions = Array.from({ length: 150 }, (_, i) => ({
      startTime: Date.now() - i * 86400000,
      duration: 1800000,
      date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
    }));

    storage.getAll = vi.fn().mockResolvedValue(mockSessions);
    storage.delete = vi.fn().mockResolvedValue();

    await storage.cleanup();

    expect(storage.delete).toHaveBeenCalledTimes(50); // Should delete oldest 50 sessions
  });

  test('validates data integrity', async () => {
    const mockInvalidSessions = [
      { startTime: Date.now() }, // Missing duration
      { duration: 1800000 }      // Missing startTime
    ];

    storage.getAll = vi.fn().mockResolvedValue(mockInvalidSessions);
    
    const issues = await storage.validateData();
    expect(issues).toHaveLength(2);
    expect(issues[0].issue).toBe('Invalid session data');
  });
});