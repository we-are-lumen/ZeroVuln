"use client";

import { api } from "@/api/client";
import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import BrandLogo from "@/shared/components/ui/brand-logo";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Eip1193Provider } from "@/shared/types/eip1193.type";
import {
  AiBrain04Icon,
  ArrowUpRight01Icon,
  Blockchain03Icon,
  Bug02Icon,
  CheckmarkBadge02Icon,
  CpuIcon,
  Database01Icon,
  DiscordIcon,
  GithubIcon,
  IdentityCardIcon,
  InstallingUpdates01Icon,
  MoneyBag02Icon,
  Rocket01Icon,
  Shield01Icon,
  SparklesIcon,
  Tick02Icon,
  TwitterIcon,
  Upload01Icon,
  UserGroup02Icon,
  Wallet03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Typewriter } from "react-simple-typewriter";
import LandingNavbar from "./components/landing-navbar";
import StatItem from "./components/stat-item";
import useQueryPublicStats from "./hooks/use-query-public-stats";
import { Element } from "react-scroll";
import { ensureOgChain } from "@/shared/lib/wallet/og-chain";
import { toast } from "sonner";
import { APP_PATH } from "@/shared/constants/app-path";

function getEthereum(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

const steps = [
  {
    title: "Connect your wallet",
    description:
      " Click Connect Wallet in the top right. Your wallet address becomes your identity on ZeroVuln. Every audit you run and every contract you generate is tied to your on-chain identity - not a username, not an email.",
  },
  {
    title: "Upload or paste your contract",
    description:
      "Click Upload File to import an existing .sol file, or paste your Solidity code directly into the editor. ZeroVuln accepts any standard Solidity contract. No preprocessing or reformatting required.",
  },
  {
    title: "Review your findings and verify on-chain",
    description:
      "The AI returns a full audit report in under a second. Each finding shows the vulnerability type, severity, attack scenario, and recommended fix. Every finding is signed with an Agent ID and backed by an immutable reasoning trace on 0G Storage. Click any finding to verify the source on-chain.",
  },
];

const promptExamples = [
  "Write a Solidity smart contract named YieldStakingVault using version ^0.8.20. The contract should allow users to stake an external ERC-20 token (passed in the constructor) and earn rewards in a separate ERC-20 token.",
  "Write a custom Multi-Signature wallet contract in Solidity 0.8.x that requires M out of N owners to approve a transaction before execution.",
  "Create a UUPS (UUPSUpgradeable) proxy-compatible contract named GovernanceTimelock using OpenZeppelin Upgradeable contracts.",
  "Write a three-party Escrow smart contract in Solidity. The parties involved are a Buyer, a Seller, and a trusted Arbitrator.",
];

export default function Home() {
  const { data } = useQueryPublicStats();

  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDialogOpen, setisDialogOpen] = useState(false);

  const openDialog = () => setisDialogOpen(true);

  const hasWallet = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(localStorage.getItem("walletAddress"));
  }, []);

  useEffect(() => {
    if (hasWallet) router.replace(APP_PATH.dashboard.index);
  }, [hasWallet, router]);

  async function handleConnect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      toast.error("Wallet provider not found. Please install MetaMask first.");
      return;
    }

    try {
      setIsConnecting(true);
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as unknown as string[];

      await ensureOgChain(ethereum);

      const wallet = accounts?.[0];
      if (!wallet) throw new Error("Tidak ada akun wallet yang dipilih.");

      localStorage.setItem("walletAddress", wallet);

      try {
        await api.get("me").json();
      } catch (e: unknown) {
        console.error(e);
        localStorage.removeItem("walletAddress");
        toast.error("Something went wrong");
        return;
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed connecting to wallet.";
      toast.error(message);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <main>
      <LandingNavbar {...{ handleConnect, isConnecting }} />

      <Dialog open={isDialogOpen} onOpenChange={setisDialogOpen}>
        <form>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Connect Your Wallet</DialogTitle>
              <DialogDescription>
                Please connect your authorized wallet to get started.
              </DialogDescription>
              <div></div>
            </DialogHeader>
            <div className="flex justify-end">
              <Button onClick={handleConnect} disabled={isConnecting}>
                <HugeiconsIcon icon={Wallet03Icon} strokeWidth={2} size={24} />
                Connect Wallet
              </Button>
            </div>
          </DialogContent>
        </form>
      </Dialog>

      <section className="relative z-0 flex h-[90dvh] flex-col items-center justify-center gap-2 overflow-hidden text-center">
        <div className="absolute bottom-[-99%] -z-10 aspect-video w-[120vw]">
          <Image src="/landing-back.png" alt="back" fill loading="eager" />
        </div>
        <div className="absolute bottom-0 h-44 w-full bg-linear-to-t from-background to-transparent"></div>
        <h2 className="text-6xl font-black uppercase">
          Smart contract copilot <br /> that{" "}
          <span className="text-primary">signs every line.</span>
        </h2>
        <p className="max-w-[60vw] text-lg text-mist-400">
          Build, audit, fix, and optimize Solidity contracts with AI, with each
          output signed by an Agent ID and stored tamper-evidently in 0G
          Storage.
        </p>
        <div className="relative mt-10 flex w-[60vw] flex-col space-y-6 rounded-2xl border bg-mist-950/90 p-6 backdrop-blur-sm">
          <div className="h-28 text-start text-mist-400">
            <Typewriter
              words={promptExamples}
              typeSpeed={10}
              deleteSpeed={5}
              loop={false}
            />
          </div>

          <div className="flex items-center justify-between border-mist-800">
            <input type="file" className="hidden" accept=".sol" />

            <Button
              onClick={openDialog}
              variant="ghost"
              size="sm"
              disabled={isConnecting}
              className="gap-2 text-mist-400 hover:text-white"
            >
              <HugeiconsIcon icon={Upload01Icon} size={18} fontWeight={2} />
              <span>Upload File</span>
            </Button>

            <Button disabled={isConnecting} onClick={openDialog}>
              <HugeiconsIcon icon={SparklesIcon} size={24} strokeWidth={2} />
              Generate Contract
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-10 flex h-[70dvh] items-center justify-center gap-20 space-y-10 px-20 pb-20">
        <div className="mx-auto max-w-[60vw] space-y-5 text-center">
          <p className="text-3xl">
            <span className="font-semibold text-primary">$1,766,000,000</span>{" "}
            lost to DeFi exploits in 2024.{" "}
            <span className="font-semibold text-primary">82%</span> of those
            attacks used patterns that had already been documented. The
            knowledge existed. It just{" "}
            <span className="font-semibold text-primary">did not reach</span>{" "}
            the developer in time.
          </p>
          <p className="text-lg text-mist-400 italic">
            — Immunefi Web3 Security Report H1 2024, Chainalysis Crypto Crime
            Report 2024 —
          </p>
        </div>
      </section>

      <Element name="benefits">
        <section
          id="benefits"
          className="mt-10 flex gap-20 space-y-10 px-20 py-20"
        >
          <div className="mx-auto max-w-[60vw] basis-[60%]">
            <div className="sticky top-32 space-y-5">
              <h2 className="text-5xl font-bold">
                WHY DEVELOPERS SHIP <br />{" "}
                <span className="text-primary">SAFER CONTRACTS</span> <br />{" "}
                WITH ZEROVULN
              </h2>
              <p className="text-lg text-mist-400">
                Most smart contract exploits are not novel attacks. They are
                known patterns that never reached the right developer at the
                right time. ZeroVuln puts the collective knowledge of the
                security research community directly inside your development
                workflow - signed, verified, and always on.
              </p>
            </div>
          </div>
          <div className="flex basis-[40%] flex-col gap-4">
            <div className="space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={Rocket01Icon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">Speed </h4>
              <p className="text-mist-400">
                Audit in seconds, not weeks. Paste your contract. Get a full AI
                audit in under a second. No waiting for a firm to schedule your
                project. No weeks of back-and-forth. Ship on your own timeline.
              </p>
            </div>
            <div className="space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={MoneyBag02Icon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">Cost</h4>
              <p className="text-mist-400">
                Professional-grade security at $30 a month. A traditional smart
                contract audit costs $10,000 to $50,000. ZeroVuln gives indie
                developers and small teams access to the same quality of
                security knowledge - at a price that makes sense before you have
                revenue.
              </p>
            </div>
            <div className="space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={CheckmarkBadge02Icon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">Verifiability </h4>
              <p className="text-mist-400">
                Every finding is provable, not just claimed. Every AI output is
                signed with an Agent ID and backed by an immutable reasoning
                trace on 0G Storage. You can verify the logic behind any finding
                - independently, on-chain, at any time. This is not trust. This
                is proof.
              </p>
            </div>
            <div className="space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={InstallingUpdates01Icon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">Training</h4>
              <p className="text-mist-400">
                Trained by real whitehat hackers. ZeroVuln is not trained on
                generic code datasets. Every vulnerability pattern in our model
                was submitted by a security researcher, validated by a senior
                auditor, and anchored on-chain before it entered a single
                training run.
              </p>
            </div>
          </div>
        </section>
      </Element>

      <Element name="spesifications">
        <section className="space-y-10 px-20 py-24">
          <div className="mx-auto max-w-[70vw] space-y-5 text-center">
            <h2 className="text-5xl font-bold uppercase">
              Built on <span className="text-primary">0G</span>. Verified at
              every step.
            </h2>
            <p className="text-lg text-mist-400">
              ZeroVuln uses 0G&apos;s modular infrastructure end to end - from
              storing vulnerability labels to signing every AI output. Every
              component is chosen because it makes the audit trail verifiable,
              not just logged.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <div className="w-[30%] space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={Database01Icon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">0G Storage</h4>
              <p className="text-mist-400">
                Every vulnerability label, reasoning trace, and training dataset
                is stored on 0G Storage. Content-addressed and immutable - once
                a label lands, it cannot be altered. Only verified.
              </p>
            </div>
            <div className="w-[30%] space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon icon={CpuIcon} className="mb-4 text-primary" />
              <h4 className="text-xl font-bold">0G Compute</h4>
              <p className="text-mist-400">
                The AI model fine-tunes weekly on validated labels using 0G
                Compute. Inference runs inside a Trusted Execution Environment
                via Phala dStack - so the model output is tamper-proof, not just
                stored.
              </p>
            </div>
            <div className="w-[30%] space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={Blockchain03Icon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">0G Chain</h4>
              <p className="text-mist-400">
                Every audit finding and reviewer verdict is anchored on 0G
                Chain. The record is permanent, publicly verifiable, and tied to
                the wallet address of the researcher who contributed the
                original vulnerability pattern.
              </p>
            </div>
            <div className="w-[30%] space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={IdentityCardIcon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">Agent ID</h4>
              <p className="text-mist-400">
                Every AI output is signed with an Agent ID - a cryptographic
                identity standard for AI agents on 0G. You always know which
                agent produced a result, when it was produced, and what
                reasoning it used.
              </p>
            </div>
            <div className="w-[30%] space-y-2 rounded-2xl border bg-mist-900/50 p-6">
              <HugeiconsIcon
                icon={AiBrain04Icon}
                className="mb-4 text-primary"
              />
              <h4 className="text-xl font-bold">AI Model</h4>
              <p className="text-mist-400">
                Qwen2.5-Coder, fine-tuned weekly via LoRA on expert-validated
                vulnerability labels. Delivered via Hugging Face. Training data
                sourced exclusively from verified whitehat researcher
                submissions - no generic code datasets.
              </p>
            </div>
          </div>
        </section>
      </Element>

      <section className="px-20 py-24">
        <div className="mx-auto max-w-[70vw] space-y-5 text-center">
          <h2 className="text-5xl font-bold uppercase">
            The Pulse of <span className="text-primary">Network Security</span>
          </h2>
          <p className="text-lg text-mist-400">
            ZeroVuln is more than just a copilot. It’s a thriving decentralized
            ecosystem. <br /> To date, we have distributed a{" "}
            <span className="font-bold text-white">
              whopping total reward of{" "}
              {data?.total_reward_distributed?.toLocaleString() ?? "0"} 0G
            </span>{" "}
            to our contributors, fueling a new era of tamper-evident code.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-12 border-mist-800/50 pt-16">
          <StatItem
            icon={Bug02Icon}
            label="Submitted Findings"
            value={data?.total_submitted_findings ?? 0}
          />
          <StatItem
            icon={Shield01Icon}
            label="Contracts Secured"
            value={data?.total_smart_contracts_secured ?? 0}
          />
          <StatItem
            icon={UserGroup02Icon}
            label="Active Auditors"
            value={data?.total_active_auditors ?? 0}
          />
        </div>
      </section>

      <Element name="how-to">
        <section className="flex flex-col items-center justify-center gap-20 px-20 py-24">
          <div className="mx-auto max-w-[70vw] space-y-5 text-center">
            <h2 className="text-5xl font-bold uppercase">
              From code to verified audit <br /> in{" "}
              <span className="text-primary">three steps</span>
            </h2>
            <p className="text-lg text-mist-400">
              No setup. No integrations. No waiting for a firm to reply. Connect
              your wallet, paste your contract, and get an AI-powered audit with
              a cryptographically verifiable trail - in under a minute.
            </p>
          </div>
          <Stepper
            className="flex max-w-[40vw] flex-col items-center justify-center gap-10"
            defaultValue={0}
            orientation="vertical"
            indicators={{
              completed: <HugeiconsIcon icon={Tick02Icon} size={16} />,
            }}
          >
            <StepperNav>
              {steps.map((step, index) => (
                <StepperItem
                  key={index}
                  step={index + 1}
                  className="relative items-start not-last:flex-1"
                >
                  <StepperTrigger className="items-start gap-2.5 pb-12 last:pb-0">
                    <StepperIndicator className="data-[state=completed]:bg-success data-[state=completed]:text-white">
                      {index + 1}
                    </StepperIndicator>
                    <div className="mt-0.5 -translate-y-1 text-left">
                      <StepperTitle className="text-lg">
                        {step.title}
                      </StepperTitle>
                      <StepperDescription className="text-base">
                        {step.description}
                      </StepperDescription>
                      {index === 1 && (
                        <div>
                          <div className="flex items-center gap-5 py-3 text-mist-500">
                            <div className="h-px w-full bg-mist-600"></div>
                            <p>or</p>
                            <div className="h-px w-full bg-mist-600"></div>
                          </div>
                          <div>
                            <StepperTitle className="text-lg">
                              Describe what you want to build
                            </StepperTitle>
                            <StepperDescription className="text-base">
                              Click Generate Contract and describe your contract
                              in plain English. Specify the token type, access
                              controls, transfer rules, or any other logic. The
                              AI generates production-ready Solidity from your
                              description - no prior Solidity experience
                              required to get started.
                            </StepperDescription>
                          </div>
                        </div>
                      )}
                    </div>
                  </StepperTrigger>
                  {index < steps.length - 1 && (
                    <StepperSeparator className="group-data-[state=completed]/step:bg-success absolute inset-y-0 top-7 left-3 -order-1 m-0 -translate-x-1/2 group-data-[orientation=vertical]/stepper-nav:h-[calc(100%-2rem)]" />
                  )}
                </StepperItem>
              ))}
            </StepperNav>
          </Stepper>
        </section>
      </Element>

      <Element name="contribute">
        <section className="px-20 py-24">
          <div className="space-y-5 rounded-2xl border-2 bg-mist-900/50 p-6 py-10 text-center">
            <h2 className="text-4xl font-bold uppercase">
              Are you a security researcher? <br />{" "}
              <span className="text-primary">Contribute</span> and{" "}
              <span className="text-primary">earn</span>.
            </h2>
            <p className="text-lg font-medium text-mist-400">
              Submit a structured vulnerability pattern - the code, the attack
              scenario, and the fix. A senior auditor reviews and validates your
              submission on-chain. Once approved, your label enters the training
              set and your wallet address is permanently attributed to every
              finding it generates. The more your pattern matches in live
              audits, the more recognition your contribution carries on-chain.
            </p>
            <div className="mt-10 space-y-2">
              <Button disabled={isConnecting} onClick={openDialog}>
                Audit Your First Contract{" "}
                <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} />
              </Button>
              <p className="text-sm text-mist-400">
                No credit card. No setup. Connect your wallet and ready to go.
              </p>
            </div>
          </div>
        </section>
      </Element>

      <footer className="border-t border-mist-800 px-20 py-16">
        <div className="grid grid-cols-4 gap-12">
          <div className="col-span-1 space-y-6">
            <BrandLogo />
            <p className="text-sm leading-relaxed text-mist-500">
              The first AI-driven development environment with on-chain
              verifiability and automated economic alignment.
            </p>
            <div className="flex gap-4">
              <FooterSocialIcon icon={GithubIcon} />
              <FooterSocialIcon icon={TwitterIcon} />
              <FooterSocialIcon icon={DiscordIcon} />
            </div>
          </div>

          <FooterColumn
            title="Product"
            links={["Features", "Pricing", "Audit Engine", "Royalty Protocol"]}
          />
          <FooterColumn
            title="Resources"
            links={["Documentation", "API Reference", "Hacks", "Security Tips"]}
          />
          <FooterColumn
            title="Company"
            links={[
              "About Us",
              "Contact",
              "Terms of Service",
              "Privacy Policy",
            ]}
          />
        </div>
        <div className="mt-16 flex items-center justify-between border-t border-mist-900 pt-8 text-xs text-mist-600">
          <p>© 2026 ZeroVuln. All rights reserved.</p>
          <p>Built for the 0G APAC Hackathon</p>
        </div>
      </footer>
    </main>
  );
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="space-y-6">
      <h5 className="text-sm font-bold tracking-widest text-white uppercase">
        {title}
      </h5>
      <ul className="space-y-4 text-sm text-mist-500">
        {links.map((link) => (
          <li
            key={link}
            className="cursor-pointer transition-colors hover:text-primary"
          >
            {link}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterSocialIcon({ icon }: { icon: IconSvgElement }) {
  return (
    <div className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-mist-800 bg-mist-950 text-mist-400 transition-all hover:border-primary hover:text-primary">
      <HugeiconsIcon icon={icon} size={20} />
    </div>
  );
}
