import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { api } from "@/controllers/API/api";
import { cn } from "@/utils/utils";

const SHARE_API = "/api/v1/shared-provider-credentials";

interface ProviderField {
  label?: string;
  configured?: boolean;
  value?: string;
}

interface ProviderCredential {
  provider?: string;
  variables?: ProviderField[];
}

interface SharePayload {
  owner?: string;
  share_with_everyone?: boolean;
  credentials?: ProviderCredential[];
}

function isRefusal(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  return status === 403 || status === 404;
}

function configuredLabels(provider: ProviderCredential): string[] {
  return (provider.variables ?? [])
    .filter((field) => field.configured && field.label)
    .map((field) => field.label as string);
}

export default function CustomModelProviderShare() {
  const { t } = useTranslation();
  const [share, setShare] = useState<SharePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<SharePayload>(SHARE_API)
      .then((response) => {
        if (!cancelled) setShare(response.data);
      })
      .catch((requestError: unknown) => {
        if (!cancelled && !isRefusal(requestError)) {
          setError(t("providerShare.error"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!share) {
    return error ? (
      <p className="text-sm text-destructive" role="status">
        {error}
      </p>
    ) : null;
  }

  const enabled = Boolean(share.share_with_everyone);

  const updateShare = async (next: boolean) => {
    setSaving(true);
    setError("");
    try {
      const response = await api.put<SharePayload>(SHARE_API, {
        share_with_everyone: next,
      });
      setShare(response.data);
    } catch {
      setError(t("providerShare.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">{t("providerShare.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("providerShare.description")}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <span>{t("providerShare.toggle")}</span>
          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={(checked) => {
              void updateShare(checked);
            }}
            aria-label={t("providerShare.toggle")}
          />
        </label>
      </div>
      <p className="text-sm" role="status">
        {enabled
          ? t("providerShare.on")
          : t("providerShare.off", { owner: share.owner ?? "" })}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="flex flex-col gap-1 text-sm">
        {(share.credentials ?? []).map((provider) => {
          const labels = configuredLabels(provider);
          const name = provider.provider ?? "";
          return (
            <li
              key={name}
              className={cn(!labels.length && "text-muted-foreground")}
            >
              {labels.length
                ? `${name}: ${labels.join(", ")}`
                : `${name}: ${t("providerShare.missing")}`}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
