// @vitest-environment jsdom
/**
 * Component test for ProviderManager — verifies the P0 fix UI works.
 * Tests: add key, unlock, delete, and the full encrypt→save→decrypt flow.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProviderManager, type ActiveProvider } from '../src/ui/ProviderManager.tsx';
import type { Repository } from '../src/core/storage/repository.ts';
import type { ProviderProfile } from '../src/core/domain/types.ts';

// Mock repository
const mockProfiles: ProviderProfile[] = [];
const mockRepo = {
  listProviderProfiles: vi.fn(() => mockProfiles),
  getProviderProfile: vi.fn((id: string) => mockProfiles.find((p) => p.id === id) || null),
  saveProviderProfile: vi.fn((data: Partial<ProviderProfile>) => {
    const profile: ProviderProfile = {
      id: `prof-${mockProfiles.length + 1}`,
      kind: data.kind || 'gemini',
      baseUrl: data.baseUrl || 'https://default.com',
      apiKeyEncrypted: data.apiKeyEncrypted || '',
      model: data.model || 'default-model',
    };
    mockProfiles.push(profile);
    return profile;
  }),
  deleteProviderProfile: vi.fn((id: string) => {
    const idx = mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      mockProfiles.splice(idx, 1);
      return true;
    }
    return false;
  }),
} as unknown as Repository;

const mockOnActivate = vi.fn();
const mockOnPassphrase = vi.fn();
const mockOnPersist = vi.fn().mockResolvedValue(undefined);

describe('ProviderManager component', () => {
  beforeEach(() => {
    mockProfiles.length = 0;
    mockOnActivate.mockClear();
    mockOnPassphrase.mockClear();
    mockOnPersist.mockClear();
    mockRepo.listProviderProfiles.mockClear();
    mockRepo.getProviderProfile.mockClear();
    mockRepo.saveProviderProfile.mockClear();
    mockRepo.deleteProviderProfile.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows empty state when no profiles exist', () => {
    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );
    expect(screen.getByText('No API keys saved. Add one to start chatting.')).toBeInTheDocument();
    expect(screen.getByText('+ Add Key')).toBeInTheDocument();
  });

  it('shows add key form when clicked', () => {
    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );
    fireEvent.click(screen.getByText('+ Add Key'));
    expect(screen.getByText('Add API Key')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('sk-… or AIza…')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Local unlock passphrase')).toBeInTheDocument();
  });

  it('saves a new API key with proper encryption', async () => {
    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );

    fireEvent.click(screen.getByText('+ Add Key'));

    // Fill in the form
    fireEvent.change(screen.getByPlaceholderText('sk-… or AIza…'), {
      target: { value: 'test-api-key-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Local unlock passphrase'), {
      target: { value: 'my-passphrase' },
    });

    // Click save
    fireEvent.click(screen.getByText('Save Key'));

    // Wait for async encryption + save
    await waitFor(() => {
      expect(screen.getByText('Key saved successfully.')).toBeInTheDocument();
    });

    // Verify saveProviderProfile was called
    expect(mockRepo.saveProviderProfile).toHaveBeenCalledTimes(1);
    expect(mockOnPersist).toHaveBeenCalled();

    // Verify the encrypted key was saved (not plaintext)
    const savedCall = mockRepo.saveProviderProfile.mock.calls[0][0];
    expect(savedCall.apiKeyEncrypted).not.toContain('test-api-key-123');
    expect(savedCall.kind).toBe('gemini');
  });

  it('activates provider after saving key', async () => {
    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );

    fireEvent.click(screen.getByText('+ Add Key'));
    fireEvent.change(screen.getByPlaceholderText('sk-… or AIza…'), {
      target: { value: 'activate-test-key' },
    });
    fireEvent.change(screen.getByPlaceholderText('Local unlock passphrase'), {
      target: { value: 'activate-pass' },
    });
    fireEvent.click(screen.getByText('Save Key'));

    await waitFor(() => {
      expect(mockOnActivate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'gemini',
          apiKeyEncrypted: expect.any(String),
        }),
      );
    });

    // Also verify passphrase was passed through
    expect(mockOnPassphrase).toHaveBeenCalledWith('activate-pass');
  });

  it('shows unlock form for saved profiles', async () => {
    // Pre-populate a profile
    const profile: ProviderProfile = {
      id: 'prof-1',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEncrypted: 'encrypted-blob',
      model: 'gpt-4o-mini',
    };
    mockProfiles.push(profile);

    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );

    // Should show the profile and unlock form
    await waitFor(() => {
      expect(screen.getByText('openai · gpt-4o-mini')).toBeInTheDocument();
    });
    expect(screen.getByText('Unlock Key')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter passphrase to unlock')).toBeInTheDocument();
  });

  it('deletes a profile', async () => {
    const profile: ProviderProfile = {
      id: 'prof-1',
      kind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKeyEncrypted: 'encrypted-blob',
      model: 'gemini-2.0-flash',
    };
    mockProfiles.push(profile);

    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockRepo.deleteProviderProfile).toHaveBeenCalledWith('prof-1');
    });
    expect(mockProfiles).toHaveLength(0);
  });

  it('passes correct props to onActivate when unlocking', async () => {
    // Encrypt a key properly
    const { encryptSecret } = await import('../src/core/providers/keyvault.ts');
    const encrypted = await encryptSecret('real-key', 'real-pass');

    const profile: ProviderProfile = {
      id: 'prof-unlock',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKeyEncrypted: encrypted,
      model: 'claude-3-5-sonnet',
    };
    mockProfiles.push(profile);

    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter passphrase to unlock')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter passphrase to unlock'), {
      target: { value: 'real-pass' },
    });
    fireEvent.click(screen.getByText('Unlock'));

    await waitFor(() => {
      expect(mockOnActivate).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'prof-unlock',
          kind: 'anthropic',
          model: 'claude-3-5-sonnet',
          apiKeyEncrypted: encrypted,
        }),
      );
    });
    expect(mockOnPassphrase).toHaveBeenCalledWith('real-pass');
  });

  it('fails unlock with wrong passphrase', async () => {
    const { encryptSecret } = await import('../src/core/providers/keyvault.ts');
    const encrypted = await encryptSecret('real-key', 'correct-pass');

    const profile: ProviderProfile = {
      id: 'prof-wrong',
      kind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKeyEncrypted: encrypted,
      model: 'gemini-2.0-flash',
    };
    mockProfiles.push(profile);

    render(
      <ProviderManager
        repo={mockRepo}
        onActivate={mockOnActivate}
        onPassphrase={mockOnPassphrase}
        onPersist={mockOnPersist}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter passphrase to unlock')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Enter passphrase to unlock'), {
      target: { value: 'wrong-pass' },
    });
    fireEvent.click(screen.getByText('Unlock'));

    await waitFor(() => {
      expect(screen.getByText('Passphrase incorrect. Cannot unlock key.')).toBeInTheDocument();
    });
    expect(mockOnActivate).not.toHaveBeenCalled();
  });
});
