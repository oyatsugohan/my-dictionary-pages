/**
 * Frontend client for Authentication APIs
 */

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

const AUTH_API_REGISTER = "/api/auth/register";
const AUTH_API_LOGIN = "/api/auth/login";

// Get session from localStorage
export const getStoredSession = (): AuthSession | null => {
  const stored = localStorage.getItem("auth_session");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Save session to localStorage
export const storeSession = (session: AuthSession) => {
  localStorage.setItem("auth_session", JSON.stringify(session));
};

// Clear session
export const clearSession = () => {
  localStorage.removeItem("auth_session");
};

// Register
export const registerUser = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(AUTH_API_REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true };
    } else {
      return { success: false, error: data.error || "Registration failed" };
    }
  } catch (err) {
    return { success: false, error: "Network error" };
  }
};

// Login
export const loginUser = async (username: string, password: string): Promise<{ success: boolean; session?: AuthSession; error?: string }> => {
  try {
    const response = await fetch(AUTH_API_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (response.ok) {
      const session: AuthSession = {
        token: data.token,
        user: data.user,
      };
      storeSession(session);
      return { success: true, session };
    } else {
      return { success: false, error: data.error || "Login failed" };
    }
  } catch (err) {
    return { success: false, error: "Network error" };
  }
};
