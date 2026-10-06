# Hac-Kit

A beginner-friendly cybersecurity training desktop app built with Tauri 2,
React, TypeScript, and Rust. It includes a macro recorder, hacker's dictionary,
Nmap scanner, local brute-force simulations, phishing training, a hash cracker,
and a tool explorer.

Use security features only on systems you own or have explicit permission to
test. The brute-force demos are local simulations, not attacks on real accounts.

## Prerequisites

Windows is the primary setup described below.

- [Git](https://git-scm.com/downloads) to clone the repository.
- [Node.js](https://nodejs.org/) 22 LTS (22.12 or newer), including npm.
- [Rust](https://rustup.rs/) stable, including Cargo. On Windows, use the default
  MSVC toolchain.
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/):
  select **Desktop development with C++**, including the MSVC compiler and a
  Windows SDK.
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/):
  normally already installed on Windows 10/11.

Restart your terminal after installing tools so PATH changes take effect.
For macOS or Linux, install the corresponding native dependencies from the
[Tauri 2 prerequisites guide](https://v2.tauri.app/start/prerequisites/).
Global input recording and shortcuts depend on OS permissions and desktop
support; Linux Wayland may restrict these features.

### Optional: Nmap

Install [Nmap](https://nmap.org/download.html) to use the Nmap Scanner. Other
features do not require it. Follow the installer's Npcap instructions on Windows
if you need packet-capture-based scan features.

The app checks PATH and the standard Windows Nmap installation directories.
For a custom Windows installation, set `NMAP_HOME` to the folder containing
`nmap.exe`, then restart the app.

## Run the desktop app from source

Open PowerShell and run:

```powershell
git clone https://github.com/ppNutt/Hac-Kit.git
Set-Location .\Hac-Kit
npm ci
npm run tauri -- dev
```

If you already cloned the project, open a terminal in the directory containing
`package.json`, then run the last two commands.

The Tauri command starts the Vite frontend and Rust backend, then opens the
**Hac-Kit desktop window**. The first launch can take several minutes while Cargo
downloads and compiles dependencies. Subsequent launches are usually faster.
Keep the terminal open; press **Ctrl+C in that terminal** to stop the development
process.

> `npm run dev` starts only the frontend at `http://localhost:1420`. It is not the
> full app: browser-only mode cannot run Tauri backend commands, global shortcuts,
> input recording, or Nmap scans. Use `npm run tauri -- dev` for working features.

Frontend edits normally update automatically. After backend changes, let Tauri
finish recompiling; if necessary, stop and rerun the development command. Simply
reopening an old installed executable does not load changes made to the source.

## Auto Clicker / macro recorder

1. Open **Auto Clicker**.
2. Press **Ctrl+C** to start recording, perform your mouse/keyboard actions, then
   press **Ctrl+C** again to stop recording. The Record button also works.
3. Choose **Movement speed** and optionally enable **Loop movement until stopped**.
4. Press **Ctrl+P** to start playback. Press **Ctrl+P again to stop**, including
   during a loop and while another app is focused. The Start/Stop button also works.

These are global shortcuts while Hac-Kit is running, so Ctrl+C may conflict with
copying in other apps. Change either shortcut in the **Keybinds** panel if needed.
When stopping the development process, focus its terminal and use Ctrl+C there.

The Start button and playback shortcut use the same speed and loop settings.
Settings and the recording stay in memory for the current app session, including
when switching pages, but reset after restarting the app. Speed/loop changes apply
to the next playback.

## Build an installable desktop app

From the project directory:

```powershell
npm ci
npm run tauri -- build
```

The build compiles both the frontend and Rust backend and creates platform-specific
installers under `src-tauri\target\release\bundle`. On Windows, look in the `msi`
or `nsis` subdirectory for the installer.

`npm run build` builds only the frontend; it does not create a desktop installer.

## Development checks

```powershell
# Check types and build the frontend
npm run build

# Run Rust backend unit tests
cargo test --manifest-path .\src-tauri\Cargo.toml --lib
```

## Troubleshooting

- **`npm` or `cargo` is not recognized:** install the prerequisite tools and open
  a new terminal.
- **`link.exe`, C++ compiler, or Windows SDK errors:** install the Visual Studio
  Build Tools C++ workload and SDK.
- **Port 1420 is already in use:** stop the previous Hac-Kit/Vite development
  process from its terminal, then rerun `npm run tauri -- dev`. Tauri expects this
  fixed port.
- **Backend/IPC errors in a browser:** launch the desktop app with the Tauri
  command, not the Vite URL.
- **A global shortcut does not register:** another app may already use it.
  Choose a different combination in Keybinds.
- **Recording or playback does not work:** check OS input/accessibility
  permissions. On macOS, input monitoring/accessibility permissions may be needed.
  On Windows, input injection into an elevated app may be blocked when Hac-Kit
  runs without elevation; test with a non-elevated target first.
- **Nmap is not detected:** install it, check PATH or `NMAP_HOME`, and restart
  Hac-Kit. Scan options may require additional OS permissions.

## Recommended editor

[VS Code](https://code.visualstudio.com/) with the
[Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
