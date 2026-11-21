export function BambooArtwork() {
  return (
    <svg
      className="studio-bamboo"
      viewBox="0 0 480 350"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bamboo" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#c5cf83" />
          <stop offset=".44" stopColor="#f0edbd" />
          <stop offset="1" stopColor="#90a067" />
        </linearGradient>
        <linearGradient id="frame" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#bcca86" />
          <stop offset="1" stopColor="#73915c" />
        </linearGradient>
      </defs>
      <circle cx="259" cy="175" r="143" stroke="#edf5d8" strokeOpacity=".12" />
      <circle cx="259" cy="175" r="114" stroke="#edf5d8" strokeOpacity=".08" />
      <g transform="rotate(-12 255 180)">
        <path
          d="M130 57v230m244-240v240"
          stroke="url(#frame)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M128 81h247M127 268h249"
          stroke="#b0bf7b"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {[0, 1, 2, 3, 4, 5, 6].map((v) => (
          <g key={v} transform={`translate(${148 + v * 32} ${95 + v * 7})`}>
            <path d="M0-20v38" stroke="#d9d9a5" strokeWidth="2" />
            <rect
              x="-9"
              y="10"
              width="18"
              height={145 - v * 10}
              rx="8"
              fill="url(#bamboo)"
            />
            <rect
              x="-7"
              y="12"
              width="7"
              height={56 - v * 5}
              rx="3.5"
              fill="#344d37"
            />
            <path
              d={`M-9 ${110 - v * 7}h18M-9 ${117 - v * 7}h18`}
              stroke="#727d4e"
              strokeWidth="2"
            />
            <path
              d={`M2 ${72 - v * 5}v${53 - v * 3}`}
              stroke="#ffffff"
              strokeOpacity=".3"
            />
          </g>
        ))}
        <path
          d="M116 294h272"
          stroke="#99a96d"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="m137 289-9-19m239 19 8-19" stroke="#8da164" strokeWidth="6" />
      </g>
      <path
        d="M394 68v22m-11-11h22M97 209v14m-7-7h14"
        stroke="#e8e9b0"
        strokeOpacity=".65"
      />
      <circle cx="404" cy="230" r="3" fill="#dce5b2" />
    </svg>
  );
}
