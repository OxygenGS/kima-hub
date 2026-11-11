import { getSpotifyTrackEmbed, parseSpotifyTrackEmbed } from "../downtifySpotifyEmbedEvidence";

const ID = "0123456789ABCDEFGHIJKL";
const other = "1111111111111111111111";
const page = (entity: Record<string, unknown>) =>
    '<html><script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({ props: {pageProps:{state:{data:{entity}}}}}) +
    '</script></html>';
const track = {
    type: "track", uri: "spotify:track:" + ID, id: ID,
    title: "Test Song", subtitle: "Test Artist", duration: 195000,
};
const response = (data: unknown, status = 200, ct = "text/html") => ({
    status, headers: {"content-type": ct}, data,
});

describe("Token-free, exact-ID Spotify embed evidence", () => {
    it("accepts only self-consistent exact Spotify track identity", () => {
        expect(parseSpotifyTrackEmbed(page(track), ID)).toEqual({
            state: "ready", track: {
                spotifyId: ID, title: "Test Song", artist: "Test Artist",
                durationMs: 195000, isrc: null,
            },
        });
    });

    it("parses the modern Spotify track embed with a full artists array and no subtitle", () => {
        const modern = {
            type: "track", id: ID, uri: "spotify:track:" + ID,
            name: "Test Song", artists: [
                { name: "Solo Artist", uri: "spotify:artist:0123456789ABCDEFGHIJKL" },
            ],
            duration: 195000, isPlayable: true,
        };
        expect(parseSpotifyTrackEmbed(page(modern),ID)).toEqual({
            state:"ready",
            track:{
                spotifyId:ID,title:"Test Song",artist:"Solo Artist",
                durationMs:195000,isrc:null,
            },
        });
    });

    it("retains every artist in a multi-credit embed rather than choosing only the first", () => {
        const modern = {
            type:"track",uri:"spotify:track:"+ID,id:ID,
            title:"Duet",artists:[
                {name:"Artist One",uri:"spotify:artist:0123456789ABCDEFGHIJKL"},
                {name:"Artist Two",uri:"spotify:artist:1111111111111111111111"},
            ],duration:210000,
        };
        expect(parseSpotifyTrackEmbed(page(modern),ID)).toMatchObject({
            state:"ready", track:{ artist:"Artist One; Artist Two",durationMs:210000 },
        });
    });

    it("fails closed on malformed, duplicate, conflicting or partial artist arrays", () => {
        for(const artists of [
            [], [{name:""}], [{name:"Artist One"},{}],
            [{name:"Artist One"},{name:"Artist One"}],
            [{name:"Artist One",uri:"spotify:artist:WRONG"}],
            [{name:"Artist One",uri:"spotify:track:"+ID}],
            "Artist One", Array.from({length:21},(_,i)=>({name:"Artist "+i})),
        ]) {
            expect(parseSpotifyTrackEmbed(page({...track,artists}),ID).state)
                .toBe("unavailable");
        }
    });

    it("accepts the name property when title is absent", () => {
        const { title: _title, ...entity } = track;
        expect(parseSpotifyTrackEmbed(page({...entity,name:"Name Track"}), ID))
            .toMatchObject({state:"ready",track:{title:"Name Track"}});
    });

    it("rejects a wrong entity URI, conflicting ID or conflicting titles", () => {
        expect(parseSpotifyTrackEmbed(page({...track,uri:"spotify:track:"+other}),ID).state)
            .toBe("identity_mismatch");
        expect(parseSpotifyTrackEmbed(page({...track,id:other}),ID).state)
            .toBe("identity_mismatch");
        expect(parseSpotifyTrackEmbed(page({...track,name:"Something Else"}),ID).state)
            .toBe("identity_mismatch");
    });

    it("rejects album pages, missing metadata, invalid and implausible duration", () => {
        for (const item of [
            {...track,type:"album"}, {...track,subtitle:""},
            {...track,duration:0}, {...track,duration:1.5},
            {...track,duration:9*60*60*1000}, {...track,title:""},
            {...track,uri:null},
        ]) expect(parseSpotifyTrackEmbed(page(item),ID).state).not.toBe("ready");
    });

    it("rejects malformed, duplicated, or oversized scripts", () => {
        const good=page(track);
        expect(parseSpotifyTrackEmbed(good+good,ID).state).toBe("unavailable");
        expect(parseSpotifyTrackEmbed(page({}) + "x".repeat(1024*1024),ID).state)
            .toBe("unavailable");
        expect(parseSpotifyTrackEmbed('<script id="__NEXT_DATA__">{not-json}</script>',ID).state)
            .toBe("unavailable");
        expect(parseSpotifyTrackEmbed(good,"not-an-id").state).toBe("unavailable");
    });

    it("only requests a fixed Spotify embed URL without redirects or access tokens", async () => {
        const get=jest.fn().mockResolvedValue(response(page(track)));
        expect(await getSpotifyTrackEmbed(ID,{get} as never)).toMatchObject({state:"ready"});
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][0]).toBe("https://open.spotify.com/embed/track/"+ID);
        expect(get.mock.calls[0][1]).toMatchObject({
            timeout:8000,maxRedirects:0,proxy:false,responseType:"text",
        });
    });

    it("fails closed on redirect, HTML error page, network error or unexpected MIME", async () => {
        const get=jest.fn()
            .mockResolvedValueOnce(response("<h1>Forbidden</h1>",403))
            .mockResolvedValueOnce(response(page(track),200,"application/json"))
            .mockRejectedValueOnce(new Error("offline"));
        for (let i=0;i<3;i++)
            expect((await getSpotifyTrackEmbed(ID,{get} as never)).state)
                .toBe("unavailable");
    });

    it("does not make any HTTP request for an invalid Spotify ID", async () => {
        const get=jest.fn();
        expect((await getSpotifyTrackEmbed("../../../etc",{get} as never)).state)
            .toBe("unavailable");
        expect(get).not.toHaveBeenCalled();
    });
});
