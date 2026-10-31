import type { SoulseekResult } from "@/features/search/types";

interface SearchSession {
    results: SoulseekResult[];
    complete: boolean;
    seen: Set<string>;
}

type Listener = () => void;

/** The backend streams at most 200 hits per search. Bound client memory too. */
const MAX_RESULTS_PER_SEARCH = 200;
const MAX_SESSIONS = 50;
const MAX_DISCARDED_IDS = 100;

class SearchResultStore {
    private sessions = new Map<string, SearchSession>();
    private listeners = new Map<string, Set<Listener>>();
    // Ignore late SSE packets for searches the user already abandoned.
    private discarded = new Set<string>();

    private session(searchId: string): SearchSession | null {
        if (this.discarded.has(searchId)) return null;
        const existing = this.sessions.get(searchId);
        if (existing) return existing;
        if (this.sessions.size >= MAX_SESSIONS) {
            const oldest = this.sessions.keys().next().value;
            if (oldest) this.clear(oldest);
        }
        const created = { results: [], complete: false, seen: new Set<string>() };
        this.sessions.set(searchId, created);
        return created;
    }

    push(searchId: string, results: SoulseekResult[]): void {
        const session = this.session(searchId);
        if (!session || !Array.isArray(results)) return;
        let changed = false;
        for (const result of results) {
            if (session.results.length >= MAX_RESULTS_PER_SEARCH) break;
            if (!result || typeof result.username !== "string" || typeof result.path !== "string") continue;
            const key = `${result.username.toLowerCase()}\0${result.path}`;
            if (session.seen.has(key)) continue;
            session.seen.add(key);
            session.results.push(result);
            changed = true;
        }
        if (changed) this.notify(searchId);
    }

    complete(searchId: string): void {
        // Completion can beat the POST /search response and the first result.
        // Store it even for an empty search so the spinner does not run for 45s.
        const session = this.session(searchId);
        if (!session || session.complete) return;
        session.complete = true;
        this.notify(searchId);
    }

    getSession(searchId: string): SearchSession | undefined {
        return this.sessions.get(searchId);
    }

    subscribe(searchId: string, listener: Listener): () => void {
        let set = this.listeners.get(searchId);
        if (!set) {
            set = new Set();
            this.listeners.set(searchId, set);
        }
        set.add(listener);
        return () => {
            set!.delete(listener);
            if (set!.size === 0) this.listeners.delete(searchId);
        };
    }

    clear(searchId: string): void {
        this.sessions.delete(searchId);
        this.listeners.delete(searchId);
        this.discarded.add(searchId);
        if (this.discarded.size > MAX_DISCARDED_IDS) {
            const oldest = this.discarded.values().next().value;
            if (oldest) this.discarded.delete(oldest);
        }
    }

    private notify(searchId: string): void {
        const set = this.listeners.get(searchId);
        if (set) {
            for (const listener of set) listener();
        }
    }
}

export const searchResultStore = new SearchResultStore();
