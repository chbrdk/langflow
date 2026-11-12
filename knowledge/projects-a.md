# projects-a nachziehen

Dieser Zweig ist Langflow `v1.13.*` plus unsere Oberfläche. `main` bleibt der Spiegel von Upstream und bekommt keine eigenen Commits.

Die Python-Erweiterung liegt nicht in diesem Repo. Sie heißt `langflow-shared-credentials` und wird beim Start des Containers nach `/app/langflow/vendor` gelegt. Checkout: `/Users/christoph.bordeck/Desktop/GITHUB/langflow-shared-credentials`. Ablauf der Instanz: dort `knowledge/langflow-fork.md`.

## Ablauf bei einem neuen Tag

Nur veröffentlichte Tags `v1.13.*`, nicht jeder Commit auf `main`.

```bash
git fetch upstream tag v1.13.x
git merge v1.13.x
```

Konflikte sind in den Dateien unten zu erwarten. Danach:

```bash
cd src/frontend
npx jest src/customization src/hooks/flows/__tests__ src/pages/SettingsPage/pages/AccountsPage --no-coverage
node scripts/check-i18n.mjs
git push origin projects-a
```

Dann das Image neu bauen und den Langflow-Service darauf zeigen, wie in der Erweiterung dokumentiert. Die Erweiterung selbst nur neu einpacken, wenn sich eine der Python-Schnittstellen unten geändert hat.

## Was die Oberfläche zusätzlich kann

- Modellanbieter: das Konto `admin` schaltet „Mit allen Nutzern teilen“. Geheimnisse zeigt die Seite nicht.
- Projekt- und Flow-Menü: Freigabe an ein Konto dieser Instanz. Ein Flow teilt das Projekt, nicht nur den Flow.
- Beim Teilen stehen Konten oben, mit denen man schon ein Projekt geteilt hat. Die Suche trifft den Namen.
- Einstellungen → Benutzer, nur für Superuser: anlegen, aktiv, Superuser, Passwort, löschen. Die eigene Sitzung lässt sich dort nicht aussperren. Die Rolle ist Benutzer oder Superuser, keine Viewer-Rolle.
- Zeichenfläche: Mauszeiger und Name der anderen, ohne Rahmen um die Ansicht. Gezogene Knoten wandern mit und werden je Knoten in den gespeicherten Graphen gemischt. Wer denselben Knoten festhält, behält ihn bis zum Loslassen.

## Dateien, die uns gehören

Upstream ändert diese Stellen. Beim Merge unseren Anteil behalten und den neuen Upstream-Code daneben lassen.

| Stelle | Unser Anteil |
| --- | --- |
| `src/frontend/src/customization/components/custom-model-provider-share.tsx` | Schalter der Anbieter-Freigabe |
| `src/frontend/src/customization/components/custom-resource-share-action.tsx` | Teilen im Projektmenü |
| `src/frontend/src/customization/components/custom-flow-share-action.tsx` | Teilen im Flow-Menü |
| `src/frontend/src/customization/components/project-share-dialog.tsx` | Dialog, Vorschläge, Freigabe-API |
| `src/frontend/src/customization/utils/custom-should-skip-auth-refresh.ts` | 403 auf unseren APIs darf nicht ausloggen |
| `src/frontend/src/pages/SettingsPage/pages/ModelProvidersPage/index.tsx` | Einbindung des Schalters |
| `src/frontend/src/pages/SettingsPage/pages/AccountsPage/index.tsx` | Benutzerverwaltung |
| `src/frontend/src/pages/SettingsPage/use-settings-sidebar-items.tsx` | Eintrag nur für Superuser |
| `src/frontend/src/routes.tsx` | Route `accounts` |
| `src/frontend/src/pages/FlowPage/components/flowPresence/index.tsx` | Mauszeiger und Namen |
| `src/frontend/src/pages/FlowPage/components/PageComponent/index.tsx` | `FlowPresence` in `ReactFlow`; Speichern einer Bewegung nur, wenn der Kanal sie nicht schon geschrieben hat |
| `src/frontend/src/hooks/flows/use-flow-presence.ts` | Kanal, Zeiger, fremde Änderungen |
| `src/frontend/src/hooks/flows/presence.ts` | Zeiger in Flow-Koordinaten und die Regel, wann ein gespeicherter Graph übernommen wird |
| `src/frontend/src/hooks/flows/presence-sync.ts` | Graph übernehmen, ohne die Kamera zu verschieben |
| `src/frontend/src/hooks/flows/graph-ops.ts` | Bewegungen und Struktur vergleichen und anwenden |
| `src/frontend/src/hooks/flows/graph-channel.ts` | Senden, solange der Kanal offen ist |
| `src/frontend/src/hooks/flows/use-save-flow.ts` | Nach einem gespeicherten Graphen `notifyFlowSaved` |
| `src/frontend/src/locales/*.json` | Schlüssel `projectShare.*`, `accountAdmin.*`, `presence.alsoHere` nur anhängen, nicht umsortieren |
| `Dockerfile.projects-a` | Baut nur das Frontend über `langflowai/langflow:1.13.2` |
| `.github/workflows/projects-a-image.yml` | nur `workflow_dispatch`, ghcr.io bleibt privat |

Neue Sprachschlüssel in `de.json` deutsch, in den übrigen Sprachen der englische Text. Platzhalter müssen in allen Dateien gleich heißen.

## Python-Schnittstellen der Erweiterung

Wenn ein Release diese Namen verschiebt, die Erweiterung anpassen und neu in den Startbefehl packen. Ein reines Frontend-Release lässt den Startbefehl stehen.

- `langflow.services.auth.utils.get_current_user_for_websocket`
- `langflow.services.auth.utils.get_current_active_user`
- `langflow.services.deps.session_scope`
- `langflow.api.v1.authz_route_dependencies.get_authorized_flow_for_read`
- `langflow.api.v1.authz_route_dependencies.get_authorized_flow_for_write`
- `langflow.services.database.models.user.model.User`
- `langflow.services.database.models.variable.model.Variable`
- `langflow.services.database.models.auth.authz.AuthzShare`
- `langflow.services.database.models.flow.model.Flow` (`data`, `version_token`, `locked`)
- `lfx.services.deps.injectable_session_scope`

Die Erweiterung hängt an `LANGFLOW_AUTHZ_ENABLED=true` und ersetzt `variable_service` und `authorization_service`. `SUPPORTS_API_KEY_SCOPES` bleibt aus.
