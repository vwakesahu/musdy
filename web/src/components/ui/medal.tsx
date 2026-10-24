const tones = ["#E8B64C", "#B9B4C2", "#C7814A"];

export function Medal({ rank }: { rank: 1 | 2 | 3 }) {
  return (
    <svg width="24" height="28" viewBox="0 0 24 28" aria-label={`Rank ${rank}`}>
      <path d="M7 1h4l2 7H9zM13 1h4l-2 7h-4z" fill={tones[rank - 1]} opacity="0.55" />
      <circle cx="12" cy="17" r="9" fill={tones[rank - 1]} />
      <text x="12" y="21" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A0F00">
        {rank}
      </text>
    </svg>
  );
}
