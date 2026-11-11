import MediaKindSwitcher from "@/shared/components/MediaKindSwitcher";

// Media hub shell: one kind switcher above every media listing page, so each
// MEDIA_PROVIDER_KINDS page is one click from the hub.
export default function MediaProvidersLayout({ children }) {
  return (
    <>
      <MediaKindSwitcher />
      {children}
    </>
  );
}
