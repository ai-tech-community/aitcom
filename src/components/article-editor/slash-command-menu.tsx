import { useTranslations } from "next-intl";
import type { SlashGroup, SlashCommand, SlashMenuState, SlashMenuAction } from "./types";

interface SlashCommandMenuProps {
  slash: SlashMenuState;
  slashDispatch: React.Dispatch<SlashMenuAction>;
  filteredCommands: SlashCommand[];
  groupedCommands: Record<SlashGroup, SlashCommand[]>;
  onExecute: (id: string) => void;
}

export function SlashCommandMenu({ slash, slashDispatch, filteredCommands, groupedCommands, onExecute }: SlashCommandMenuProps) {
  const t = useTranslations("articleEditor");

  if (!slash.open) return null;

  return (
    <div className="border-border bg-background absolute left-0 top-8 z-20 max-h-72 w-[320px] overflow-y-auto rounded border p-2 shadow-lg">
      <div className="text-muted-foreground mb-2 px-1 font-mono text-xs">/{slash.query || t("slashSearchPlaceholder")}</div>
      {filteredCommands.length === 0 ? (
        <div className="text-muted-foreground px-1 py-1 text-xs">{t("noCommandsFound")}</div>
      ) : (
        (["Basic", "Technical", "Structure"] as const).map((groupName) => {
          const items = groupedCommands[groupName];
          if (items.length === 0) return null;

          return (
            <div key={groupName} className="mb-2 last:mb-0">
              <p className="text-muted-foreground mb-1 px-1 font-mono text-[10px] tracking-wider">{groupName.toUpperCase()}</p>
              {items.map((command) => {
                const itemIndex = filteredCommands.findIndex((c) => c.id === command.id);
                const active = slash.activeIndex === itemIndex;
                return (
                  <button
                    key={command.id}
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left text-xs ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70"}`}
                    onMouseEnter={() => slashDispatch({ type: "SET_ACTIVE_INDEX", payload: itemIndex })}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onExecute(command.id);
                    }}
                  >
                    {command.label}
                  </button>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
