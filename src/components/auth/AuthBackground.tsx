export default function AuthBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-app" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary-light/30" />
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary-light blur-3xl opacity-70" />
      <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
    </div>
  );
}
