"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { SettingsSection, SettingsInput, SettingsSelect, SettingsToggle } from "../ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import { api } from "@/lib/api";
import { InlineStatus, StatusType } from "@/components/ui/InlineStatus";
import { Button } from "@/components/ui/Button";

interface User {
    id: string;
    username: string;
    role: "user" | "admin";
    canRequestAlbums: boolean;
    canDownloadTracks: boolean;
    createdAt: string;
}

export function UserManagementSection() {
    const { user: currentUser } = useAuth();
    const { t, locale } = useLanguage();
    const [users, setUsers] = useState<User[]>([]);
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState<"user" | "admin">("user");
    const [creating, setCreating] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [createStatus, setCreateStatus] = useState<StatusType>("idle");
    const [createMessage, setCreateMessage] = useState("");
    const [deleteStatus, setDeleteStatus] = useState<StatusType>("idle");
    const [deleteMessage, setDeleteMessage] = useState("");
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [permissionError, setPermissionError] = useState<Record<string, string>>({});

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await api.get<User[]>("/auth/users");
            setUsers(data);
        } catch (error) {
            console.error("Failed to load users:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newUsername.trim() || newPassword.length < 6) {
            setCreateStatus("error");
            setCreateMessage("Username required, password 6+ chars");
            return;
        }

        setCreating(true);
        setCreateStatus("loading");
        try {
            await api.post("/auth/create-user", {
                username: newUsername.trim(),
                password: newPassword,
                role: newRole,
            });
            setCreateStatus("success");
            setCreateMessage("Created");
            setNewUsername("");
            setNewPassword("");
            setNewRole("user");
            loadUsers();
        } catch (error: unknown) {
            setCreateStatus("error");
            setCreateMessage(error instanceof Error ? error.message : "Failed");
        } finally {
            setCreating(false);
        }
    };

    const updatePermission = async (
        target: User,
        permission: "canRequestAlbums" | "canDownloadTracks",
        enabled: boolean
    ) => {
        if (updatingUserId !== null || target.role !== "user") return;
        setUpdatingUserId(target.id);
        setPermissionError((previous) => ({ ...previous, [target.id]: "" }));
        try {
            const updated = await api.patch<User>(`/auth/users/${target.id}/permissions`, {
                [permission]: enabled,
            });
            setUsers((previous) => previous.map((user) =>
                user.id === target.id ? { ...user, ...updated } : user
            ));
        } catch (error: unknown) {
            setPermissionError((previous) => ({
                ...previous,
                [target.id]: error instanceof Error ? error.message : t("Unable to update permissions"),
            }));
        } finally {
            setUpdatingUserId(null);
        }
    };

    // Each opening of the dialog starts clean: a status from an earlier delete
    // must not show against another user.
    const openDelete = (userId: string) => {
        setDeleteStatus("idle");
        setDeleteMessage("");
        setConfirmDelete(userId);
    };
    const closeDelete = () => {
        setDeleteStatus("idle");
        setDeleteMessage("");
        setConfirmDelete(null);
    };

    const handleDelete = async (userId: string) => {
        setDeleteStatus("loading");
        try {
            await api.delete(`/auth/users/${userId}`);
            closeDelete();
            loadUsers();
        } catch (error: unknown) {
            setDeleteStatus("error");
            setDeleteMessage(error instanceof Error ? error.message : "Failed");
        }
    };

    if (currentUser?.role !== "admin") {
        return null;
    }

    return (
        <>
            <SettingsSection
                id="users"
                title={t("User Management")}
                description={t("Manage users who can access this instance")}
                showSeparator={false}
            >
                <div className="py-4 px-4 bg-white/5 rounded-lg border border-white/10 mb-4">
                    <h3 className="text-xs text-[var(--text-secondary)] mb-3">{t("Create New User")}</h3>
                    <div className="space-y-3">
                        <div className="flex gap-3">
                            <SettingsInput
                                value={newUsername}
                                onChange={setNewUsername}
                                placeholder={t("Username")}
                                className="flex-1"
                            />
                            <SettingsInput
                                type="password"
                                value={newPassword}
                                onChange={setNewPassword}
                                placeholder={t("Password (6+ chars)")}
                                className="flex-1"
                            />
                        </div>
                        <div className="inline-flex gap-3 items-center">
                            <SettingsSelect
                                value={newRole}
                                onChange={(v) => setNewRole(v as "user" | "admin")}
                                options={[
                                    { value: "user", label: t("User") },
                                    { value: "admin", label: t("Admin") },
                                ]}
                            />
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleCreate}
                                disabled={creating || !newUsername.trim() || newPassword.length < 6}
                            >
                                {creating ? t("Creating...") : t("Create")}
                            </Button>
                            <InlineStatus
                                status={createStatus}
                                message={translate(locale, createMessage)}
                                onClear={() => setCreateStatus("idle")}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    {loading ? (
                        <div className="py-4 text-xs text-[var(--text-muted)]">{t("Loading users...")}</div>
                    ) : users.length === 0 ? (
                        <div className="py-4 text-xs text-[var(--text-muted)]">{t("No users found")}</div>
                    ) : (
                        users.map((user) => (
                            <div
                                key={user.id}
                                className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-brand">
                                        {user.username[0].toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-white">
                                            {user.username}
                                            {currentUser?.id === user.id && (
                                                <span className="text-xs text-[var(--text-muted)] ml-2">({t("you")})</span>
                                            )}
                                        </div>
                                        <div className="text-xs tabular-nums text-[var(--text-muted)]">
                                            {t(user.role === "admin" ? "Admin" : "User")}
                                        </div>
                                        {user.role === "user" && (
                                            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                                                <div className="flex items-center gap-2">
                                                    <SettingsToggle
                                                        label={`${t("Allow")} ${user.username} ${t("to request albums")}`}
                                                        checked={user.canRequestAlbums === true}
                                                        disabled={updatingUserId !== null}
                                                        onChange={(enabled) => void updatePermission(user, "canRequestAlbums", enabled)}
                                                    />
                                                    <span className="text-xs text-[var(--text-secondary)]">{t("Request albums")}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <SettingsToggle
                                                        label={`${t("Allow")} ${user.username} ${t("to download tracks")}`}
                                                        checked={user.canDownloadTracks === true}
                                                        disabled={updatingUserId !== null}
                                                        onChange={(enabled) => void updatePermission(user, "canDownloadTracks", enabled)}
                                                    />
                                                    <span className="text-xs text-[var(--text-secondary)]">{t("Download tracks")}</span>
                                                </div>
                                                {permissionError[user.id] && (
                                                    <p role="alert" className="w-full text-xs text-danger-light">
                                                        {translate(locale, permissionError[user.id])}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {currentUser?.id !== user.id && (
                                    <button
                                        onClick={() => openDelete(user.id)}
                                        className="p-2 text-[var(--text-muted)] hover:text-danger-light transition-colors"
                                        aria-label={`${t("Delete user")}: ${user.username}`}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </SettingsSection>

            <Modal
                isOpen={!!confirmDelete}
                onClose={closeDelete}
                title={t("Delete User")}
            >
                <div className="space-y-4">
                    <p className="text-xs text-[var(--text-secondary)]">
                        {t("Delete user")} {users.find((u) => u.id === confirmDelete)?.username ?? t("this user")} {t("and everything they made? This cannot be undone.")}
                    </p>
                    <div className="flex gap-2 justify-end items-center">
                        <InlineStatus
                            status={deleteStatus}
                            message={translate(locale, deleteMessage)}
                            onClear={() => setDeleteStatus("idle")}
                        />
                        <Button variant="ghost" size="sm" onClick={closeDelete}>
                            {t("Cancel")}
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={() => confirmDelete && handleDelete(confirmDelete)}
                            disabled={deleteStatus === "loading"}
                        >
                            {t("Delete")}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
