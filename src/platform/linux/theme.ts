/**
 * Linux colour themes: seven palettes, each with a light and a dark variant, applied as `--l-*`
 * custom properties on <html>. `linux.css` maps DoIT's own colour tokens onto them.
 *
 * Six palettes come from T3 Code (MIT, see THIRD_PARTY_NOTICES.md); Monochrome is DoIT's own look.
 * Glass is not a palette but a flag on top of any of them (`data-glass`, styled in linux.css).
 */

export type Appearance = "system" | "light" | "dark";
type Resolved = "light" | "dark";

const PALETTES = {
  neutral: {
    label: "Neutral",
    light: {
      canvas: "#fcfcfc",
      sidebar: "#fafafa",
      sidebarForeground: "#27272a",
      sidebarMutedForeground: "#71717b",
      sidebarRowHover: "#fcfcfc",
      sidebarRowSelected: "#ffffff",
      sidebarBorder: "#e4e4e7",
      surface: "#ffffff",
      surfaceRaised: "#fcfcfc",
      surfaceOverlay: "#ffffff",
      text: "#27272a",
      textMuted: "#71717b",
      placeholder: "#71717b",
      border: "#e4e4e7",
      input: "#d4d4d8",
      focus: "#1b4ed8",
      accent: "#1b4ed8",
      accentForeground: "#ffffff",
      accentSurface: "#f4f4f5",
      error: "#fb2c36",
      errorForeground: "#c10007",
      errorSurface: "#fcebec",
      warning: "#fe9a00",
      codeBackground: "#ffffff",
      codeForeground: "#27272a",
      searchMatchBackground: "#ffde8b",
      searchMatchForeground: "#21180a",
    },
    dark: {
      canvas: "#0a0a0a",
      sidebar: "#000000",
      sidebarForeground: "#f1f3f7",
      sidebarMutedForeground: "#a3a3a3",
      sidebarRowHover: "#131313",
      sidebarRowSelected: "#111111",
      sidebarBorder: "#141414",
      surface: "#111111",
      surfaceRaised: "#111111",
      surfaceOverlay: "#111111",
      text: "#f5f5f5",
      textMuted: "#818181",
      placeholder: "#818181",
      border: "#191919",
      input: "#1e1e1e",
      focus: "#346bf1",
      accent: "#346bf1",
      accentForeground: "#ffffff",
      accentSurface: "#141414",
      error: "#fb414a",
      errorForeground: "#ff6467",
      errorSurface: "#301214",
      warning: "#fe9a00",
      codeBackground: "#111111",
      codeForeground: "#f5f5f5",
      searchMatchBackground: "#8c6c1f",
      searchMatchForeground: "#f5f5f5",
    },
  },
  orchid: {
    label: "Orchid",
    light: {
      canvas: "oklch(0.9824 0.0101 325.65)",
      sidebar: "oklch(0.9289 0.0312 322.59)",
      sidebarForeground: "oklch(0.3963 0.0251 285.20)",
      sidebarMutedForeground: "oklch(0.4948 0.1909 354.54)",
      sidebarRowHover: "oklch(0.9789 0.0013 106.42)",
      sidebarRowSelected: "oklch(0.9789 0.0013 106.42)",
      sidebarBorder: "oklch(0.9383 0.0026 48.72)",
      surface: "oklch(0.9718 0.0129 321.89)",
      surfaceRaised: "oklch(0.9882 0.0050 325.62)",
      surfaceOverlay: "oklch(1.0000 0.0000 0.00)",
      text: "oklch(0.3257 0.1161 325.04)",
      textMuted: "oklch(0.4948 0.1909 354.54)",
      placeholder: "oklch(0.5499 0.0902 323.15)",
      border: "oklch(0.9235 0.0212 328.10)",
      input: "oklch(0.8517 0.0558 336.60)",
      focus: "oklch(0.5916 0.2180 0.58)",
      accent: "oklch(0.5916 0.2180 0.58)",
      accentForeground: "oklch(1.0000 0.0000 0.00)",
      accentSurface: "oklch(0.9396 0.0243 321.66)",
      error: "oklch(0.6271 0.2490 7.73)",
      errorForeground: "oklch(0.4587 0.1697 3.81)",
      errorSurface: "oklch(0.9428 0.0321 344.96)",
      warning: "oklch(0.7686 0.1647 70.08)",
      codeBackground: "oklch(0.9539 0.0197 315.67)",
      codeForeground: "oklch(0.4451 0.1300 307.03)",
      searchMatchBackground: "oklch(0.9150 0.1100 85.00)",
      searchMatchForeground: "oklch(0.2162 0.0283 77.42)",
    },
    dark: {
      canvas: "oklch(0.2281 0.0204 307.47)",
      sidebar: "oklch(0.1858 0.0194 322.16)",
      sidebarForeground: "oklch(0.9674 0.0013 286.38)",
      sidebarMutedForeground: "oklch(0.8803 0.0308 342.70)",
      sidebarRowHover: "oklch(0.2337 0.0261 338.20)",
      sidebarRowSelected: "oklch(0.2337 0.0261 338.20)",
      sidebarBorder: "oklch(0.2691 0.0308 351.07)",
      surface: "oklch(0.2671 0.0202 311.80)",
      surfaceRaised: "oklch(0.2799 0.0216 309.53)",
      surfaceOverlay: "oklch(0.1548 0.0132 338.90)",
      text: "oklch(0.9807 0.0041 301.43)",
      textMuted: "oklch(0.8803 0.0308 342.70)",
      placeholder: "oklch(0.6571 0.0282 307.99)",
      border: "oklch(0.2669 0.0153 302.43)",
      input: "oklch(0.2668 0.0290 344.46)",
      focus: "oklch(0.5916 0.2180 0.58)",
      accent: "oklch(0.4607 0.1853 4.10)",
      accentForeground: "oklch(0.9012 0.0572 343.69)",
      accentSurface: "oklch(0.3649 0.0508 308.49)",
      error: "oklch(0.4587 0.1697 3.81)",
      errorForeground: "oklch(0.9012 0.0572 343.69)",
      errorSurface: "oklch(0.2590 0.0480 340.06)",
      warning: "oklch(0.7686 0.1647 70.08)",
      codeBackground: "oklch(0.2281 0.0204 307.47)",
      codeForeground: "oklch(0.8487 0.0642 306.64)",
      searchMatchBackground: "oklch(0.5500 0.1000 85.00)",
      searchMatchForeground: "oklch(0.9702 0.0000 0.00)",
    },
  },
  grove: {
    label: "Grove",
    light: {
      canvas: "oklch(0.9724 0.0055 157.15)",
      sidebar: "oklch(0.9365 0.0146 163.55)",
      sidebarForeground: "oklch(0.2220 0.0348 328.98)",
      sidebarMutedForeground: "oklch(0.5156 0.0119 318.90)",
      sidebarRowHover: "oklch(0.8867 0.0274 164.98)",
      sidebarRowSelected: "oklch(0.8367 0.0403 165.15)",
      sidebarBorder: "oklch(0.8603 0.0103 168.34)",
      surface: "oklch(0.9724 0.0055 157.15)",
      surfaceRaised: "oklch(0.9493 0.0045 159.00)",
      surfaceOverlay: "oklch(0.9327 0.0038 160.94)",
      text: "oklch(0.2220 0.0348 328.98)",
      textMuted: "oklch(0.5405 0.0149 326.18)",
      placeholder: "oklch(0.5297 0.0155 326.30)",
      border: "oklch(0.8648 0.0131 167.25)",
      input: "oklch(0.8297 0.0161 168.23)",
      focus: "oklch(0.5233 0.1123 158.09)",
      accent: "oklch(0.5233 0.1123 158.09)",
      accentForeground: "oklch(0.9903 0.0084 325.64)",
      accentSurface: "oklch(0.9094 0.0215 164.61)",
      error: "oklch(0.6378 0.2373 25.44)",
      errorForeground: "oklch(0.5095 0.2086 28.51)",
      errorSurface: "oklch(0.9370 0.0142 26.30)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.9559 0.0048 158.39)",
      codeForeground: "oklch(0.2220 0.0348 328.98)",
      searchMatchBackground: "oklch(0.9150 0.1100 85.00)",
      searchMatchForeground: "oklch(0.2162 0.0283 77.42)",
    },
    dark: {
      canvas: "oklch(0.2609 0.0215 162.75)",
      sidebar: "oklch(0.3099 0.0328 160.94)",
      sidebarForeground: "oklch(0.9903 0.0084 325.64)",
      sidebarMutedForeground: "oklch(0.7114 0.0076 175.89)",
      sidebarRowHover: "oklch(0.3750 0.0471 159.69)",
      sidebarRowSelected: "oklch(0.4375 0.0604 158.96)",
      sidebarBorder: "oklch(0.5693 0.0159 167.06)",
      surface: "oklch(0.2609 0.0215 162.75)",
      surfaceRaised: "oklch(0.3632 0.0166 165.32)",
      surfaceOverlay: "oklch(0.4118 0.0144 166.63)",
      text: "oklch(0.9903 0.0084 325.64)",
      textMuted: "oklch(0.6667 0.0042 187.29)",
      placeholder: "oklch(0.7392 0.0022 223.22)",
      border: "oklch(0.4575 0.0440 160.97)",
      input: "oklch(0.5198 0.0499 160.86)",
      focus: "oklch(0.7962 0.1331 157.32)",
      accent: "oklch(0.7962 0.1331 157.32)",
      accentForeground: "oklch(0.2220 0.0348 328.98)",
      accentSurface: "oklch(0.4370 0.0603 158.96)",
      error: "oklch(0.6551 0.2211 23.47)",
      errorForeground: "oklch(0.7042 0.1875 22.23)",
      errorSurface: "oklch(0.3128 0.0292 32.12)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.3130 0.0189 164.08)",
      codeForeground: "oklch(0.9903 0.0084 325.64)",
      searchMatchBackground: "oklch(0.5500 0.1000 85.00)",
      searchMatchForeground: "oklch(0.9702 0.0000 0.00)",
    },
  },
  ocean: {
    label: "Ocean",
    light: {
      canvas: "oklch(0.9742 0.0029 241.60)",
      sidebar: "oklch(0.9393 0.0119 241.73)",
      sidebarForeground: "oklch(0.2220 0.0348 328.98)",
      sidebarMutedForeground: "oklch(0.5174 0.0189 311.43)",
      sidebarRowHover: "oklch(0.8908 0.0247 241.93)",
      sidebarRowSelected: "oklch(0.8421 0.0377 242.17)",
      sidebarBorder: "oklch(0.8628 0.0114 256.93)",
      surface: "oklch(0.9742 0.0029 241.60)",
      surfaceRaised: "oklch(0.9511 0.0030 258.34)",
      surfaceOverlay: "oklch(0.9344 0.0032 269.10)",
      text: "oklch(0.2220 0.0348 328.98)",
      textMuted: "oklch(0.5416 0.0175 323.53)",
      placeholder: "oklch(0.5307 0.0180 323.79)",
      border: "oklch(0.8676 0.0135 252.36)",
      input: "oklch(0.8329 0.0174 252.60)",
      focus: "oklch(0.5367 0.1202 247.01)",
      accent: "oklch(0.5367 0.1202 247.01)",
      accentForeground: "oklch(0.9903 0.0084 325.64)",
      accentSurface: "oklch(0.9130 0.0188 241.84)",
      error: "oklch(0.6378 0.2373 25.44)",
      errorForeground: "oklch(0.5095 0.2086 28.51)",
      errorSurface: "oklch(0.9387 0.0164 7.19)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.9577 0.0029 253.68)",
      codeForeground: "oklch(0.2220 0.0348 328.98)",
      searchMatchBackground: "oklch(0.9150 0.1100 85.00)",
      searchMatchForeground: "oklch(0.2162 0.0283 77.42)",
    },
    dark: {
      canvas: "oklch(0.2426 0.0241 250.57)",
      sidebar: "oklch(0.2904 0.0320 247.27)",
      sidebarForeground: "oklch(0.9903 0.0084 325.64)",
      sidebarMutedForeground: "oklch(0.6910 0.0140 266.42)",
      sidebarRowHover: "oklch(0.3534 0.0423 245.04)",
      sidebarRowSelected: "oklch(0.4137 0.0519 243.85)",
      sidebarBorder: "oklch(0.5586 0.0190 256.22)",
      surface: "oklch(0.2426 0.0241 250.57)",
      surfaceRaised: "oklch(0.3484 0.0199 253.70)",
      surfaceOverlay: "oklch(0.3985 0.0182 255.72)",
      text: "oklch(0.9903 0.0084 325.64)",
      textMuted: "oklch(0.6522 0.0115 273.31)",
      placeholder: "oklch(0.7216 0.0102 281.27)",
      border: "oklch(0.4387 0.0395 245.44)",
      input: "oklch(0.5009 0.0436 244.78)",
      focus: "oklch(0.7589 0.1058 241.55)",
      accent: "oklch(0.7589 0.1058 241.55)",
      accentForeground: "oklch(0.2220 0.0348 328.98)",
      accentSurface: "oklch(0.4133 0.0519 243.85)",
      error: "oklch(0.6551 0.2211 23.47)",
      errorForeground: "oklch(0.7022 0.1892 22.23)",
      errorSurface: "oklch(0.2989 0.0364 350.09)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.2966 0.0219 251.97)",
      codeForeground: "oklch(0.9903 0.0084 325.64)",
      searchMatchBackground: "oklch(0.5500 0.1000 85.00)",
      searchMatchForeground: "oklch(0.9702 0.0000 0.00)",
    },
  },
  ember: {
    label: "Ember",
    light: {
      canvas: "oklch(0.9765 0.0027 60.73)",
      sidebar: "oklch(0.9423 0.0115 50.78)",
      sidebarForeground: "oklch(0.2220 0.0348 328.98)",
      sidebarMutedForeground: "oklch(0.5191 0.0192 343.43)",
      sidebarRowHover: "oklch(0.8948 0.0242 49.07)",
      sidebarRowSelected: "oklch(0.8472 0.0373 48.40)",
      sidebarBorder: "oklch(0.8656 0.0112 35.25)",
      surface: "oklch(0.9765 0.0027 60.73)",
      surfaceRaised: "oklch(0.9533 0.0027 42.27)",
      surfaceOverlay: "oklch(0.9367 0.0029 29.96)",
      text: "oklch(0.2220 0.0348 328.98)",
      textMuted: "oklch(0.5430 0.0173 331.96)",
      placeholder: "oklch(0.5323 0.0178 331.75)",
      border: "oklch(0.8706 0.0132 39.43)",
      input: "oklch(0.8362 0.0172 38.66)",
      focus: "oklch(0.5528 0.1294 44.66)",
      accent: "oklch(0.5528 0.1294 44.66)",
      accentForeground: "oklch(0.9903 0.0084 325.64)",
      accentSurface: "oklch(0.9165 0.0183 49.60)",
      error: "oklch(0.6378 0.2373 25.44)",
      errorForeground: "oklch(0.5095 0.2086 28.51)",
      errorSurface: "oklch(0.9411 0.0199 19.38)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.9600 0.0027 47.51)",
      codeForeground: "oklch(0.2220 0.0348 328.98)",
      searchMatchBackground: "oklch(0.9150 0.1100 85.00)",
      searchMatchForeground: "oklch(0.2162 0.0283 77.42)",
    },
    dark: {
      canvas: "oklch(0.2459 0.0191 42.04)",
      sidebar: "oklch(0.2933 0.0296 46.88)",
      sidebarForeground: "oklch(0.9903 0.0084 325.64)",
      sidebarMutedForeground: "oklch(0.6919 0.0125 24.64)",
      sidebarRowHover: "oklch(0.3562 0.0429 49.38)",
      sidebarRowSelected: "oklch(0.4165 0.0554 50.49)",
      sidebarBorder: "oklch(0.5604 0.0170 36.18)",
      surface: "oklch(0.2459 0.0191 42.04)",
      surfaceRaised: "oklch(0.3513 0.0157 37.59)",
      surfaceOverlay: "oklch(0.4011 0.0143 34.90)",
      text: "oklch(0.9903 0.0084 325.64)",
      textMuted: "oklch(0.6540 0.0095 13.29)",
      placeholder: "oklch(0.7235 0.0087 4.51)",
      border: "oklch(0.4410 0.0402 48.81)",
      input: "oklch(0.5030 0.0457 49.44)",
      focus: "oklch(0.7622 0.1241 52.08)",
      accent: "oklch(0.7622 0.1241 52.08)",
      accentForeground: "oklch(0.2220 0.0348 328.98)",
      accentSurface: "oklch(0.4160 0.0554 50.48)",
      error: "oklch(0.6551 0.2211 23.47)",
      errorForeground: "oklch(0.7022 0.1892 22.23)",
      errorSurface: "oklch(0.3110 0.0596 24.33)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.2997 0.0172 39.97)",
      codeForeground: "oklch(0.9903 0.0084 325.64)",
      searchMatchBackground: "oklch(0.5500 0.1000 85.00)",
      searchMatchForeground: "oklch(0.9702 0.0000 0.00)",
    },
  },
  iris: {
    label: "Iris",
    light: {
      canvas: "oklch(0.9765 0.0039 303.23)",
      sidebar: "oklch(0.9414 0.0147 300.47)",
      sidebarForeground: "oklch(0.2220 0.0348 328.98)",
      sidebarMutedForeground: "oklch(0.5184 0.0237 320.68)",
      sidebarRowHover: "oklch(0.8925 0.0300 299.70)",
      sidebarRowSelected: "oklch(0.8432 0.0458 299.20)",
      sidebarBorder: "oklch(0.8648 0.0159 305.37)",
      surface: "oklch(0.9765 0.0039 303.23)",
      surfaceRaised: "oklch(0.9533 0.0045 307.68)",
      surfaceOverlay: "oklch(0.9367 0.0050 310.13)",
      text: "oklch(0.2220 0.0348 328.98)",
      textMuted: "oklch(0.5430 0.0189 325.65)",
      placeholder: "oklch(0.5322 0.0193 325.78)",
      border: "oklch(0.8696 0.0182 303.86)",
      input: "oklch(0.8348 0.0234 303.68)",
      focus: "oklch(0.5253 0.1537 294.18)",
      accent: "oklch(0.5253 0.1537 294.18)",
      accentForeground: "oklch(0.9903 0.0084 325.64)",
      accentSurface: "oklch(0.9149 0.0230 299.99)",
      error: "oklch(0.6378 0.2373 25.44)",
      errorForeground: "oklch(0.5095 0.2086 28.51)",
      errorSurface: "oklch(0.9410 0.0196 4.24)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.9600 0.0043 306.54)",
      codeForeground: "oklch(0.2220 0.0348 328.98)",
      searchMatchBackground: "oklch(0.9150 0.1100 85.00)",
      searchMatchForeground: "oklch(0.2162 0.0283 77.42)",
    },
    dark: {
      canvas: "oklch(0.2260 0.0311 293.74)",
      sidebar: "oklch(0.2667 0.0447 294.14)",
      sidebarForeground: "oklch(0.9903 0.0084 325.64)",
      sidebarMutedForeground: "oklch(0.6688 0.0215 302.95)",
      sidebarRowHover: "oklch(0.3208 0.0622 294.23)",
      sidebarRowSelected: "oklch(0.3728 0.0785 294.20)",
      sidebarBorder: "oklch(0.5459 0.0275 299.87)",
      surface: "oklch(0.2260 0.0311 293.74)",
      surfaceRaised: "oklch(0.3353 0.0260 296.39)",
      surfaceOverlay: "oklch(0.3867 0.0240 297.51)",
      text: "oklch(0.9903 0.0084 325.64)",
      textMuted: "oklch(0.6405 0.0162 304.17)",
      placeholder: "oklch(0.7062 0.0145 306.61)",
      border: "oklch(0.4087 0.0585 295.89)",
      input: "oklch(0.4676 0.0658 296.26)",
      focus: "oklch(0.6717 0.1691 293.93)",
      accent: "oklch(0.6717 0.1691 293.93)",
      accentForeground: "oklch(0.2220 0.0348 328.98)",
      accentSurface: "oklch(0.3724 0.0784 294.20)",
      error: "oklch(0.6551 0.2211 23.47)",
      errorForeground: "oklch(0.7022 0.1892 22.23)",
      errorSurface: "oklch(0.2917 0.0547 352.24)",
      warning: "oklch(0.7724 0.1728 65.37)",
      codeBackground: "oklch(0.2819 0.0283 295.19)",
      codeForeground: "oklch(0.9903 0.0084 325.64)",
      searchMatchBackground: "oklch(0.5500 0.1000 85.00)",
      searchMatchForeground: "oklch(0.9702 0.0000 0.00)",
    },
  },
  // DoIT's own look: greys only, white on near-black (dark) or near-black on white (light).
  monochrome: {
    label: "Monochrome",
    light: {
      canvas: "#fafafa",
      sidebar: "#f4f4f5",
      sidebarForeground: "#18181b",
      sidebarMutedForeground: "#71717a",
      sidebarRowHover: "#ececee",
      sidebarRowSelected: "#e6e6e9",
      sidebarBorder: "#e4e4e7",
      surface: "#ffffff",
      surfaceRaised: "#f6f6f7",
      surfaceOverlay: "#ffffff",
      text: "#18181b",
      textMuted: "#71717a",
      placeholder: "#a1a1aa",
      border: "#e4e4e7",
      input: "#d4d4d8",
      focus: "#18181b",
      accent: "#18181b",
      accentForeground: "#fafafa",
      accentSurface: "#f4f4f5",
      error: "#dc2626",
      errorForeground: "#b91c1c",
      errorSurface: "#fef2f2",
      warning: "#d97706",
      codeBackground: "#f4f4f5",
      codeForeground: "#18181b",
      searchMatchBackground: "#fde68a",
      searchMatchForeground: "#422006",
    },
    dark: {
      canvas: "#0b0c0f",
      sidebar: "#0e0f13",
      sidebarForeground: "#f4f4f6",
      sidebarMutedForeground: "#9698a0",
      sidebarRowHover: "#15161b",
      sidebarRowSelected: "#1a1b21",
      sidebarBorder: "#1c1d22",
      surface: "#131418",
      surfaceRaised: "#181920",
      surfaceOverlay: "#121317",
      text: "#f4f4f6",
      textMuted: "#9698a0",
      placeholder: "#6d707a",
      border: "#232428",
      input: "#3a3b42",
      focus: "#f4f4f6",
      accent: "#f4f4f6",
      accentForeground: "#0b0c0f",
      accentSurface: "#181920",
      error: "#fb414a",
      errorForeground: "#ff6467",
      errorSurface: "#301214",
      warning: "#fe9a00",
      codeBackground: "#15161b",
      codeForeground: "#f0f0f4",
      searchMatchBackground: "rgba(250, 204, 21, 0.22)",
      searchMatchForeground: "#fef08a",
    },
  },
} as const;

