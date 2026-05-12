"use client";

import CatalogSection from "./components/sections/catalog-section";
import EditorSection from "./components/sections/editor-section";

const AuditPage = () => {
  return (
    <div className="flex h-full gap-3 p-6">
      <CatalogSection />
      <EditorSection />
    </div>
  );
};

export default AuditPage;
