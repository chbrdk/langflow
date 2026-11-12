import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api } from "@/controllers/API/api";
import SettingsPageHeader from "@/pages/SettingsPage/components/SettingsPageHeader";
import useAuthStore from "@/stores/authStore";

const USERS_API = "/api/v1/users/";

interface Account {
  id: string;
  username: string;
  is_active: boolean;
  is_superuser: boolean;
  last_login_at: string | null;
}

function accountFrom(row: Record<string, unknown>): Account {
  return {
    id: String(row.id ?? ""),
    username: String(row.username ?? ""),
    is_active: Boolean(row.is_active),
    is_superuser: Boolean(row.is_superuser),
    last_login_at:
      typeof row.last_login_at === "string" ? row.last_login_at : null,
  };
}

function errorText(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
}

export default function AccountsPage() {
  const { t } = useTranslation();
  const current = useAuthStore((state) => state.userData);
  const isSuperuser = Boolean(current?.is_superuser);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeNow, setActiveNow] = useState(true);
  const [makeSuperuser, setMakeSuperuser] = useState(false);
  const [nextPassword, setNextPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    const response = await api.get(`${USERS_API}?limit=200`);
    const rows = (response.data?.users ?? []) as Record<string, unknown>[];
    setAccounts(rows.map(accountFrom));
  }

  useEffect(() => {
    if (!isSuperuser) return;
    let cancelled = false;
    api
      .get(`${USERS_API}?limit=200`)
      .then((response) => {
        if (cancelled) return;
        const rows = (response.data?.users ?? []) as Record<string, unknown>[];
        setAccounts(rows.map(accountFrom));
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(errorText(error, t("accountAdmin.error")));
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperuser]);

  const selected = accounts.find((account) => account.id === selectedId);
  const isSelf = selected?.id === current?.id;

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setStatus("");
    try {
      const created = await api.post(USERS_API, {
        username: username.trim(),
        password,
      });
      const account = accountFrom(created.data as Record<string, unknown>);
      setPassword("");
      await api.patch(`${USERS_API}${account.id}`, {
        is_active: activeNow,
        is_superuser: makeSuperuser,
      });
      setUsername("");
      setMakeSuperuser(false);
      setActiveNow(true);
      setSelectedId(account.id);
      setStatus(t("accountAdmin.created", { username: account.username }));
      await load();
    } catch (error) {
      setStatus(errorText(error, t("accountAdmin.error")));
    }
  }

  async function patchAccount(body: {
    is_active?: boolean;
    is_superuser?: boolean;
  }) {
    if (!selected) return;
    try {
      await api.patch(`${USERS_API}${selected.id}`, body);
      setStatus(t("accountAdmin.saved"));
      await load();
    } catch (error) {
      setStatus(errorText(error, t("accountAdmin.error")));
    }
  }

  async function savePassword() {
    if (!selected || !nextPassword) return;
    try {
      await api.patch(`${USERS_API}${selected.id}`, { password: nextPassword });
      setNextPassword("");
      setStatus(t("accountAdmin.saved"));
    } catch (error) {
      setStatus(errorText(error, t("accountAdmin.error")));
    }
  }

  async function removeAccount() {
    if (!selected || isSelf) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.delete(`${USERS_API}${selected.id}`);
      setSelectedId("");
      setConfirmDelete(false);
      setStatus(t("accountAdmin.saved"));
      await load();
    } catch (error) {
      setStatus(errorText(error, t("accountAdmin.error")));
    }
  }

  if (!isSuperuser) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("accountAdmin.forbidden")}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <SettingsPageHeader
        title={t("accountAdmin.pageTitle")}
        description={t("accountAdmin.pageDescription")}
      />
      <form className="flex flex-wrap items-end gap-3" onSubmit={createAccount}>
        <label className="grid gap-1 text-sm">
          {t("accountAdmin.username")}
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("accountAdmin.password")}
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={activeNow}
            onCheckedChange={(value) => setActiveNow(value === true)}
          />
          {t("accountAdmin.activeNow")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={makeSuperuser}
            onCheckedChange={(value) => setMakeSuperuser(value === true)}
          />
          {t("accountAdmin.superuser")}
        </label>
        <Button type="submit" size="sm">
          {t("accountAdmin.create")}
        </Button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2">{t("accountAdmin.username")}</th>
            <th>{t("accountAdmin.active")}</th>
            <th>{t("accountAdmin.superuser")}</th>
            <th>{t("accountAdmin.lastLogin")}</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id}>
              <td className="py-2">
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => {
                    setSelectedId(account.id);
                    setConfirmDelete(false);
                    setNextPassword("");
                  }}
                >
                  {account.username}
                  {account.id === current?.id
                    ? ` (${t("accountAdmin.you")})`
                    : ""}
                </button>
              </td>
              <td>
                {account.is_active
                  ? t("accountAdmin.active")
                  : t("accountAdmin.inactive")}
              </td>
              <td>
                {account.is_superuser
                  ? t("accountAdmin.roleSuperuser")
                  : t("accountAdmin.roleUser")}
              </td>
              <td>
                {account.last_login_at
                  ? new Date(account.last_login_at).toLocaleString()
                  : t("accountAdmin.never")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.is_active}
              disabled={isSelf}
              onCheckedChange={(value) =>
                patchAccount({ is_active: value === true })
              }
            />
            {t("accountAdmin.active")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.is_superuser}
              disabled={isSelf}
              onCheckedChange={(value) =>
                patchAccount({ is_superuser: value === true })
              }
            />
            {t("accountAdmin.roleSuperuser")}
          </label>
          <label className="grid gap-1 text-sm">
            {t("accountAdmin.newPassword")}
            <Input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <Button type="button" size="sm" onClick={savePassword}>
            {t("accountAdmin.setPassword")}
          </Button>
          {isSelf ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={removeAccount}
            >
              {confirmDelete
                ? t("accountAdmin.confirmRemove", {
                    username: selected.username,
                  })
                : t("accountAdmin.remove")}
            </Button>
          )}
        </div>
      ) : null}
      <p className="min-h-5 text-sm text-muted-foreground" role="status">
        {status}
      </p>
    </div>
  );
}
