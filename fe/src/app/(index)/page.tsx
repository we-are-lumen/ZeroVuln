"use client";

import BrandLogo from "@/shared/components/ui/brand-logo";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  CheckmarkCircle04Icon,
  CreditCardPosIcon,
  DiscordIcon,
  GithubIcon,
  Orbit01Icon,
  SparklesIcon,
  TwitterIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react";
import Image from "next/image";
import LandingNavbar from "./components/landing-navbar";

export default function Home() {
  return (
    <main>
      <LandingNavbar />
      <section className="relative z-0 flex h-[90dvh] flex-col items-center justify-center gap-2 overflow-hidden text-center">
        <div className="absolute bottom-[-70%] -z-10 aspect-video w-[120vw]">
          <Image src="/landing-back.png" alt="back" fill />
        </div>
        <div className="absolute bottom-0 h-44 w-full bg-linear-to-t from-background to-transparent"></div>
        <h2 className="text-6xl font-black uppercase">
          Smart contract copilot that <br />{" "}
          <span className="text-primary">signs every line.</span>
        </h2>
        <p className="max-w-[60vw] text-lg text-mist-400">
          Build, audit, fix, and optimize Solidity contracts with AI, with each
          output signed by an Agent ID and stored tamper-evidently in 0G
          Storage. Each contract is deployed with an optional Royalty Protocol
          that automatically splits revenue.
        </p>
        <div className="relative mt-16 flex w-[60vw] flex-col space-y-6 rounded-xl border bg-mist-950/90 p-6 backdrop-blur-sm">
          <Textarea
            style={{
              minHeight: "100px",
              maxHeight: "210px",
            }}
            disabled
            placeholder="Staking pool with daily rewards, max stake of 1000 tokens per address, 7-day withdrawal lock ..."
            className="w-full resize-none overflow-y-auto border-none bg-transparent text-sm leading-relaxed ring-transparent! focus-visible:ring-0!"
          />

          <div className="flex items-center justify-between border-mist-800">
            <input type="file" className="hidden" accept=".sol" />

            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-mist-400 hover:text-white"
            >
              <HugeiconsIcon icon={Upload01Icon} size={18} fontWeight={2} />
              <span>Upload FilOe</span>
            </Button>

            <Button>
              <HugeiconsIcon icon={SparklesIcon} size={24} strokeWidth={2} />
              Generate Contract
            </Button>
          </div>
        </div>
      </section>
      <section className="space-y-10 px-20 py-20">
        <div className="mx-auto max-w-[60vw] space-y-2 text-center">
          <h2 className="text-5xl font-bold">
            PROVEN <span className="text-primary">INTEGRITY</span> AT EVERY LINE
          </h2>
          <p className="text-lg text-mist-400">
            Beyond simple generation, our copilot provides a cryptographically
            signed audit trail for every suggestion. <br /> Powered by 0G, every
            reasoning trace is immutable, verifiable, and permanent.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2 rounded-2xl border bg-mist-900/50 p-6">
            <HugeiconsIcon icon={Orbit01Icon} className="mb-4 text-primary" />
            <h4 className="text-xl font-bold">Unified Lifecycle</h4>
            <p className="text-mist-400">
              Generate, audit, fix, and optimize smart contracts in one
              workspace. Eliminate context-switching between fragmented security
              tools.
            </p>
          </div>
          <div className="space-y-2 rounded-2xl border bg-mist-900/50 p-6">
            <HugeiconsIcon
              icon={CheckmarkCircle04Icon}
              className="mb-4 text-primary"
            />
            <h4 className="text-xl font-bold">Proven Verifiability</h4>
            <p className="text-mist-400">
              Every AI suggestion is signed with an Agent ID and backed by an
              immutable reasoning trace on 0G Storage. This creates a
              cryptographically secure audit trail.
            </p>
          </div>
          <div className="space-y-2 rounded-2xl border bg-mist-900/50 p-6">
            <HugeiconsIcon
              icon={CreditCardPosIcon}
              className="mb-4 text-primary"
            />
            <h4 className="text-xl font-bold">Economic Alignment</h4>
            <p className="text-mist-400">
              Automated revenue splits via Royalty Protocol: 70% developer, 20%
              AI, 10% treasury. Real skin-in-the-game for long-term code
              quality.
            </p>
          </div>
        </div>
      </section>
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
