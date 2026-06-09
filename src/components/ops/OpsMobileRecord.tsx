import { Card, CardContent } from "@/components/ui/card";

type OpsMobileRecordProps = {
  children: React.ReactNode;
};

export function OpsMobileRecordList({ children }: OpsMobileRecordProps) {
  return <div className="grid gap-3 md:hidden">{children}</div>;
}

export function OpsMobileRecordCard({ children }: OpsMobileRecordProps) {
  return (
    <Card className="py-0 shadow-sm">
      <CardContent className="grid gap-3 p-4">{children}</CardContent>
    </Card>
  );
}

export function OpsMobileRecordRow({
  children,
  label,
}: OpsMobileRecordProps & {
  label: string;
}) {
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold leading-6 text-foreground">{children}</div>
    </div>
  );
}
