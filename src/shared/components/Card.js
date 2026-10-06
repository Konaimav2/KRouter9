"use client";
import Icon from "./Icon";
import { cn } from "@/shared/utils/cn";

export default function Card({ children, title, subtitle, icon, action, padding = "md", hover = false, elev = false, className, ...props }) {
  const paddings = { none: "", xs: "p-3", sm: "p-4", md: "p-5", lg: "p-6" };
  return <section className={cn("overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]", elev && "shadow-[var(--shadow-float)]", hover && "hover:bg-[var(--color-surface-hover)]", paddings[padding], className)} {...props}>{title || action ? <header className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3"><div className="flex min-w-0 items-center gap-3">{icon ? <Icon name={icon} className="text-[20px] text-[var(--color-text-muted)]" /> : null}<div>{title ? <h3 className="font-semibold">{title}</h3> : null}{subtitle ? <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p> : null}</div></div>{action}</header> : null}{children}</section>;
}

Card.Section = function CardSection({ children, className, ...props }) {
  return <div className={cn("border-y border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] p-4", className)} {...props}>{children}</div>;
};
Card.Row = function CardRow({ children, className, ...props }) {
  return <div className={cn("-mx-3 border-b border-[var(--color-border-subtle)] px-4 py-3 last:border-b-0 hover:bg-[var(--color-surface-hover)]", className)} {...props}>{children}</div>;
};
Card.ListItem = function CardListItem({ children, actions, className, ...props }) {
  return <div className={cn("flex min-h-[var(--row-h-default)] items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-3 last:border-b-0 hover:bg-[var(--color-surface-hover)]", className)} {...props}><div className="min-w-0 flex-1">{children}</div>{actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}</div>;
};
