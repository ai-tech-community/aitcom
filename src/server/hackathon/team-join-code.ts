// Human-shareable team join code (ADR-0029). Mirrors the registration invite
// code style with a "TEAM-" prefix and an unambiguous alphabet (no O/0/I/1).
// 8 chars over a 32-symbol alphabet (~10^12 space), so a collision against the
// unique index on team.joinCode is negligible; the insert caller treats a
// unique-violation as "regenerate".

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTeamJoinCode(): string {
  let code = "TEAM-";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}
