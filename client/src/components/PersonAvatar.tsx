import { initials, type Person } from "@/lib/family";
import { cn } from "@/lib/utils";

// Classic gendered avatars — blue for M, pink for F, neutral for unknown.
// Tuned saturation and luminance for AA contrast and a calm, archival feel.
const TONE: Record<string, string> = {
  M: "bg-[hsl(212_82%_46%)] text-white ring-[hsl(212_72%_36%)] dark:bg-[hsl(212_72%_56%)] dark:text-white dark:ring-[hsl(212_60%_70%)]",
  F: "bg-[hsl(338_70%_56%)] text-white ring-[hsl(338_60%_46%)] dark:bg-[hsl(338_68%_64%)] dark:text-white dark:ring-[hsl(338_55%_74%)]",
  X: "bg-[hsl(220_14%_82%)] text-[hsl(220_22%_22%)] ring-[hsl(220_12%_64%)] dark:bg-[hsl(220_14%_28%)] dark:text-[hsl(220_14%_88%)] dark:ring-[hsl(220_12%_44%)]",
};

interface Props {
  person: Person;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function PersonAvatar({ person, size = "md", className }: Props) {
  const sx = (person.sex || "X").toUpperCase() as "M" | "F" | "X";
  const tone = TONE[sx] ?? TONE.X;
  const sizes = {
    xs: "h-7 w-7 text-[0.65rem]",
    sm: "h-9 w-9 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-16 w-16 text-lg",
  };
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide select-none ring-1",
        sizes[size],
        tone,
        className,
      )}
      data-testid={`avatar-person-${person.id}`}
    >
      {initials(person)}
    </div>
  );
}
