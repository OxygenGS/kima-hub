import { Router } from "express";
import { prisma } from "../../utils/db";
import { subsonicOk, subsonicError, SubsonicError } from "../../utils/subsonicResponse";
import { wrap } from "./mappers";
import { mapSubsonicUser, requireSubsonicAdmin } from "./userHelpers";

export const profileRouter = Router();

profileRouter.all("/getUser.view", wrap(async (req, res) => {
    const requested = req.query.username as string | undefined;
    if (requested && requested !== req.user!.username && !requireSubsonicAdmin(req, res)) {
        return;
    }

    // Always read the persisted rights, not cached Subsonic credentials.
    const target = await prisma.user.findUnique({
        where: requested ? { username: requested } : { id: req.user!.id },
        select: { username: true, role: true, canDownloadTracks: true },
    });

    if (!target) {
        return subsonicError(req, res, SubsonicError.NOT_FOUND, "User not found");
    }

    return subsonicOk(req, res, {
        user: mapSubsonicUser(target),
    });
}));