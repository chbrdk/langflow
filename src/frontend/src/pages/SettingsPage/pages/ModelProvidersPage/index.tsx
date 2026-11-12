import { useTranslation } from "react-i18next";
import CustomModelProviderShare from "@/customization/components/custom-model-provider-share";
import ModelProvidersContent from "@/modals/modelProviderModal/components/ModelProvidersContent";
import SettingsPageHeader from "@/pages/SettingsPage/components/SettingsPageHeader";

export default function ModelProvidersPage() {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-col gap-6">
      <SettingsPageHeader
        title={t("modelProviders.pageTitle")}
        description={t("modelProviders.pageDescription")}
      />
      <CustomModelProviderShare />
      <div className="flex w-full h-[calc(100vh-305px)] border rounded-lg overflow-hidden">
        <ModelProvidersContent modelType="all" />
      </div>
    </div>
  );
}
