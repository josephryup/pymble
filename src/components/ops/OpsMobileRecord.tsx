type OpsMobileRecordProps = {
  children: React.ReactNode;
};

export function OpsMobileRecordList({ children }: OpsMobileRecordProps) {
  return <div className="grid gap-3 md:hidden">{children}</div>;
}

export function OpsMobileRecordCard({ children }: OpsMobileRecordProps) {
  return (
    <article className="rounded-lg border border-primary-dark/10 bg-white p-4 shadow-sm">
      <div className="grid gap-3">{children}</div>
    </article>
  );
}

export function OpsMobileRecordRow({
  children,
  label,
}: OpsMobileRecordProps & {
  label: string;
}) {
  return (
    <div className="border-t border-primary-dark/10 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold leading-6 text-primary-dark">{children}</div>
    </div>
  );
}
