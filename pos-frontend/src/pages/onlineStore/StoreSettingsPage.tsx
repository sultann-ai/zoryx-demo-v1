import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { SiteSettings, SiteSettingsInput } from "../../api/onlineStore";
import { Button, Card, FormActions, Input, Textarea } from "../../components/ui";
import { OnlineStoreHeader } from "../../components/onlineStore/OnlineStoreHeader";
import { SavedTick } from "../../components/onlineStore/SavedTick";
import { useSavedFlash } from "../../components/onlineStore/useSavedFlash";
import { useSiteSettings, useUpdateSiteSettings } from "../../hooks/useOnlineStore";
import { cleanWhatsappNumber } from "../../lib/whatsapp";
import { OrderingSwitchCard } from "./OrderingSwitchCard";
import { OrderTypesCard } from "./OrderTypesCard";

type TextKey =
  | "shopNameEn" | "shopNameUr" | "taglineEn" | "taglineUr"
  | "phone" | "whatsappNumber"
  | "addressEn" | "addressUr" | "mapUrl"
  | "openingHoursEn" | "openingHoursUr"
  | "announcementEn" | "announcementUr"
  | "facebookUrl" | "instagramUrl" | "tiktokUrl";

// These can be left empty (and are then cleared on the website); everything else is required.
const OPTIONAL_KEYS: TextKey[] = ["announcementEn", "announcementUr", "facebookUrl", "instagramUrl", "tiktokUrl"];
const URL_KEYS: TextKey[] = ["mapUrl", "facebookUrl", "instagramUrl", "tiktokUrl"];

const LABELS: Record<TextKey, string> = {
  shopNameEn: "Shop name (English)",
  shopNameUr: "Shop name (Urdu)",
  taglineEn: "Tagline (English)",
  taglineUr: "Tagline (Urdu)",
  phone: "Phone number",
  whatsappNumber: "WhatsApp number",
  addressEn: "Address (English)",
  addressUr: "Address (Urdu)",
  mapUrl: "Map link",
  openingHoursEn: "Opening hours (English)",
  openingHoursUr: "Opening hours (Urdu)",
  announcementEn: "Announcement (English)",
  announcementUr: "Announcement (Urdu)",
  facebookUrl: "Facebook page",
  instagramUrl: "Instagram page",
  tiktokUrl: "TikTok page",
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-meta text-ink-muted">{hint}</p>}
    </div>
  );
}

