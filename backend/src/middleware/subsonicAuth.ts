import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../utils/db";
import { subsonicError, SubsonicError } from "../utils/subsonicResponse";
import { findApiKeyUser } from "../services/users/apiKeyStore";

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
    // Clients MUST NOT send u= alongside apiKey=. Reject mixed methods instead
    // of quietly ignoring credentials, which would make auth ambiguous.
    if (apiKey !== undefined) {
        if (username !== undefined || password !== undefined || tokenMd5 !== undefined || req.query.s !== undefined) {
            subsonicError(req, res, 43, "Multiple conflicting authentication mechanisms provided");
            return;
        }
        if (!apiKey || typeof apiKey !== "string") {
            subsonicError(req, res, SubsonicError.INVALID_API_KEY, "Invalid API key");
            return;
        }
        try {
            const keyUser = await findApiKeyUser(apiKey);
            if (!keyUser) {
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
        // MD5 salted token auth would require storing recoverable secrets; Kima
        // deliberately only stores bcrypt passwords and hashed API keys.
        if (tokenMd5 !== undefined || req.query.s !== undefined) {
            subsonicError(req, res, SubsonicError.TOKEN_AUTH_NOT_SUPPORTED,
                "Token authentication is not supported. Use an API key or the password field.");
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
