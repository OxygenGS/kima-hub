/**
 * Music permissions are checked against the current user row on every request.
 * JWT role claims and stale cached authentication cannot grant new downloads.
 */
jest.mock('../../utils/db', () => ({
    prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock('../../utils/logger', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/db';
import { requireMusicPermission } from '../auth';

const findUser = prisma.user.findUnique as jest.Mock;

function ctx(user?: { id: string; username: string; role: string }) {
    const req = { user } as Request;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const next = jest.fn() as NextFunction;
    return { req, res, status, json, next };
}

describe('requireMusicPermission', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects missing authentication without a database call', async () => {
        const c = ctx();
        await requireMusicPermission('canRequestAlbums')(c.req, c.res, c.next);
        expect(c.status).toHaveBeenCalledWith(401);
        expect(findUser).not.toHaveBeenCalled();
        expect(c.next).not.toHaveBeenCalled();
    });

    it.each(['canRequestAlbums', 'canDownloadTracks'] as const)(
        'blocks a default user lacking %s', async (permission) => {
            findUser.mockResolvedValue({ role: 'user', canRequestAlbums: false, canDownloadTracks: false });
            const c = ctx({ id: 'u1', username: 'listener', role: 'user' });
            await requireMusicPermission(permission)(c.req, c.res, c.next);
            expect(c.status).toHaveBeenCalledWith(403);
            expect(c.json).toHaveBeenCalledWith(expect.objectContaining({ permission }));
            expect(c.next).not.toHaveBeenCalled();
        }
    );

    it('permits only the granted right for a normal user', async () => {
        findUser.mockResolvedValue({ role: 'user', canRequestAlbums: true, canDownloadTracks: false });
        const albums = ctx({ id: 'u1', username: 'listener', role: 'user' });
        await requireMusicPermission('canRequestAlbums')(albums.req, albums.res, albums.next);
        expect(albums.next).toHaveBeenCalledTimes(1);
        const tracks = ctx({ id: 'u1', username: 'listener', role: 'user' });
        await requireMusicPermission('canDownloadTracks')(tracks.req, tracks.res, tracks.next);
        expect(tracks.status).toHaveBeenCalledWith(403);
        expect(tracks.next).not.toHaveBeenCalled();
    });

    it('permits an administrator regardless of stored individual toggles', async () => {
        findUser.mockResolvedValue({ role: 'admin', canRequestAlbums: false, canDownloadTracks: false });
        const c = ctx({ id: 'admin', username: 'admin', role: 'admin' });
        await requireMusicPermission('canDownloadTracks')(c.req, c.res, c.next);
        expect(c.next).toHaveBeenCalledTimes(1);
    });

    it('rejects a role claim if the current database role has been demoted', async () => {
        findUser.mockResolvedValue({ role: 'user', canRequestAlbums: false, canDownloadTracks: false });
        const c = ctx({ id: 'u1', username: 'old-admin', role: 'admin' });
        await requireMusicPermission('canRequestAlbums')(c.req, c.res, c.next);
        expect(c.status).toHaveBeenCalledWith(403);
    });

    it('denies immediately after permissions are revoked', async () => {
        const c1 = ctx({ id: 'u1', username: 'listener', role: 'user' });
        findUser.mockResolvedValueOnce({ role: 'user', canRequestAlbums: true, canDownloadTracks: false });
        await requireMusicPermission('canRequestAlbums')(c1.req, c1.res, c1.next);
        expect(c1.next).toHaveBeenCalled();
        const c2 = ctx({ id: 'u1', username: 'listener', role: 'user' });
        findUser.mockResolvedValueOnce({ role: 'user', canRequestAlbums: false, canDownloadTracks: false });
        await requireMusicPermission('canRequestAlbums')(c2.req, c2.res, c2.next);
        expect(c2.status).toHaveBeenCalledWith(403);
    });

    it('denies a deleted user', async () => {
        findUser.mockResolvedValue(null);
        const c = ctx({ id: 'deleted', username: 'deleted', role: 'admin' });
        await requireMusicPermission('canRequestAlbums')(c.req, c.res, c.next);
        expect(c.status).toHaveBeenCalledWith(401);
    });

    it('fails closed if database lookup fails', async () => {
        findUser.mockRejectedValue(new Error('Database offline'));
        const c = ctx({ id: 'u1', username: 'listener', role: 'user' });
        await requireMusicPermission('canDownloadTracks')(c.req, c.res, c.next);
        expect(c.status).toHaveBeenCalledWith(500);
        expect(c.next).not.toHaveBeenCalled();
    });
});
