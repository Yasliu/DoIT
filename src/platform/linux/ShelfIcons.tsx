import { CATEGORY_ICON_NAMES, CATEGORY_ICONS, getDefaultCategoryIcon } from "../../lib/categoryIcons";
import { cx } from "../../lib/text";

/**
 * Words in a shelf name and the icon they suggest. Checked in order, so specific themes ("meal
 * plan") win over generic ones ("plan").
 */
const SUGGESTIONS: Array<[RegExp, string]> = [
  [/recipe|cook|kitchen|food|meal|bak(e|ing)|chef|dinner|lunch|breakfast|cuisine/, "ChefHat"],
  [/travel|trip|flight|vacation|holiday|journey|visa|abroad/, "Plane"],
  [/gym|fitness|workout|exercise|training|running|sport|yoga/, "Dumbbell"],
  [/grocer|shopping|wishlist|buy|purchase/, "ShoppingCart"],
  [/budget|expense|bill|wallet|tax|saving/, "Wallet"],
  [/home|house|apartment|rent|chore|household/, "House"],
  [/team|meeting|people|contact|friend|client/, "Users"],
  [/gift|birthday|present|wedding|party/, "Gift"],
  [/pet|dog|cat|puppy|vet\b/, "PawPrint"],
  [/game|gaming|play/, "Gamepad2"],
  [/photo|camera|picture/, "Camera"],
  [/\bcar\b|vehicle|drive|garage/, "Car"],
  [/garden|plant|nature|grow/, "Sprout"],
  [/hike|hiking|outdoor|climb|camp/, "Mountain"],
  [/health|doctor|medic|clinic|symptom/, "Stethoscope"],
  [/baby|kid|child|parent/, "Baby"],
  [/fix|repair|diy|maintenance|tool/, "Wrench"],
  [/history|museum|govern|politic|law/, "Landmark"],
];

/** The icon a new shelf called `name` gets until someone picks one. */
export function suggestShelfIcon(name: string): string {
  const q = name.toLowerCase().trim();
  if (!q) return "Folder";
  return SUGGESTIONS.find(([pattern]) => pattern.test(q))?.[1] ?? getDefaultCategoryIcon(q);
}

/** Every shelf icon, "no icon" (a dot) first. */
export function ShelfIconGrid({ value, onChange, columns = 8 }: { value: string; onChange: (icon: string) => void; columns?: number }) {
  return (
    <div role="radiogroup" aria-label="Icon" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {["dot", ...CATEGORY_ICON_NAMES].map((choice) => {
        const Icon = choice === "dot" ? null : CATEGORY_ICONS[choice];
        const on = value === choice;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={choice === "dot" ? "No icon" : choice}
            title={choice === "dot" ? "No icon" : choice}
            onClick={() => onChange(choice)}
            className={cx("lx-icon-choice", on && "is-on")}
          >
            {Icon ? <Icon size={16} /> : <span className="size-1.5 rounded-full bg-current" />}
          </button>
        );
      })}
    </div>
  );
}
