// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAppUpdate, type AppUpdate } from "./useAppUpdate";

const { api } = vi.hoisted(() => ({
  api: {
    checkForUpdate: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    downloadedUpdate: vi.fn(async (): Promise<string | null> => null),
    getSettings: vi.fn(async () => ({ last_seen_version: "1.2.4" })),
    patchSettings: vi.fn(async () => undefined),
  },
}));
vi.mock("../api/tauriBridge", () => ({ tauriApi: api }));

it("downloads on the first press, restarts on the next, and retries only the step that failed", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const found = { rid: 7, version: "1.2.5", notes: "- Faster search" };
  api.checkForUpdate.mockResolvedValue({ kind: "available", update: found });
  let progress!: (percent: number | null) => void;
  let finishDownload!: () => void;
  api.downloadUpdate.mockImplementation((_update, onProgress) => {
    progress = onProgress;
    return new Promise<void>((resolve) => (finishDownload = resolve));
  });
  api.installUpdate.mockRejectedValueOnce("The update needs your password to install.").mockReturnValue(new Promise(() => {}));

  const notify = vi.fn();
  let update!: AppUpdate;
  const Probe = () => {
    update = useAppUpdate(notify);
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  expect(update.state).toEqual({ status: "none" });

  // Settings' "Check for updates": the result shows on the icon, not in a toast.
  await act(async () => void window.dispatchEvent(new CustomEvent("doit:check-updates")));
  expect(update.state).toEqual({ status: "available", version: "1.2.5", notes: "- Faster search" });
  expect(notify).not.toHaveBeenCalled();

  await act(async () => update.act());
  expect(update.state).toMatchObject({ status: "downloading", percent: null });
  expect(api.downloadUpdate).toHaveBeenCalledWith(found, expect.any(Function));
  act(() => progress(42));
  expect(update.state).toMatchObject({ status: "downloading", percent: 42 });
  await act(async () => finishDownload());
  expect(update.state).toMatchObject({ status: "ready", version: "1.2.5" });
  expect(api.installUpdate).not.toHaveBeenCalled();

  await act(async () => update.act());
  expect(update.state).toMatchObject({ status: "error", reason: "The update needs your password to install." });

  // Retrying installs what was downloaded; it does not download again.
  await act(async () => update.act());
  expect(update.state).toMatchObject({ status: "installing" });
  expect(api.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(api.installUpdate).toHaveBeenCalledTimes(2);

  act(() => root.unmount());
});

it("offers the restart straight away when an earlier page already downloaded the update", async () => {
  // The canvas page is rebuilt after time in the dock; the backend still holds its download.
  const found = { rid: 8, version: "1.2.5", notes: "" };
  api.checkForUpdate.mockResolvedValue({ kind: "available", update: found });
  api.downloadedUpdate.mockResolvedValue("1.2.5");
  api.downloadUpdate.mockClear();
  api.installUpdate.mockReset().mockReturnValue(new Promise(() => {}));

  let update!: AppUpdate;
  const Probe = () => {
    update = useAppUpdate(vi.fn());
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  await act(async () => void window.dispatchEvent(new CustomEvent("doit:check-updates")));
  expect(update.state).toMatchObject({ status: "ready", version: "1.2.5" });

  await act(async () => update.act());
  expect(api.downloadUpdate).not.toHaveBeenCalled();
  expect(api.installUpdate).toHaveBeenCalledWith(found);

  act(() => root.unmount());
});
