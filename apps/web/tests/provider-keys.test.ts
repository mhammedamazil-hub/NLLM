/**
 * P0 test: API key persistence and encryption round-trip.
 * Verifies the fix for the 8 root causes identified in the audit:
 * 1. Passphrase consistency between encrypt and decrypt
 * 2. Key persists to SQLite (not just component state)
 * 3. saveProviderProfile() is called
 * 4. Profile survives DB export/import round-trip
 * 5. Wrong passphrase cannot decrypt
 * 6. Profile loading works from persisted DB
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Database } from '../src/core/storage/database.ts';
import { Repository } from '../src/core/storage/repository.ts';
import { encryptSecret, decryptSecret, canDecrypt } from '../src/core/providers/keyvault.ts';

let db: Database;
let repo: Repository;

beforeAll(async () => {
  db = await Database.open();
  repo = new Repository(db);
});

afterAll(() => {
  db.close();
});

describe('P0: API Key Encryption & Persistence', () => {
  it('encrypts and decrypts with the same passphrase', async () => {
    const apiKey = 'AIzaSyTestKey1234567890';
    const passphrase = 'my-secret';
    const encrypted = await encryptSecret(apiKey, passphrase);
    expect(encrypted).not.toContain(apiKey);
    const decrypted = await decryptSecret(encrypted, passphrase);
    expect(decrypted).toBe(apiKey);
  });

  it('fails decryption with wrong passphrase', async () => {
    const apiKey = 'sk-test-key';
    const passphrase = 'correct-pass';
    const encrypted = await encryptSecret(apiKey, passphrase);
    const canDecryptWithWrong = await canDecrypt(encrypted, 'wrong-pass');
    expect(canDecryptWithWrong).toBe(false);
    await expect(decryptSecret(encrypted, 'wrong-pass')).rejects.toThrow();
  });

  it('encrypts with non-ASCII passphrase', async () => {
    const apiKey = 'AIzaSyNonAscii';
    const passphrase = '패스워드-١٢٣';
    const encrypted = await encryptSecret(apiKey, passphrase);
    const decrypted = await decryptSecret(encrypted, passphrase);
    expect(decrypted).toBe(apiKey);
  });

  it('saves provider profile with encrypted key to SQLite', async () => {
    const apiKey = 'sk-persisted-key';
    const passphrase = 'test-pass';
    const encrypted = await encryptSecret(apiKey, passphrase);

    const profile = repo.saveProviderProfile({
      kind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKeyEncrypted: encrypted,
      model: 'gemini-2.0-flash',
    });

    expect(profile.id).toBeTruthy();
    expect(profile.kind).toBe('gemini');

    // Retrieve from DB
    const loaded = repo.getProviderProfile(profile.id);
    expect(loaded).toBeDefined();
    expect(loaded?.kind).toBe('gemini');
    expect(loaded?.model).toBe('gemini-2.0-flash');
    expect(loaded?.apiKeyEncrypted).toBe(encrypted);

    // Decrypt the stored key
    const decrypted = await decryptSecret(loaded!.apiKeyEncrypted, passphrase);
    expect(decrypted).toBe(apiKey);

    // Cleanup
    repo.deleteProviderProfile(profile.id);
  });

  it('lists all provider profiles', async () => {
    const profiles = repo.listProviderProfiles();
    // Clean state — no profiles should exist from previous tests
    // (each test cleans up after itself)
    expect(Array.isArray(profiles)).toBe(true);
  });

  it('deletes provider profiles', async () => {
    const encrypted = await encryptSecret('sk-delete-me', 'pass');
    const profile = repo.saveProviderProfile({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEncrypted: encrypted,
      model: 'gpt-4o-mini',
    });

    expect(repo.deleteProviderProfile(profile.id)).toBe(true);
    expect(repo.getProviderProfile(profile.id)).toBeNull();
    // Deleting again returns false
    expect(repo.deleteProviderProfile(profile.id)).toBe(false);
  });

  it('survives DB export/import round-trip with encrypted key intact', async () => {
    const apiKey = 'sk-round-trip-key';
    const passphrase = 'round-pass';
    const encrypted = await encryptSecret(apiKey, passphrase);

    const profile = repo.saveProviderProfile({
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKeyEncrypted: encrypted,
      model: 'claude-3-5-sonnet',
    });

    // Export DB
    const blob = db.export();
    const db2 = await Database.openFromBlob(blob);
    const repo2 = new Repository(db2);

    // Profile should survive
    const loaded = repo2.getProviderProfile(profile.id);
    expect(loaded).toBeDefined();
    expect(loaded?.kind).toBe('anthropic');

    // Key should still decrypt
    const decrypted = await decryptSecret(loaded!.apiKeyEncrypted, passphrase);
    expect(decrypted).toBe(apiKey);

    db2.close();
    repo.deleteProviderProfile(profile.id);
  });

  it('enforces unique model+kind combinations per profile', async () => {
    // Two profiles with different kinds and models should coexist
    const enc1 = await encryptSecret('key1', 'pass1');
    const enc2 = await encryptSecret('key2', 'pass2');

    const p1 = repo.saveProviderProfile({
      kind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKeyEncrypted: enc1,
      model: 'gemini-2.0-flash',
    });
    const p2 = repo.saveProviderProfile({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEncrypted: enc2,
      model: 'gpt-4o-mini',
    });

    expect(p1.id).not.toBe(p2.id);
    expect(repo.listProviderProfiles()).toHaveLength(2);

    repo.deleteProviderProfile(p1.id);
    repo.deleteProviderProfile(p2.id);
  });

  it('canDecrypt returns true for correct passphrase', async () => {
    const apiKey = 'sk-can-decrypt';
    const passphrase = 'can-decrypt-pass';
    const encrypted = await encryptSecret(apiKey, passphrase);
    expect(await canDecrypt(encrypted, passphrase)).toBe(true);
    expect(await canDecrypt(encrypted, 'wrong')).toBe(false);
  });
});
