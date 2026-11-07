import React from "react";
import { tauriApi } from "../api/tauriBridge";
import {
  Folder,
  BookOpen,
  Code,
  Terminal,
  Sparkles,
  Flame,
  CheckSquare,
  ListTodo,
  GraduationCap,
  Briefcase,
  Heart,
  Globe,
  FileText,
  Cpu,
  Palette,
  Coffee,
  Bookmark,
  Star,
  Music,
  Film,
  Lightbulb,
  Layers,
  Tag,
  Smile,
  Zap,
  Target,
  Box,
  Archive,
  Compass,
  Calendar,
  Clock,
  Pin,
  TrendingUp,
  User,
  Library,
  Hash,
  Baby,
  Camera,
  Car,
  ChefHat,
  Dumbbell,
  Gamepad2,
  Gift,
  House,
  Landmark,
  Mountain,
  PawPrint,
  Plane,
  ShoppingCart,
  Sprout,
  Stethoscope,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { pick } from "../platform";

export const CATEGORY_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>
> = {
  Folder,
  BookOpen,
  Code,
  Terminal,
  Sparkles,
  Flame,
  CheckSquare,
  ListTodo,
  GraduationCap,
  Briefcase,
  Heart,
  Globe,
  FileText,
  Cpu,
  Palette,
  Coffee,
  Bookmark,
  Star,
  Music,
  Film,
  Lightbulb,
  Layers,
  Tag,
  Smile,
  Zap,
  Target,
  Box,
  Archive,
  Compass,
  Calendar,
  Clock,
  Pin,
  TrendingUp,
  User,
  Library,
  Hash,
};

/** Icons the modern design adds to the picker. The classic design draws them (a shelf named in the modern one) but does not offer them. */
const MODERN_EXTRA_ICONS = {
  ChefHat,
  Plane,
  Dumbbell,
  ShoppingCart,
  Wallet,
  House,
  Users,
  Gift,
  PawPrint,
  Gamepad2,
  Camera,
  Car,
  Sprout,
  Mountain,
  Stethoscope,
  Baby,
  Wrench,
  Landmark,
};
const PICKER_ICON_NAMES = Object.keys(CATEGORY_ICONS);
Object.assign(CATEGORY_ICONS, MODERN_EXTRA_ICONS);
export const CATEGORY_ICON_NAMES = pick(PICKER_ICON_NAMES, [...PICKER_ICON_NAMES, ...Object.keys(MODERN_EXTRA_ICONS)]);

const STORAGE_KEY = "doit.category_icons";

let memoryIcons: Record<string, string> | null = null;

export function initCategoryIcons(icons: Record<string, string>): void {
  memoryIcons = { ...icons };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("category-icons-changed"));
}

export function getStoredCategoryIcons(): Record<string, string> {
  if (memoryIcons) return memoryIcons;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memoryIcons = JSON.parse(raw);
      return memoryIcons!;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function getDefaultCategoryIcon(category: string): string {
  const q = (category || "").toLowerCase().trim();
  if (!q || q === "uncategorized") return "Folder";
  if (/(igcse|school|study|exam|math|phys|chem|bio|class|learn|academy|edu|student)/.test(q)) return "GraduationCap";
  if (/(code|dev|tech|prog|web|app|script|git|software|frontend|backend)/.test(q)) return "Code";
  if (/(work|job|corp|office|client|project|business|career)/.test(q)) return "Briefcase";
  if (/(todo|task|plan|checklist|action|goal)/.test(q)) return "CheckSquare";
  if (/(idea|brain|think|spark|innovat)/.test(q)) return "Lightbulb";
  if (/(design|art|ui|ux|draw|paint|creative)/.test(q)) return "Palette";
  if (/(personal|life|self|me|home|health|family)/.test(q)) return "Heart";
  if (/(finance|money|invest|crypto|bank|stock)/.test(q)) return "TrendingUp";
  if (/(read|book|doc|note|paper|article)/.test(q)) return "BookOpen";
  if (/(archive|old|store|backup|vault)/.test(q)) return "Archive";
  if (/(music|audio|song|sound)/.test(q)) return "Music";
  if (/(video|film|movie|media)/.test(q)) return "Film";
  if (/(coffee|daily|journal|diary)/.test(q)) return "Coffee";
  if (/(star|fav|priority|urgent|imp)/.test(q)) return "Star";
  return "Folder";
}

export function getCategoryIconName(category: string): string {
  if (!category) return "Folder";
  const icons = getStoredCategoryIcons();
  const stored = icons[category.toLowerCase()];
  if (stored) return stored; // can be "dot" or icon name
  return getDefaultCategoryIcon(category);
}

export function setCategoryIcon(category: string, iconName: string | null): void {
  if (!category) return;
  try {
    const icons = { ...getStoredCategoryIcons() };
    const key = category.toLowerCase();
    if (iconName) {
      icons[key] = iconName;
    } else {
      delete icons[key];
    }
    memoryIcons = icons;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
    window.dispatchEvent(new CustomEvent("category-icons-changed", { detail: { category, iconName } }));

    // Persist to settings.json in Rust backend
    void tauriApi.getSettings().then((s) => {
      const current = s.category_icons || {};
      if (iconName) {
        current[key] = iconName;
      } else {
        delete current[key];
      }
      void tauriApi.updateSettings({ ...s, category_icons: current });
    }).catch(() => undefined);
  } catch {
    /* ignore storage errors */
  }
}

export function renameCategoryIcon(oldName: string, newName: string): void {
  try {
    const icons = { ...getStoredCategoryIcons() };
    const oldKey = oldName.toLowerCase();
    const newKey = newName.toLowerCase();
    if (icons[oldKey]) {
      icons[newKey] = icons[oldKey];
      delete icons[oldKey];
      memoryIcons = icons;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
      window.dispatchEvent(new CustomEvent("category-icons-changed"));

      void tauriApi.getSettings().then((s) => {
        const current = s.category_icons || {};
        if (current[oldKey]) {
          current[newKey] = current[oldKey];
          delete current[oldKey];
          void tauriApi.updateSettings({ ...s, category_icons: current });
        }
      }).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

export function removeCategoryIcon(category: string): void {
  try {
    const icons = { ...getStoredCategoryIcons() };
    const key = category.toLowerCase();
    if (icons[key]) {
      delete icons[key];
      memoryIcons = icons;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
      window.dispatchEvent(new CustomEvent("category-icons-changed"));

      void tauriApi.getSettings().then((s) => {
        const current = s.category_icons || {};
        delete current[key];
        void tauriApi.updateSettings({ ...s, category_icons: current });
      }).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

export function renderCategoryIcon(
  iconName: string | null | undefined,
  fallbackAccent: string,
  size = 14,
  strokeWidth = 1.8,
  className = "shrink-0",
): React.ReactNode {
  if (iconName === "dot") {
    return (
      <span
        className="shrink-0 size-2 rounded-full pointer-events-none"
        style={{ backgroundColor: fallbackAccent }}
      />
    );
  }
  const resolved = (iconName && CATEGORY_ICONS[iconName]) ? iconName : "Folder";
  const IconComp = CATEGORY_ICONS[resolved] || Folder;
  return <IconComp size={size} strokeWidth={strokeWidth} className={className} style={{ color: fallbackAccent }} />;
}
