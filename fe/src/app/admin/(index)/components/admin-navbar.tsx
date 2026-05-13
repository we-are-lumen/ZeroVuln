import Link from "next/link";
import Image from "next/image";
import NavItem from "@/app/dashboard/(index)/components/nav-item";
import { navItems } from "../constants/nav-items";

const AdminNavbar = () => {
  const renderNavItems = () =>
    navItems.map((props, index) => <NavItem key={index} {...props} />);

  return (
    <nav className="flex items-center justify-between border-b px-6 py-3">
      <Link href="/">
        <Image
          src={"/brand-logo-white.png"}
          alt="Brand Logo"
          width={30}
          height={30}
          priority
        />
      </Link>

      <div className="flex items-center">{renderNavItems()}</div>

      <div className="flex items-center gap-2 rounded-md border px-4 py-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75 delay-500 duration-1000"></span>
          <span className="relative inline-flex size-2 rounded-full bg-green-500"></span>
        </span>
        <p className="text-sm">0x4a2f...8c9d</p>
      </div>
    </nav>
  );
};

export default AdminNavbar;
