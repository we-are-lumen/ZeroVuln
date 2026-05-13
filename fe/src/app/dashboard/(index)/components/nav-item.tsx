"use client";

import { cn } from "@/shared/lib/utils";
import { AppPath } from "@/shared/types/app.path.type";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItemProps {
  href: AppPath;
  label: string;
}

const NavItem = ({ href, label }: NavItemProps) => {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-4 py-1 text-sm transition-colors hover:text-primary",
        isActive
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-transparent text-muted-foreground",
      )}
    >
      {label}
    </Link>
  );
};

export default NavItem;
