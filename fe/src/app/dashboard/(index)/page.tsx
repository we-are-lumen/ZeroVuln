"use client";

import { Badge } from "@/shared/components/ui/badge";
import useQueryContract from "./hooks/use-query-contracts";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";
import { Button } from "@/shared/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";

const DashboardPage = () => {
  const { data } = useQueryContract();

  const renderCards = () =>
    data?.map(
      ({ uuid, name, status, gas_eslimate, audits, updated_at, language }) => (
        <div key={uuid} className="rounded-lg border bg-mist-900/50 p-3">
          <div className="flex justify-between">
            <div>
              <h3 className="line-clamp-1 font-bold">{name}</h3>
              <p className="text-xs text-mist-500">
                <span className="capitalize">{language}</span>
              </p>
            </div>
            <Badge variant="outline" className="capitalize">
              {status}
            </Badge>
          </div>
          <div className="my-4 grid grid-cols-2 border-y py-3">
            <div>
              <h4 className="text-xs text-mist-500">Audits</h4>
              <p className="font-bold">{audits?.length ?? 0}</p>
            </div>
            <div>
              <h4 className="text-xs text-mist-500">Gas</h4>
              <p className="font-bold">{gas_eslimate ?? "-"}</p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-xs text-mist-500">
              Edited {formatRelativeTime(updated_at)} ago
            </p>
            <Button size="xs" variant="outline">
              <span>Open</span>
              <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
            </Button>
          </div>
        </div>
      ),
    );

  return (
    <main className="p-6">
      <div className="mb-6 border-b pb-3">
        <h2 className="text-2xl font-bold">Project Workspace</h2>
        <p className="text-mist-500">
          Manage and review your generated smart contracts, security audits, and
          gas optimization metrics.
        </p>
      </div>
      <section className="grid grid-cols-4 gap-3">{renderCards()}</section>
    </main>
  );
};

export default DashboardPage;
