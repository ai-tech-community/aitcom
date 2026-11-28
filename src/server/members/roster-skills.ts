import { sql, type SQL } from "drizzle-orm";

/** Preserve the roster's exact, case-insensitive skill matching. */
export function rosterSkillMatches(skills: SQL, skill: string) {
  return sql`exists (
    select 1 from json_array_elements_text(${skills}) as skills(value)
    where lower(btrim(skills.value)) = lower(${skill})
  )`;
}

export function rosterSkillValue(skills: SQL) {
  return sql<string>`btrim(json_array_elements_text(${skills}))`;
}