export type PaletteId = keyof typeof PALETTES;
type Role = keyof (typeof PALETTES)["neutral"]["light"];

/** Monochrome first: it is the default. */
export const PALETTE_IDS = ["monochrome", ...Object.keys(PALETTES).filter((id) => id !== "monochrome")] as PaletteId[];
export const APPEARANCES: Appearance[] = ["system", "light", "dark"];
export const DEFAULT_PALETTE: PaletteId = "monochrome";
export const DEFAULT_APPEARANCE: Appearance = "system";

export function paletteLabel(id: PaletteId): string {
  return PALETTES[id].label;
}

/** Swatch colours for the theme picker. */
export function paletteSwatch(id: PaletteId, appearance: Resolved): { canvas: string; surface: string; accent: string; text: string } {
  const c = PALETTES[id][appearance];
  return { canvas: c.canvas, surface: c.surface, accent: c.accent, text: c.text };
}

/** Anything unknown falls back to the default; "glass" was a palette before it became a toggle. */
export function normalizePalette(value: string | null | undefined): PaletteId {
  return value && value in PALETTES ? (value as PaletteId) : DEFAULT_PALETTE;
}

export function normalizeAppearance(value: string | null | undefined): Appearance {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_APPEARANCE;
}

export interface LinuxTheme {
  palette: PaletteId;
  appearance: Appearance;
  /** Translucent, grainy window over any palette. */
  glass: boolean;
}

