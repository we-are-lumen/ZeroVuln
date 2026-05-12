"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import useQueryContractCatalog from "../../hooks/use-query-contract-catalog";
import { cn } from "@/shared/lib/utils";

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
    data?.map(({ uuid, name, reward_per_finding }) => {
      const isSelected = selectedScId === uuid;

      return (
        <div
          key={uuid}
          className={cn(
            "rounded-md border p-3",
            isSelected && "border-primary",
          )}
        >
          <h4 className="font-semibold">{name}</h4>
          <div className="mt-5 flex items-end justify-between">
            <p className="text-xs text-muted-foreground">
              {reward_per_finding}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={isSelected}
              onClick={handleSelect(uuid)}
            >
              See Detail
            </Button>
          </div>
        </div>
      );
    });

  return (
    <section className="h-full basis-[25%] rounded-lg border bg-mist-900/50">
      <div className="border-b px-6 py-3">
        <h3 className="text-sm font-bold text-mist-400">CATALOG</h3>
      </div>
      <div className="grow space-y-3 overflow-y-auto p-6">{renderCards()}</div>
    </section>
  );
};

export default CatalogSection;
