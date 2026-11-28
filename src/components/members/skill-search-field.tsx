import { Suspense, useId } from "react";
import { Input } from "@/components/ui/input";

export function SkillSearchField({
  label,
  defaultValue,
  suggestions,
}: {
  label: string;
  defaultValue?: string;
  suggestions: Promise<string[]>;
}) {
  const id = useId();
  return (
    <>
      <label className="min-w-0 flex-1 sm:max-w-60">
        <span className="sr-only">{label}</span>
        <Input
          name="skill"
          list={id}
          defaultValue={defaultValue}
          maxLength={100}
          placeholder={label}
          className="min-h-11 shadow-none"
        />
      </label>
      <Suspense fallback={null}>
        <SkillOptions id={id} suggestions={suggestions} />
      </Suspense>
    </>
  );
}

async function SkillOptions({
  id,
  suggestions,
}: {
  id: string;
  suggestions: Promise<string[]>;
}) {
  return (
    <datalist id={id}>
      {(await suggestions).map((skill) => (
        <option key={skill} value={skill} />
      ))}
    </datalist>
  );
}