/** The stored settings as a theme, including the old "glass" palette (now Monochrome + Glass). */
export function themeFromSettings(s: { palette?: string | null; appearance?: string | null; glass?: boolean | null }): LinuxTheme {
  return {
    palette: normalizePalette(s.palette),
    appearance: normalizeAppearance(s.appearance),
    glass: s.glass ?? s.palette === "glass",
  };
}

const CACHE_KEY = "doit.linux-theme";
const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let current: LinuxTheme | null = null;

function resolve(appearance: Appearance): Resolved {
  if (appearance === "system") return darkQuery?.matches ? "dark" : "light";
  return appearance;
}

const kebab = (role: string) => role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function paint({ palette, appearance, glass }: LinuxTheme) {
  const root = document.documentElement;
  const resolved = resolve(appearance);
  const colors = PALETTES[palette][resolved];
  // A theme switch recolours everything at once; per-element colour transitions would smear it.
  root.classList.add("theme-switching");
  for (const role of Object.keys(colors) as Role[]) {
    root.style.setProperty(`--l-${kebab(role)}`, colors[role]);
  }
  root.dataset.palette = palette;
  root.dataset.appearance = resolved;
  root.toggleAttribute("data-glass", glass);
  root.style.colorScheme = resolved;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

/** Applies a theme and remembers it, so the next window paints it before settings load. */
export function applyLinuxTheme(theme: LinuxTheme): void {
  current = theme;
  paint(theme);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
  } catch {
    /* private storage: the theme still applies for this window */
  }
}

/** First paint: the last theme this machine used. */
export function restoreLinuxTheme(): void {
  let cached: { palette?: string; appearance?: string; glass?: boolean } = {};
  try {
    cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    /* fall back to the defaults */
  }
  current = themeFromSettings(cached);
  paint(current);
  // "System" follows GNOME's light/dark style live.
  darkQuery?.addEventListener("change", () => {
    if (current?.appearance === "system") paint(current);
  });
}
