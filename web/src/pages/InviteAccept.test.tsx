import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRefreshSession, mockValidateInvite, mockAcceptInvite } = vi.hoisted(() => ({
  mockRefreshSession: vi.fn(),
  mockValidateInvite: vi.fn(),
  mockAcceptInvite: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    invites: {
      validate: mockValidateInvite,
      accept: mockAcceptInvite,
    },
  },
}));

import { useAuth } from '@/hooks/useAuth';
import { InviteAcceptPage } from './InviteAccept';

const mockedUseAuth = vi.mocked(useAuth);

function renderInvitePage(initialPath = '/invite/test-token') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/docs" element={<div>Documents Home</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('InviteAcceptPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
      isSuperAdmin: false,
      impersonating: null,
      refreshSession: mockRefreshSession,
      login: vi.fn(),
      logout: vi.fn(),
      endImpersonation: vi.fn(),
    } as ReturnType<typeof useAuth>);
  });

  it('shows an invalid invite state when token validation fails', async () => {
    mockValidateInvite.mockResolvedValue({
      success: false,
      error: { message: 'Invite revoked' },
    });

    renderInvitePage();

    await waitFor(() => {
      expect(screen.getByText('Invalid Invite')).toBeInTheDocument();
    });
    expect(screen.getByText(/may have been revoked/i)).toBeInTheDocument();
  });

  it('shows a login CTA for existing invited users who are not signed in', async () => {
    mockValidateInvite.mockResolvedValue({
      success: true,
      data: {
        workspaceName: 'Ship Ops',
        invitedBy: 'Ada Admin',
        role: 'member',
        email: 'person@agency.gov',
        userExists: true,
      },
    });

    renderInvitePage();

    await waitFor(() => {
      expect(screen.getByText("You're Invited!")).toBeInTheDocument();
    });

    const loginLink = screen.getByRole('link', { name: 'Log In to Accept' });
    expect(loginLink).toHaveAttribute('href', '/login?redirect=/invite/test-token');
    expect(screen.getByText(/Please log in to accept this invite/i)).toBeInTheDocument();
  });

  it('creates a new account from the invite flow and navigates into the app', async () => {
    mockValidateInvite.mockResolvedValue({
      success: true,
      data: {
        workspaceName: 'Ship Ops',
        invitedBy: 'Ada Admin',
        role: 'admin',
        email: 'new.person@agency.gov',
        userExists: false,
      },
    });
    mockAcceptInvite.mockResolvedValue({
      success: true,
    });
    mockRefreshSession.mockResolvedValue(undefined);

    renderInvitePage();

    await waitFor(() => {
      expect(screen.getByText(/Create an account to accept this invite/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'New Person' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account & Accept' }));

    await waitFor(() => {
      expect(mockAcceptInvite).toHaveBeenCalledWith('test-token', {
        name: 'New Person',
        password: 'StrongPass1',
      });
    });
    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalledOnce();
      expect(screen.getByText('Documents Home')).toBeInTheDocument();
    });
  });
});
