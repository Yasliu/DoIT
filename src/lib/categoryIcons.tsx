import React from "react";
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
} from "lucide-react";

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

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

const STORAGE_KEY = "doit.category_icons";

export function getStoredCategoryIcons(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCategoryIconName(category: string): string | null {
  if (!category) return null;
  const icons = getStoredCategoryIcons();
  return icons[category.toLowerCase()] || null;
}

export function setCategoryIcon(category: string, iconName: string | null): void {
  if (!category) return;
  try {
    const icons = getStoredCategoryIcons();
    const key = category.toLowerCase();
    if (iconName && CATEGORY_ICONS[iconName]) {
      icons[key] = iconName;
    } else {
      delete icons[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
    window.dispatchEvent(new CustomEvent("category-icons-changed", { detail: { category, iconName } }));
  } catch {
    /* ignore storage errors */
  }
}

export function renameCategoryIcon(oldName: string, newName: string): void {
  try {
    const icons = getStoredCategoryIcons();
    const oldKey = oldName.toLowerCase();
    const newKey = newName.toLowerCase();
    if (icons[oldKey]) {
      icons[newKey] = icons[oldKey];
      delete icons[oldKey];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
      window.dispatchEvent(new CustomEvent("category-icons-changed"));
    }
  } catch {
    /* ignore */
  }
}

export function removeCategoryIcon(category: string): void {
  try {
    const icons = getStoredCategoryIcons();
    const key = category.toLowerCase();
    if (icons[key]) {
      delete icons[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
      window.dispatchEvent(new CustomEvent("category-icons-changed"));
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
  if (iconName && CATEGORY_ICONS[iconName]) {
    const IconComp = CATEGORY_ICONS[iconName];
    return <IconComp size={size} strokeWidth={strokeWidth} className={className} style={{ color: fallbackAccent }} />;
  }
  return (
    <span
      className="shrink-0 size-2 rounded-full pointer-events-none"
      style={{ backgroundColor: fallbackAccent }}
    />
  );
}
