# DoIT

<p align="center">
  <img src="logo.svg" alt="DoIT Logo" width="120" height="120" />
</p>

A local-first, minimal task environment structured precisely into an organic, asymmetrical bento grid desktop canvas. Engineered for speed, data ownership, and zero friction.

## ✨ Core Philosophy

- **Zero Cloud, Absolute Ownership:** Every note, list, and task is stored natively on your machine as standard human-readable Markdown text files. No accounts, no database lock-ins, and no tracking.
- **System Tray Native:** Folds down seamlessly into your Windows notification tray to stay entirely out of your way until called. 
- **High-Performance Blueprint:** Built natively with Tauri and Rust on an optimized memory architecture that clocks a flat idling speed of just 11.5 MB RAM.
- **Asymmetric Canvas:** Rejects standard list structures for an editorial bento tile workspace that matches content density dynamically.

---

## 🚀 Installation & Windows Setup

1. Head over to the **Releases** tab on the right side of this repository page.
2. Download the standalone setup installer executable (`doit_setup_x64.exe` or `.msi`).
3. Launch the setup wizard to complete installation.

*Note: Because this is an independent, open-source project built directly from source code, Windows SmartScreen might flash a protective blue alert window. To pass it, click **"More info"** and select **"Run anyway"**.*

---

## 🛠️ Modifying & Working on DoIT

If you want to pull down the repository locally to modify the interfaces, run scripts, or customize the single-spring animation values:

### Technical Stack
- **Backend:** Native Rust via Tauri v2
- **Frontend:** HTML5, TypeScript, Tailwind CSS

### Prerequisites
Ensure you have the native C++ build tools installed on your Windows machine alongside **Rust (Cargo)** and **Node.js (npm)**.

### Local Development Loop
```bash
# 1. Clone the repository
git clone https://github.com/Yasliu/DoIT.git
cd YOUR_REPO

# 2. Install frontend visual packages
npm install

# 3. Launch the application in live developer mode
npm run tauri dev
```

---

## 📄 Licensing & Safety Metrics

- **License:** Open Source under the permissive MIT standards. 
- **Security Profile:** Hardened client-side boundaries. The app actively restricts file imports to 30 MB boundaries to guarantee thread stability and completely isolates path operations from administrative elevations.
