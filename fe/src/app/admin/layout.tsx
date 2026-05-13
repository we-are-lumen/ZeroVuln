import { Suspense } from "react";
import AdminNavbar from "./(index)/components/admin-navbar";

const AdminLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div className="flex h-screen flex-col">
      <AdminNavbar />
      <div className="grow overflow-y-auto">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
};

export default AdminLayout;
