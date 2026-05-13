import AdminNavbar from "./(index)/components/admin-navbar";

const AdminLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div className="flex h-screen flex-col">
      <AdminNavbar />
      <div className="grow overflow-y-auto">{children}</div>
    </div>
  );
};

export default AdminLayout;
