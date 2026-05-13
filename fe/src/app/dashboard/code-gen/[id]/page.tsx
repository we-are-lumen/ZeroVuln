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
import EditorSection from "./components/sections/editor-section";
import AiFindingsSection from "./components/sections/ai-findings-section";

const CodeGenResultPage = () => {
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={APP_PATH.dashboard.codeGen}>
              Code Gen
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Result</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <main className="flex grow gap-3 overflow-y-auto">
        <EditorSection />
        <AiFindingsSection />
      </main>
    </div>
  );
};

export default CodeGenResultPage;
