export function formatDurationMinutes(value: number | null) {
  if (value == null) return "-";
  if (value < 60) return `${value}m`;

  const days = Math.floor(value / 1440);
  const hours = Math.floor((value % 1440) / 60);
  const minutes = value % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function getContributionMixWidths(input: {
  aiOnly: number;
  humanOnly: number;
  collaborative: number;
}) {
  const total = Math.max(1, input.aiOnly + input.humanOnly + input.collaborative);

  return {
    aiOnly: (input.aiOnly / total) * 100,
    humanOnly: (input.humanOnly / total) * 100,
    collaborative: (input.collaborative / total) * 100,
  };
}
