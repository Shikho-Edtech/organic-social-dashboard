import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: Props) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-6 ${className}`}>
      {children}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  caption,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div>{children}</div>
      {caption && <p className="text-xs text-slate-500 mt-4 leading-relaxed">{caption}</p>}
    </Card>
  );
}
