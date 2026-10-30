export function Mark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="DoIT"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      draggable={false}
    />
  );
}
