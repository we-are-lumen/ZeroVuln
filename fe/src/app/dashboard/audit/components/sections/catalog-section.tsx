"use client";

import { Button } from "@/shared/components/ui/button";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";
import { cn } from "@/shared/lib/utils";
import { Radar02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import useQueryContractCatalog from "../../hooks/use-query-contract-catalog";

const CatalogSection = () => {
  const { data, isLoading } = useQueryContractCatalog();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedScId = searchParams.get("selected_sc");

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);
      return params.toString();
    },
    [searchParams],
  );

  const handleSelect = (uuid: string) => () => {
    const queryString = createQueryString("selected_sc", uuid);
    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const renderCards = () =>
    data?.map(
      ({
        uuid,
        name,
        reward_per_finding,
        gas_eslimate,
        language,
        created_at,
        expired_at,
      }) => {
        const isSelected = selectedScId === uuid;

        return (
          <div
            key={uuid}
            className={cn(
              "space-y-3 rounded-lg border p-3",
              isSelected && "border-primary bg-primary/10",
            )}
          >
            <div>
              <h4 className="line-clamp-1 font-semibold">{name}</h4>
              <p className="text-xs text-mist-400">
                <span className="capitalize">{language}</span> · Expires in{" "}
                {formatRelativeTime(expired_at)}
              </p>
            </div>
            <div className="mt-4 flex border-y py-2">
              {/* <div className="flex w-1/2 flex-col">
                <h5 className="text-xs text-mist-400">Gas</h5>
                <p className="font-bold">{gas_eslimate ?? "-"}</p>
              </div> */}
              <div className="flex w-1/2 flex-col">
                <h5 className="text-xs text-mist-400">Reward</h5>
                <p className="font-bold">{reward_per_finding ?? "0"} 0G</p>
              </div>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(created_at)} ago
              </p>
              <Button
                size="xs"
                variant="outline"
                disabled={isSelected}
                onClick={handleSelect(uuid)}
              >
                See Detail
              </Button>
            </div>
          </div>
        );
      },
    );

  const renderSkeleton = () =>
    [...Array(5)].map((_, index) => (
      <div
        key={index}
        className="h-32 w-full animate-pulse rounded-lg bg-mist-800"
      ></div>
    ));

  return (
    <section className="flex h-full basis-[20%] flex-col rounded-2xl border bg-mist-900/50">
      <div className="border-b p-3">
        <div className="flex items-center gap-2 text-mist-400">
          <HugeiconsIcon icon={Radar02Icon} size={20} strokeWidth={2} />
          <h3 className="text-sm font-bold">CATALOG</h3>
        </div>
      </div>
      <div className="grow space-y-3 overflow-y-auto p-3">
        {isLoading && renderSkeleton()}
        {!isLoading && renderCards()}
      </div>
    </section>
  );
};

export default CatalogSection;