export function StoreSettingsPage() {
  const { data: settings, isLoading, isError } = useSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const [draft, setDraft] = useState<Partial<Record<TextKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { isVisible: showSaved, flash } = useSavedFlash(4000);

  const serverValue = (key: TextKey): string => (settings ? ((settings[key as keyof SiteSettings] as string | null) ?? "") : "");
  const value = (key: TextKey): string => draft[key] ?? serverValue(key);
  const set = (key: TextKey, next: string) => setDraft((previous) => ({ ...previous, [key]: next }));
  const changedKeys = (Object.keys(draft) as TextKey[]).filter((key) => (draft[key] ?? "").trim() !== serverValue(key));

  function input(key: TextKey, extra: { dir?: "rtl"; placeholder?: string; type?: string; inputMode?: "numeric" | "tel" } = {}) {
    return (
      <Input
        id={`setting-${key}`}
        value={value(key)}
        onChange={(event) => set(key, event.target.value)}
        {...(extra.dir ? { dir: extra.dir, lang: "ur" } : {})}
        {...(extra.placeholder ? { placeholder: extra.placeholder } : {})}
        {...(extra.inputMode ? { inputMode: extra.inputMode } : {})}
        type={extra.type ?? "text"}
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload: SiteSettingsInput = {};
    for (const key of changedKeys) {
      const raw = key === "whatsappNumber" ? cleanWhatsappNumber(value(key)) : value(key).trim();
      if (raw.length === 0) {
        if (!OPTIONAL_KEYS.includes(key)) {
          setFormError(`${LABELS[key]} can't be empty.`);
          return;
        }
        (payload as Record<string, string | null>)[key] = null;
        continue;
      }
      if (key === "whatsappNumber" && !/^[1-9]\d{7,14}$/.test(raw)) {
        setFormError("WhatsApp number must be digits only, with the country code. Example: 923001234567");
        return;
      }
      if (URL_KEYS.includes(key) && !isHttpUrl(raw)) {
        setFormError(`${LABELS[key]} must be a full link starting with https://`);
        return;
      }
      (payload as Record<string, string | null>)[key] = raw;
    }
    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      await updateMutation.mutateAsync(payload);
      setDraft({});
      flash();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Could not save the settings."));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <OnlineStoreHeader title="Store settings" description="The shop details customers see on the website." />

      <OrderingSwitchCard />

      <OrderTypesCard />

      {isLoading && <p className="text-body text-ink-muted">Loading settings…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load the settings.</p>}

      {settings && (
        <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
          <Card title="Shop info">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="setting-shopNameEn" label={LABELS.shopNameEn}>{input("shopNameEn")}</Field>
              <Field id="setting-shopNameUr" label={LABELS.shopNameUr}>{input("shopNameUr", { dir: "rtl" })}</Field>
              <Field id="setting-taglineEn" label={LABELS.taglineEn}>{input("taglineEn")}</Field>
              <Field id="setting-taglineUr" label={LABELS.taglineUr}>{input("taglineUr", { dir: "rtl" })}</Field>
            </div>
          </Card>

          <Card title="Contact">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="setting-phone" label={LABELS.phone}>{input("phone", { type: "tel", inputMode: "tel", placeholder: "0300 1234567" })}</Field>
              <Field
                id="setting-whatsappNumber"
                label={LABELS.whatsappNumber}
                hint="Digits only, with the country code, no + and no spaces. Example: 923001234567"
              >
                <Input
                  id="setting-whatsappNumber"
                  inputMode="numeric"
                  value={value("whatsappNumber")}
                  onChange={(event) => set("whatsappNumber", event.target.value)}
                  onBlur={() => set("whatsappNumber", cleanWhatsappNumber(value("whatsappNumber")))}
                  placeholder="923001234567"
                />
              </Field>
            </div>
          </Card>

          <Card title="Address and map">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="setting-addressEn" label={LABELS.addressEn}>
                <Textarea id="setting-addressEn" value={value("addressEn")} onChange={(event) => set("addressEn", event.target.value)} rows={3} />
              </Field>
              <Field id="setting-addressUr" label={LABELS.addressUr}>
                <Textarea id="setting-addressUr" dir="rtl" lang="ur" value={value("addressUr")} onChange={(event) => set("addressUr", event.target.value)} rows={3} />
              </Field>
              <div className="md:col-span-2">
                <Field id="setting-mapUrl" label={LABELS.mapUrl} hint="In Google Maps, open your shop, tap Share, then Copy link.">
                  {input("mapUrl", { type: "url", placeholder: "https://maps.google.com/…" })}
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Opening hours">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="setting-openingHoursEn" label={LABELS.openingHoursEn}>
                <Textarea id="setting-openingHoursEn" value={value("openingHoursEn")} onChange={(event) => set("openingHoursEn", event.target.value)} rows={2} />
              </Field>
              <Field id="setting-openingHoursUr" label={LABELS.openingHoursUr}>
                <Textarea id="setting-openingHoursUr" dir="rtl" lang="ur" value={value("openingHoursUr")} onChange={(event) => set("openingHoursUr", event.target.value)} rows={2} />
              </Field>
            </div>
          </Card>

          <Card title="Announcement">
            <p className="mb-3 text-body text-ink-muted">A short notice shown at the top of the website (for example, a holiday closure). Leave both empty to show nothing.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="setting-announcementEn" label={LABELS.announcementEn}>{input("announcementEn")}</Field>
              <Field id="setting-announcementUr" label={LABELS.announcementUr}>{input("announcementUr", { dir: "rtl" })}</Field>
            </div>
          </Card>

          <Card title="Social links">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="setting-facebookUrl" label={LABELS.facebookUrl}>{input("facebookUrl", { type: "url", placeholder: "https://facebook.com/…" })}</Field>
              <Field id="setting-instagramUrl" label={LABELS.instagramUrl}>{input("instagramUrl", { type: "url", placeholder: "https://instagram.com/…" })}</Field>
              <Field id="setting-tiktokUrl" label={LABELS.tiktokUrl}>{input("tiktokUrl", { type: "url", placeholder: "https://tiktok.com/@…" })}</Field>
            </div>
          </Card>

          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}

          <FormActions className="items-center">
            <Button type="submit" variant="primary" disabled={updateMutation.isPending || changedKeys.length === 0}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
            <SavedTick isVisible={showSaved} />
          </FormActions>
        </form>
      )}
    </div>
  );
}
