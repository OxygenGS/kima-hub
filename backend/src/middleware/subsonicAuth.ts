import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../utils/db";
import { subsonicError, SubsonicError } from "../utils/subsonicResponse";
import { findApiKeyUser, findApiKeyUserBySaltedToken } from "../services/users/apiKeyStore";

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** Which credential authenticated this Subsonic request. changePassword.view
             * refuses a self-change made with an API key. */
            subsonicAuthMethod?: "password" | "apiKey";
        }
    }
}

export async function subsonicAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const username = req.query.u as string | undefined;
    const apiKey = req.query.apiKey as string | undefined;
    const password = req.query.p as string | undefined;
    const tokenMd5 = req.query.t as string | undefined;

    // OpenSubsonic API-key authentication identifies the user through the key.
    // Modern clients omit u=; older clients may also send their username.
    // Verify it matches the key owner when provided. Reject combined p=/t=/s=
    // authentication, but not endpoint-specific fields such as password=.
    if (apiKey !== undefined) {
        if (tokenMd5 !== undefined || req.query.s !== undefined || req.query.p !== undefined) {
            subsonicError(req, res, 43, "Multiple conflicting authentication mechanisms provided");
            return;
        }
        if (!apiKey || typeof apiKey !== "string") {
            subsonicError(req, res, SubsonicError.INVALID_API_KEY, "Invalid API key");
            return;
        }
        try {
            const keyUser = await findApiKeyUser(apiKey);
            if (!keyUser || (username !== undefined && keyUser.username !== username)) {
                subsonicError(req, res, SubsonicError.INVALID_API_KEY, "Invalid API key");
                return;
            }
            req.user = keyUser;
            req.subsonicAuthMethod = "apiKey";
            next();
        } catch (_err) {
            subsonicError(req, res, SubsonicError.GENERIC, "Authentication error");
        }
        return;
    }

    if (!username || typeof username !== "string") {
        subsonicError(req, res, SubsonicError.MISSING_PARAM, "Required parameter is missing: u");
        return;
    }

    try {
        // Standard Subsonic token authentication used by Symfonium/Feishin
        // when their "legacy authentication" toggle is OFF. The secret is an
        // independently revocable app key, never the user's account password.
        if (tokenMd5 !== undefined || req.query.s !== undefined) {
            if (password !== undefined) {
                subsonicError(req, res, 43, "Multiple conflicting authentication mechanisms provided");
                return;
            }
            const salt = req.query.s;
            if (typeof tokenMd5 !== "string" || !/^[a-f0-9]{32}$/i.test(tokenMd5) ||
                typeof salt !== "string" || salt.length < 6 || salt.length > 256) {
                subsonicError(req, res, SubsonicError.WRONG_CREDENTIALS, "Invalid Subsonic token or salt");
                return;
            }
            const keyUser = await findApiKeyUserBySaltedToken(username, tokenMd5, salt);
            if (!keyUser) {
                subsonicError(req, res, SubsonicError.WRONG_CREDENTIALS,
                    "Invalid token. Use a newly generated Kima Native Apps key for token authentication.");
                return;
            }
            req.user = keyUser;
            req.subsonicAuthMethod = "apiKey";
            next();
            return;
        }

        // p= accepts an API key first: native clients (Amperfy, Symfonium, DSub) can
        // only carry a token in their password field.
        if (password) {
            // Subsonic "enc:" prefix means hex-encoded password
            const plainPassword = password.startsWith("enc:")
                ? Buffer.from(password.slice(4), "hex").toString("utf8")
                : password;

            // An indexed hash lookup whose cost does not depend on the username, so it
            // adds no enumeration timing gap. Scoped to the claimed user. A key skips the
            // 2FA check below: it was minted from a 2FA-verified session.
            const keyUser = await findApiKeyUser(plainPassword);
            if (keyUser && keyUser.username === username) {
                req.user = keyUser;
                req.subsonicAuthMethod = "apiKey";
                next();
                return;
            }

            // Not a key for this user (wrong value, or a key that belongs
            // to someone else) -- fall through to the account password.
            const user = await prisma.user.findUnique({
                where: { username },
                select: { id: true, username: true, role: true, passwordHash: true, twoFactorEnabled: true },
            });

            // Timing-safe: always run bcrypt.compare to prevent username enumeration
            const dummyHash = "$2b$10$invalidhashfortimingsafety.00000000000000000000";
            let valid = false;
            if (user) {
                valid = await bcrypt.compare(plainPassword, user.passwordHash);
            } else {
                await bcrypt.compare(plainPassword, dummyHash);
            }

            if (!valid || !user) {
                subsonicError(req, res, SubsonicError.WRONG_CREDENTIALS, "Wrong username or password");
                return;
            }

            // Subsonic cannot ask for a second factor, so a 2FA account cannot log in
            // with its password here; it must use an API key. The message says so, since
            // OpenSubsonic has no dedicated error code for this.
            if (user.twoFactorEnabled) {
                subsonicError(
                    req,
                    res,
                    SubsonicError.WRONG_CREDENTIALS,
                    "2FA is on. Create an app key in Kima Settings and use it here instead of your password.",
                );
                return;
            }

            req.user = { id: user.id, username: user.username, role: user.role };
            req.subsonicAuthMethod = "password";
            next();
            return;
        }

        subsonicError(req, res, SubsonicError.MISSING_PARAM, "Required parameter is missing: p or apiKey");
    } catch (_err) {
        subsonicError(req, res, SubsonicError.GENERIC, "Authentication error");
    }
}
