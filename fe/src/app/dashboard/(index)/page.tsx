"use client";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import useQueryContract from "./hooks/use-query-contracts";

const DashboardPage = () => {
  const { data, isLoading, isError, error } = useQueryContract();
  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : "Unknown error";

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

  const renderSkeleton = () =>
    [...Array(8)].map((_, index) => (
      <div
        key={index}
        className="h-44 w-full animate-pulse rounded-lg bg-mist-800"
      ></div>
    ));

  return (
    <main className="p-6">
      <div className="mb-6 border-b pb-3">
        <h2 className="text-2xl font-bold">Project Workspace</h2>
        <p className="text-mist-500">
          Manage and review your generated smart contracts, security audits, and
          gas optimization metrics.
        </p>
      </div>
      {isLoading ? (
        <div className="text-sm text-mist-500">Loading contracts...</div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold">Gagal mengambil data dari backend.</p>
          <p className="mt-1 break-words text-mist-500">
            {errorMessage}
          </p>
          <p className="mt-2 text-mist-500">
            Cek apakah <code>NEXT_PUBLIC_API_BASE_URL</code> &{" "}
            <code>NEXT_PUBLIC_BEARER_TOKEN</code> sudah benar dan backend sedang
            jalan.
          </p>
        </div>
      ) : !data?.length ? (
        <div className="rounded-lg border bg-mist-900/30 p-6">
          <p className="font-semibold">Belum ada contract untuk wallet ini.</p>
          <p className="mt-1 text-sm text-mist-500">
            Coba buat contract dulu lewat menu <span className="font-medium">Code Gen</span> atau{" "}
            <span className="font-medium">Audit</span>.
          </p>
          <div className="mt-4 flex gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/code-gen">Ke Code Gen</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/audit">Ke Audit</Link>
            </Button>
          </div>
        </div>
      ) : (
        <section className="grid grid-cols-4 gap-3">{renderCards()}</section>
      )}
    </main>
  );
};

export default DashboardPage;
