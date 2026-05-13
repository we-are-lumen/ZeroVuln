"use client";

import CatalogSection from "./components/sections/catalog-section";
import EditorSection from "./components/sections/editor-section";
import FindingsSection from "./components/sections/findings-section";

const AuditPage = () => {
  return (
    <div className="flex h-full gap-3 p-6">
      <CatalogSection />
      <EditorSection />
      <FindingsSection />
    </div>
  );
};

export default AuditPage;
