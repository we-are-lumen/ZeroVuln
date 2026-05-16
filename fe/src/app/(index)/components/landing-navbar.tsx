import BrandLogo from "@/shared/components/ui/brand-logo";
import { Button } from "@/shared/components/ui/button";
import { APP_PATH } from "@/shared/constants/app-path";
import { Wallet03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { Link as ScrollTo } from "react-scroll";

const LandingNavbar = ({
  handleConnect,
  isConnecting,
}: {
  handleConnect: () => void;
  isConnecting: boolean;
}) => {
  return (
    <nav className="sticky top-0 z-20 flex items-center justify-between bg-mist-950/80 px-20 py-3 backdrop-blur-md">
      <Link href={APP_PATH.landing}>
        <BrandLogo className="text-primary" />
      </Link>

      <div className="space-x-2 text-mist-400">
        <ScrollTo
          smooth
          to="benefits"
          className="cursor-pointer px-4 py-2 transition-all duration-300 hover:text-white"
        >
          Benefits
        </ScrollTo>
        <ScrollTo
          smooth
          to="spesifications"
          className="cursor-pointer px-4 py-2 transition-all duration-300 hover:text-white"
        >
          Specifications
        </ScrollTo>
        <ScrollTo
          smooth
          to="how-to"
          className="cursor-pointer px-4 py-2 transition-all duration-300 hover:text-white"
        >
          How-to
        </ScrollTo>
        <ScrollTo
          smooth
          to="contribute"
          className="cursor-pointer px-4 py-2 transition-all duration-300 hover:text-white"
        >
          Contribute
        </ScrollTo>
      </div>

      <Button onClick={handleConnect} disabled={isConnecting}>
        <HugeiconsIcon icon={Wallet03Icon} strokeWidth={2} size={24} />
        Connect Wallet
      </Button>
    </nav>
  );
};

export default LandingNavbar;
