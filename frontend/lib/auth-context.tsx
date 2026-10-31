"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
    useMemo,
    useCallback,
    useRef,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "./api";
import { getMusicPermissions } from "./music-permissions";
import { clearBrowserQueryCache } from "./query-client";
import { clearAccountMediaStorage } from "./storage-keys";

interface User {
    id: string;
    username: string;
    role: string;
    canRequestAlbums?: boolean;
    canDownloadTracks?: boolean;
    onboardingComplete?: boolean;
}

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: User | null;
    login: (
        username: string,
        password: string,
        token?: string
    ) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Paths reachable without being signed in. "/onboarding" is the first-run
// wizard, which runs before an account exists.
const publicPaths = ["/login", "/onboarding", "/sync", "/share"];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();
    // Reject late /auth/me responses after account changes or sign-out.
    const authEpochRef = useRef(0);

    // Refresh when the user returns to the tab and periodically while visible.
    // This reflects admin changes without forcing listeners to log out.
    // A failed refresh leaves the current session alone; the backend enforces
    // all permissions against the database on every protected request.
    const refreshUser = useCallback(async () => {
        const epoch = authEpochRef.current;
        const current = await api.getCurrentUser();
        if (authEpochRef.current === epoch) setUser(current);
    }, []);

    useEffect(() => {
        if (!isAuthenticated) return;
        const syncIfVisible = () => {
            if (document.visibilityState === "visible") {
                void refreshUser().catch(() => {});
            }
        };
        window.addEventListener("focus", syncIfVisible);
        document.addEventListener("visibilitychange", syncIfVisible);
        const interval = window.setInterval(syncIfVisible, 30_000);
        return () => {
            window.removeEventListener("focus", syncIfVisible);
            document.removeEventListener("visibilitychange", syncIfVisible);
            window.clearInterval(interval);
        };
    }, [isAuthenticated, refreshUser]);

    useEffect(() => {
        // Check if user has valid session on mount ONLY
        const checkAuth = async () => {
            const epoch = authEpochRef.current;
            try {
                const userData = await api.getCurrentUser();
                if (authEpochRef.current !== epoch) return;
                setUser(userData);
                setIsAuthenticated(true);

                // Check onboarding status - redirect if needed
                if (
                    userData.onboardingComplete === false &&
                    pathname !== "/onboarding"
                ) {
                    router.push("/onboarding");
                } else if (
                    userData.onboardingComplete &&
                    pathname === "/onboarding"
                ) {
                    router.push("/");
                }
            } catch {
                if (authEpochRef.current !== epoch) return;
                setIsAuthenticated(false);
                setUser(null);

                // If we're already on onboarding page, allow access
                if (pathname === "/onboarding") {
                    setIsLoading(false);
                    return;
                }

                // If not on a public path, check if we need onboarding
                if (!publicPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
                    // Check if any users exist in the system
                    try {
                        const status = await api.get<{ hasAccount: boolean }>(
                            "/onboarding/status"
                        );
                        if (authEpochRef.current !== epoch) return;

                        if (!status.hasAccount) {
                            // No users exist - redirect to onboarding
                            router.push("/onboarding");
                            return;
                        }
                    } catch {
                        // If onboarding cannot be checked, leave account setup alone.
                    }
                    // Do not redirect a user who signed in while this request was pending.
                    if (authEpochRef.current === epoch) router.push("/login");
                }
            } finally {
                if (authEpochRef.current === epoch) setIsLoading(false);
            }
        };

        checkAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    const login = useCallback(async (
        username: string,
        password: string,
        token?: string
    ) => {
        const epoch = ++authEpochRef.current;
        try {
            const userData = await api.login(username, password, token);

            if (userData.requires2FA) {
                // Wait for the actual second factor before changing account state.
                throw new Error("2FA token required");
            }
            if (authEpochRef.current !== epoch) return;

            // Old queries and local audiobook/podcast identities must not be
            // rendered for the newly authenticated account.
            await clearBrowserQueryCache();
            clearAccountMediaStorage();
            if (authEpochRef.current !== epoch) return;

            let authenticatedUser: User = userData;
            try {
                authenticatedUser = await api.getCurrentUser();
            } catch {
                // Keep the minimal login response; the backend enforces rights.
            }
            if (authEpochRef.current !== epoch) return;
            setUser(authenticatedUser);
            setIsAuthenticated(true);

            if (authenticatedUser.onboardingComplete === false) {
                router.push("/onboarding");
            } else {
                router.push("/");
            }
        } catch (error: unknown) {
            console.error("[AUTH] Login failed:", error instanceof Error ? error.message : error);
            throw error;
        } finally {
            if (authEpochRef.current === epoch) setIsLoading(false);
        }
    }, [router]);

    const logout = useCallback(async () => {
        const epoch = ++authEpochRef.current;
        // Hide the private interface and stop audio/SSE immediately.
        setIsAuthenticated(false);
        setUser(null);
        try {
            await api.logout();
        } catch {
            // Offline or expired server session: still remove local credentials.
            // Server-side revocation may not have completed in this case.
        } finally {
            if (authEpochRef.current === epoch) {
                api.clearToken();
                clearAccountMediaStorage();
                await clearBrowserQueryCache();
                if (authEpochRef.current === epoch) {
                    setIsLoading(false);
                    router.replace("/login");
                }
            }
        }
    }, [router]);

    const contextValue = useMemo(() => ({
        isAuthenticated,
        isLoading,
        user,
        login,
        logout,
    }), [isAuthenticated, isLoading, user, login, logout]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

/** UI-only permission check. Never use this in place of server-side auth. */
export function useMusicPermissions() {
    const { user } = useAuth();
    return getMusicPermissions(user);
}
