# Install DoIT on Linux

DoIT for Linux is built and tested on **Fedora with GNOME**. Fedora gets an `.rpm` that updates itself; every other distribution gets an `.AppImage`, which is experimental for now.

Both are on the [latest release page](https://github.com/Yasliu/DoIT/releases/latest). They need a 64-bit (x86_64) PC.

## Fedora (recommended)

1. Download `DoIT-<version>-1.x86_64.rpm` from the release page.
2. Open a terminal in your Downloads folder and install it:

   ```sh
   sudo dnf install ./DoIT-*.x86_64.rpm
   ```

3. Open **DoIT** from the app grid.

DoIT checks for updates by itself, like on Windows. When one is ready it asks for your password once to install it.

To uninstall:

```sh
sudo dnf remove do-it
```

## Other distributions (experimental)

1. Download `DoIT_<version>_amd64.AppImage` from the release page.
2. Make it executable and run it:

   ```sh
   chmod +x DoIT_*.AppImage
   ./DoIT_*.AppImage
   ```

The AppImage runs on distributions from 2022 onwards (Ubuntu 22.04, Debian 12, Fedora 36 and newer). If it does not start, install FUSE 2: `libfuse2` on Ubuntu and Debian (`libfuse2t64` on Ubuntu 24.04), `fuse-libs` on Fedora.

To get a menu entry and icon, open the AppImage with [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever) or AppImageLauncher. The AppImage does not update itself: download the new one when a release comes out. To uninstall, delete the file (or remove it in Gear Lever).

It has only been tested on Fedora, so some things may not work yet. Please report what breaks (see below).

## Where your notes live

- **Notes:** plain Markdown files in `~/Documents/DoIT/Notes` (your Documents folder in your own language, if it has another name). Change the folder in Settings → Notes folder.
- **Settings:** `~/.config/DoIT/settings.json`.

Uninstalling DoIT leaves both in place.

## Good to know

- **No tray icon on GNOME:** stock GNOME has no tray, so DoIT stays in your dock instead. Right-click it for **Open Canvas**, **Switch to Docking Mode** and **Quit DoIT**. On desktops with a tray (KDE, or GNOME with the AppIndicator extension), DoIT hides to the tray as on Windows.
- **A shortcut from anywhere:** bind `doit --toggle` to a key in your system settings (GNOME: Settings → Keyboard → Custom Shortcuts) to switch between the canvas and the docking pill. `--canvas`, `--dock` and `--quit` work too. With the AppImage, use the AppImage's full path instead of `doit`.
- **Look:** pick one of seven themes, light, dark or following your system, in Settings → Appearance. **Glass** lets the desktop show through; **Boxy** squares the corners.
- **Wayland:** DoIT runs through XWayland so the docking pill can place itself and stay on top. With fractional scaling this can look slightly soft. Starting it with `DOIT_NATIVE_WAYLAND=1 doit` makes it sharp, but GNOME then decides where the pill goes and doesn't keep it on top.

## Reporting a problem

Open an issue at [github.com/Yasliu/DoIT/issues](https://github.com/Yasliu/DoIT/issues) and put **Linux** in the title. It helps to include:

- your distribution and version, and your desktop (GNOME, KDE, …);
- whether you use the `.rpm` or the `.AppImage`, and DoIT's version (Settings → About);
- what you did, what you expected, and what happened;
- any output from starting DoIT in a terminal (`doit`, or the AppImage's path).
