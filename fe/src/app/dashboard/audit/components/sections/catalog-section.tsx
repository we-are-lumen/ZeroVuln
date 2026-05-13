"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import useQueryContractCatalog from "../../hooks/use-query-contract-catalog";
import { cn } from "@/shared/lib/utils";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";

const CatalogSection = () => {
  const { data } = useQueryContractCatalog();
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
              <p className="text-xs text-mist-400 capitalize">
                {language} · Expires in {formatRelativeTime(expired_at)}
              </p>
            </div>
            <div className="mt-4 flex border-y py-2">
              <div className="flex w-1/2 flex-col">
                <h5 className="text-xs text-mist-400">Gas</h5>
                <p className="font-bold">{gas_eslimate ?? "-"}</p>
              </div>
              <div className="flex w-1/2 flex-col">
                <h5 className="text-xs text-mist-400">Reward</h5>
                <p className="font-bold">{reward_per_finding ?? "-"}</p>
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

  return (
    <section className="h-full basis-[20%] rounded-2xl border bg-mist-900/50">
      <div className="border-b px-6 py-3">
        <h3 className="text-sm font-bold text-mist-400">CATALOG</h3>
      </div>
      <div className="grow space-y-3 overflow-y-auto p-6">{renderCards()}</div>
    </section>
  );
};

export default CatalogSection;
