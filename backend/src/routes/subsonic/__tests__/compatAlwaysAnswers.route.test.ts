/**
 * The compat router answers every request even when a dependency rejects; in
 * Express 4 a rejected handler otherwise leaves the client hanging. A missing
 * fix shows up as a timeout.
 */

jest.mock('../../../utils/db', () => ({
    prisma: {
        track: { findUnique: jest.fn() },
        album: { findUnique: jest.fn() },
        playlist: { findUnique: jest.fn() },
        user: { findUnique: jest.fn() },
    },
}));

jest.mock('../../../utils/logger', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/shareService', () => {
    class ShareError extends Error {
        code: string;
        constructor(message: string, code: string) {
            super(message);
            this.code = code;
        }
    }
    return { createShareLink: jest.fn(), ShareError };
});

import express from 'express';
import request from 'supertest';
import { compatRouter } from '../compat';
import { prisma } from '../../../utils/db';
import { createShareLink } from '../../../services/shareService';

function makeApp() {
    const app = express();
    app.use((req: any, _res, next) => {
        req.user = { id: 'user-1', username: 'tester', role: 'user' };
        next();
    });
    app.use('/rest', compatRouter);
    return app;
}

describe('compat router answers even when a dependency fails', () => {
    let app: express.Application;

    beforeAll(() => { app = makeApp(); });
    beforeEach(() => {
        jest.clearAllMocks();
        (prisma.track.findUnique as jest.Mock).mockResolvedValue({ id: 'tr-1' });
        (prisma.album.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.playlist.findUnique as jest.Mock).mockResolvedValue(null);
    });

    it('createShare answers when the share service throws something unexpected', async () => {
        // Not a ShareError, so the handler's own error branch does not apply.
        (createShareLink as jest.Mock).mockRejectedValue(
            new Error('P2034: transaction conflict on ShareLink'),
        );

        const res = await request(app).get('/rest/createShare.view?id=tr-1');

        expect(res.status).toBe(200); // Subsonic reports errors inside a 200 envelope
        expect(res.text).toContain('error');
        // The raw driver message names tables and columns; it must not be the
        // text handed to the client.
        expect(res.text).not.toContain('P2034');
        expect(res.text).not.toContain('ShareLink');
    });

    it('createShare answers when a lookup BEFORE the try block rejects', async () => {
        // These three lookups sit outside the handler's try, so only the
        // wrapper can answer for them.
        (prisma.track.findUnique as jest.Mock).mockRejectedValue(
            new Error('connection terminated unexpectedly'),
        );

        const res = await request(app).get('/rest/createShare.view?id=tr-1');

        expect(res.status).toBe(200);
        expect(res.text).toContain('error');
        expect(res.text).not.toContain('connection terminated unexpectedly');
        expect(res.text).toContain('Internal server error');
    });

    it('getAvatar answers when the user lookup rejects', async () => {
        (prisma.user.findUnique as jest.Mock).mockRejectedValue(
            new Error('pool timeout'),
        );

        const res = await request(app).get('/rest/getAvatar.view?username=tester');

        expect(res.status).toBe(200);
        expect(res.text).toContain('error');
        expect(res.text).not.toContain('pool timeout');
        expect(res.text).toContain('Internal server error');
    });

    it('still returns a real share on the happy path', async () => {
        (createShareLink as jest.Mock).mockResolvedValue({
            token: 'tok-123',
            url: '/share/tok-123',
        });

        const res = await request(app).get('/rest/createShare.view?id=tr-1');

        expect(res.status).toBe(200);
        expect(res.text).toContain('tok-123');
        expect(res.text).not.toContain('error');
    });
});


describe('OpenSubsonic client format names match stored source audio types', () => {
    const app = makeApp();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it.each([
        ['audio/mpeg', 'mp3', true],
        ['MPEG 1 Layer 3', 'MP3', true],
        ['audio/flac', 'flac', true],
        ['audio/x-flac', 'FLAC', true],
        ['FLAC', 'audio/flac', true],
        ['audio/mp4', 'm4a', true],
        ['audio/aac', 'aac', true],
        ['audio/ogg', 'ogg', true],
        ['audio/mpeg', 'raw', true],
        ['audio/flac', 'mp3', false],
        ['application/octet-stream', 'mp3', false],
    ])('%s requested as %s is direct playable: %s', async (mime, format, expected) => {
        (prisma.track.findUnique as jest.Mock).mockResolvedValue({ mime });
        const res = await request(app)
            .get('/rest/getTranscodeDecision.view')
            .query({ mediaId: 'song-1', mediaType: 'music', format, f: 'json' });
        const envelope = res.body['subsonic-response'];
        expect(res.status).toBe(200);
        expect(envelope.status).toBe('ok');
        expect(envelope.transcodeDecision.canDirectPlay).toBe(expected);
        expect(envelope.transcodeDecision.canTranscode).toBe(true);
        expect(envelope.transcodeDecision.transcodeParams)
            .toBe(expected ? '' : 'format=' + format.toLowerCase());
    });

    it('returns a protocol error for an unknown song rather than claiming playback', async () => {
        (prisma.track.findUnique as jest.Mock).mockResolvedValue(null);
        const res = await request(app).get('/rest/getTranscodeDecision.view')
            .query({ mediaId: 'missing', mediaType: 'music', format: 'mp3', f: 'json' });
        expect(res.status).toBe(200);
        expect(res.body['subsonic-response'].status).toBe('failed');
        expect(res.body['subsonic-response'].error.code).toBe(70);
    });

    it('handles codec aliasing in the XML response as well as JSON', async () => {
        (prisma.track.findUnique as jest.Mock).mockResolvedValue({ mime: 'audio/mpeg' });
        const res = await request(app).get('/rest/getTranscodeDecision.view')
            .query({ mediaId: 'song-1', mediaType: 'music', format: 'mp3' });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('xml');
        expect(res.text).toContain('<canDirectPlay>true</canDirectPlay>');
        expect(res.text).toContain('status="ok"');
    });
});
