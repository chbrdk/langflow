import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/controllers/API/api";

const SHARES_API = "/api/v1/authz/shares/";
const LOOKUP_API = "/api/v1/project-shares/lookup";
const SUGGEST_API = "/api/v1/project-shares/suggestions";
const LEVELS = ["read", "execute", "write", "admin"] as const;

type ShareLevel = (typeof LEVELS)[number];

interface ShareRow {
  id: string;
  resource_type: string;
  resource_id: string;
  target_name?: string | null;
  target_id?: string | null;
  permission_level: ShareLevel | string;
}

interface FlowRecord {
  folder_id?: string | null;
}

interface SuggestedUser {
  id: string;
  username: string;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export function ProjectShareDialog({
  open,
  onOpenChange,
  projectId,
  flowId,
  resourceName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  flowId?: string;
  resourceName?: string;
}) {
  const { t } = useTranslation();
  const [resolvedProjectId, setResolvedProjectId] = useState(projectId ?? "");
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [username, setUsername] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [level, setLevel] = useState<ShareLevel>("write");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("");
    const load = async () => {
      let targetId = projectId ?? "";
      if (!targetId && flowId) {
        const flow = await api.get<FlowRecord>(`/api/v1/flows/${flowId}`);
        targetId = flow.data.folder_id ?? "";
      }
      if (!targetId) {
        if (!cancelled) setStatus(t("projectShare.error"));
        return;
      }
      if (!cancelled) setResolvedProjectId(targetId);
      const response = await api.get<ShareRow[]>(
        `${SHARES_API}?resource_type=project&resource_id=${targetId}&limit=200`,
      );
      if (!cancelled) setShares(response.data ?? []);
    };
    load().catch(() => {
      if (!cancelled) setStatus(t("projectShare.error"));
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, flowId]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      api
        .get<{ users?: SuggestedUser[] }>(SUGGEST_API, {
          params: {
            q: username,
            ...(resolvedProjectId ? { resource_id: resolvedProjectId } : {}),
          },
        })
        .then((response) => {
          const taken = new Set(
            shares.map((share) => share.target_id).filter(Boolean),
          );
          setSuggestions(
            (response.data.users ?? []).filter(
              (person) => !taken.has(person.id),
            ),
          );
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [open, username, resolvedProjectId, shares]);

  const grant = async () => {
    setBusy(true);
    setStatus("");
    try {
      let accountId = "";
      try {
        const lookup = await api.get<{ id: string }>(LOOKUP_API, {
          params: { username },
        });
        accountId = lookup.data.id;
      } catch (error) {
        setStatus(
          statusOf(error) === 404
            ? t("projectShare.missingUser")
            : t("projectShare.error"),
        );
        return;
      }
      await api.post(SHARES_API, {
        resource_type: "project",
        resource_id: resolvedProjectId,
        scope: "user",
        target_id: accountId,
        permission_level: level,
      });
      setUsername("");
      setStatus(t("projectShare.saved"));
      const response = await api.get<ShareRow[]>(
        `${SHARES_API}?resource_type=project&resource_id=${resolvedProjectId}&limit=200`,
      );
      setShares(response.data ?? []);
    } catch (error) {
      const statusCode = statusOf(error);
      setStatus(
        statusCode === 403 || statusCode === 404
          ? t("projectShare.rejected")
          : t("projectShare.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (shareId: string) => {
    setBusy(true);
    try {
      await api.delete(`${SHARES_API}${shareId}`);
      setShares((current) => current.filter((share) => share.id !== shareId));
    } catch {
      setStatus(t("projectShare.error"));
    } finally {
      setBusy(false);
    }
  };

  const levelLabels: Record<ShareLevel, string> = {
    read: t("projectShare.read"),
    execute: t("projectShare.execute"),
    write: t("projectShare.write"),
    admin: t("projectShare.admin"),
  };
  const levelLabel = (value: string) =>
    value in levelLabels ? levelLabels[value as ShareLevel] : value;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {flowId ? t("projectShare.flowTitle") : t("projectShare.title")}
          </DialogTitle>
          <DialogDescription>
            {resourceName ? `${resourceName}. ` : ""}
            {flowId ? `${t("projectShare.flowHint")} ` : ""}
            {t("projectShare.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void grant();
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("projectShare.username")}
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              required
            />
          </label>
          {suggestions.length > 0 ? (
            <ul
              className="flex flex-col gap-1"
              aria-label={t("projectShare.suggestions")}
            >
              {suggestions.map((person) => (
                <li key={person.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setUsername(person.username)}
                  >
                    {person.username}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("projectShare.level")}
            <select
              className="rounded-md border bg-transparent px-2 py-1.5"
              value={level}
              onChange={(event) => setLevel(event.target.value as ShareLevel)}
            >
              {LEVELS.map((item) => (
                <option key={item} value={item}>
                  {levelLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy || !resolvedProjectId}>
            {t("projectShare.submit")}
          </Button>
        </form>
        {status ? (
          <p className="text-sm" role="status">
            {status}
          </p>
        ) : null}
        <ul className="flex flex-col gap-2 text-sm">
          {shares.length === 0 ? (
            <li className="text-muted-foreground">{t("projectShare.empty")}</li>
          ) : (
            shares.map((share) => (
              <li
                key={share.id}
                className="flex items-center justify-between gap-3"
              >
                <span>
                  {share.target_name || share.target_id} ·{" "}
                  {levelLabel(share.permission_level)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void revoke(share.id);
                  }}
                >
                  {t("projectShare.remove")}
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectShareMenuItem({
  projectId,
  flowId,
  resourceName,
}: {
  projectId?: string;
  flowId?: string;
  resourceName?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer text-xs"
        data-testid="btn-share-project"
        onSelect={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        <IconComponent name="Share2" className="mr-2 h-4 w-4" />
        {t("projectShare.menu")}
      </DropdownMenuItem>
      <ProjectShareDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        flowId={flowId}
        resourceName={resourceName}
      />
    </>
  );
}
