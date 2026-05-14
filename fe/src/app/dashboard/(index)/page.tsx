"use client";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { APP_PATH } from "@/shared/constants/app-path";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";
import {
  ArrowRight02Icon,
  PackageOpenIcon,
  ShieldBlockchainIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import useQueryContract from "./hooks/use-query-contracts";

const DashboardPage = () => {
  const { data, isLoading } = useQueryContract();

  console.log(data);

  const renderCards = () =>
    data?.map(
      ({ uuid, name, status, gas_eslimate, audits, updated_at, language }) => {
        const source = audits?.[0]?.kind ?? null;
        let targetPath: string = APP_PATH.dashboard.codeGen;

        if (source === "codegen") targetPath = APP_PATH.dashboard.codeGen;
        if (source === "audit") targetPath = APP_PATH.dashboard.analyze;

        return (
          <div key={uuid} className="rounded-lg border bg-mist-900/50 p-3">
            <div className="flex justify-between gap-2">
              <div>
                <h3 className="line-clamp-1 font-bold">{name}</h3>
                <p className="text-xs text-mist-500">
                  <span className="capitalize">{language}</span>
                </p>
              </div>
              <Badge variant="outline" className="text-mist-500 capitalize">
                {status}
              </Badge>
            </div>
            <div className="my-4 grid grid-cols-2 border-y py-3">
              <div>
                <h4 className="text-xs text-mist-500">Audits</h4>
                <p className="font-bold">{audits?.length ?? 0}</p>
              </div>
              {/* <div>
                <h4 className="text-xs text-mist-500">Gas</h4>
                <p className="font-bold">{gas_eslimate ?? "-"}</p>
              </div> */}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-mist-500">
                Edited {formatRelativeTime(updated_at)} ago
              </p>
              <Link href={`${targetPath}/${uuid}`}>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-primary hover:text-primary/80"
                >
                  <span>Open</span>
                  <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
                </Button>
              </Link>
            </div>
          </div>
        );
      },
    );

  const renderSkeleton = () =>
    [...Array(8)].map((_, index) => (
      <div
        key={index}
        className="h-44 w-full animate-pulse rounded-lg bg-mist-800"
      ></div>
    ));

  const renderEmptyFallback = () => (
    <div className="flex h-[40dvh] w-full flex-col items-center justify-center rounded-2xl border-2 border-dotted p-3 text-mist-500">
      <HugeiconsIcon icon={PackageOpenIcon} size={52} />
      <h3 className="mt-2 text-xl font-bold text-white">No Projects Yet</h3>
      <p>Generate or analyze to get secured smart contract</p>
      <div className="mt-5 flex gap-2">
        <Button>
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} size={24} />
          <span>Generate Contract</span>
        </Button>
        <Button variant="outline">
          <HugeiconsIcon
            icon={ShieldBlockchainIcon}
            strokeWidth={2}
            size={24}
          />
          Analyze Contract
        </Button>{" "}
      </div>
    </div>
  );

  return (
    <main className="p-6">
      <div className="mb-6 border-b pb-3">
        <h2 className="text-2xl font-bold">Project Workspace</h2>
        <p className="text-sm text-mist-500">
          Manage and review your generated smart contracts, security audits, and
          gas optimization metrics.
        </p>
      </div>
      {data && data.length === 0 && renderEmptyFallback()}

      <section className="grid grid-cols-5 gap-3">
        {isLoading && renderSkeleton()}
        {!isLoading && renderCards()}
      </section>
    </main>
  );
};

export default DashboardPage;
