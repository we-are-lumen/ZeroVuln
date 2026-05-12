import DashboardNavbar from "./components/dashboard-navbar";

const DashboardLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div>
      <DashboardNavbar />
      {children}
    </div>
  );
};

export default DashboardLayout;
