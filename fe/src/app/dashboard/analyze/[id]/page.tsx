"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";
import { APP_PATH } from "@/shared/constants/app-path";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useQueryContractDetail from "../../code-gen/[id]/hooks/use-query-contract-detail";
import AiFindingsSection from "./components/ai-findings-section";
import EditorSection from "./components/editor-section";

const AnalyzeResultPage = () => {
  const params = useParams();
  const contractId = params.id?.toString() ?? "";
  const { data, isLoading } = useQueryContractDetail(contractId);

  const fullCode = useMemo(() => {
    const res =
      data?.source_code?.map((lineObj) => lineObj.code).join("\n") ?? "";

    return res;
  }, [data?.source_code]);

  const [finalCode, setFinalCode] = useState(fullCode);

  return (
    <div className="flex h-full flex-col gap-6 border p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={APP_PATH.dashboard.analyze}>
              Analyze
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Result</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <main className="flex grow gap-3 overflow-y-auto">
        <EditorSection finalCode={finalCode} isLoading={isLoading} />
        <AiFindingsSection
          finalCode={finalCode}
          setFinalCode={setFinalCode}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
};

export default AnalyzeResultPage;
