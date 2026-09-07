export default function AuthBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-app" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary-light/30" />
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary-light blur-3xl opacity-70 animate-pulse-slow" />
      <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/5 blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-gradient-to-r from-accent/10 via-transparent to-primary/5 blur-3xl opacity-50 animate-rotate-slow" />
    </div>
  );
}
