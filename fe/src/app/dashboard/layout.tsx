import DashboardNavbar from "./(index)/components/dashboard-navbar";
import WalletGuard from "@/shared/components/auth/wallet-guard";

const DashboardLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <WalletGuard>
      <div className="flex h-screen flex-col">
        <DashboardNavbar />
        <div className="grow overflow-y-auto">{children}</div>
      </div>
    </WalletGuard>
  );
};

export default DashboardLayout;
