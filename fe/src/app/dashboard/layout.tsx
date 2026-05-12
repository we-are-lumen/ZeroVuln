import DashboardNavbar from "./(index)/components/dashboard-navbar";

const DashboardLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div className="flex h-screen flex-col">
      <DashboardNavbar />
      <div className="grow overflow-y-auto">{children}</div>
    </div>
  );
};

export default DashboardLayout;
