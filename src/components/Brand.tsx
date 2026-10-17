export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "brand-small" : ""}`}>
      <svg aria-hidden="true" viewBox="0 0 48 40">
        <circle cx="18" cy="20" r="15" />
        <circle cx="30" cy="20" r="15" />
        <path d="M24 6a15 15 0 0 1 0 28 15 15 0 0 1 0-28" />
      </svg>
      <div>
        <span className="brand-title">答案之间</span>
        <span className="brand-en">BETWEEN ANSWERS</span>
      </div>
    </div>
  );
}
