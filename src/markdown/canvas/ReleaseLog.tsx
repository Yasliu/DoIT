import { Change, Changelog } from "@/registry/default/changelog/changelog";
import { APP_VERSION } from "../../lib/version";
import { Btn, Dialog } from "../ui";

const CHANGELOG_URL = "https://github.com/Yasliu/DoIT/blob/main/CHANGELOG.md";

/** What changed in this version, as a changelog figure. Shown once after an update. */
export function ReleaseLog({ onClose }: { onClose: () => void }) {
  const openChangelog = () => {
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(CHANGELOG_URL))
      .catch(() => window.open(CHANGELOG_URL, "_blank", "noopener,noreferrer"));
  };

  return (
    <Dialog title="what's new" onClose={onClose} width={620}>
      <Changelog version={`v${APP_VERSION}`} frame="none">
        <Change type="fix">Windows dock pill and quick note: the global shortcut toggles reliably, the pill no longer collapses in a flash, and the dock panel warms up on hover.</Change>
        <Change type="change">The emoji picker stays ready in the background, so it opens without a wait.</Change>
        <Change type="change">Shelf pickers stay centred in the window whatever the sidebar does.</Change>
        <Change type="add">A what's-new button in Settings.</Change>
        <Change type="add">Fedora .rpm installs update themselves, alongside .deb, AppImage and Windows.</Change>
      </Changelog>
      <div className="tm-rule-t mt-6 flex items-center justify-between pt-5">
        <Btn variant="ghost" onClick={openChangelog}>
          full changelog ↗
        </Btn>
        <Btn variant="primary" data-autofocus onClick={onClose}>
          got it
        </Btn>
      </div>
    </Dialog>
  );
}
