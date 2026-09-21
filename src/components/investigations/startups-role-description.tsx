import { parseStartupRoleDescription } from "@/lib/investigations/startup-role-description";

export function StartupsRoleDescription({ text }: { text: string }) {
  const blocks = parseStartupRoleDescription(text);
  if (blocks.length === 0) return null;

  return (
    <article
      data-startup-role-description=""
      className="text-foreground max-w-prose text-base leading-7"
    >
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h2
              key={`h-${index}`}
              className="mt-8 text-base font-semibold tracking-tight first:mt-0"
            >
              {block.text}
            </h2>
          );
        }
        if (block.type === "list") {
          return (
            <ul
              key={`l-${index}`}
              className="marker:text-muted-foreground mt-3 list-disc space-y-2 pl-5"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`p-${index}`} className="mt-3 first:mt-0">
            {block.text}
          </p>
        );
      })}
    </article>
  );
}
