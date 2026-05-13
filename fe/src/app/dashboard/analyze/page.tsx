"use client";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { AiSecurity01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import React, { useRef, useState, useEffect, KeyboardEvent } from "react";
import { toast } from "sonner";

const AnalyzePage = () => {
  const [code, setCode] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Create a ref for the textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 2. Adjust height whenever the code content changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [code]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".sol")) {
      toast.error("Please upload a valid Solidity (.sol) file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCode(content);
      toast.success(`${file.name} uploaded successfully`);
    };
    reader.readAsText(file);
  };

  const handleAnalyze = () => {
    if (!code.trim()) {
      toast.error("Please provide some contract code to analyze");
      return;
    }
    console.log("Analyzing code:", code);
  };

  // 3. Handle Enter to submit for consistent UX
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  return (
    <main className="flex h-full flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center space-y-2 text-center">
        <h2 className="text-4xl font-bold tracking-tight text-white uppercase">
          Analyze Your Smart Contract
        </h2>
        <p className="max-w-[600px] text-sm text-mist-500 md:text-base">
          Identify vulnerabilities and logic flaws in your Solidity code. Paste
          your contract or upload a Solidity file to begin.
        </p>
      </div>

      <div className="w-full max-w-4xl rounded-2xl border border-mist-800 p-1 backdrop-blur-sm">
        <div className="relative flex flex-col space-y-6 rounded-xl bg-mist-950/50 p-6">
          <Textarea
            ref={textareaRef}
            style={{
              minHeight: "10px", // Initial 4 rows
              maxHeight: "210px", // Maximum 8 rows
            }}
            placeholder="Paste your smart contract here"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full resize-none overflow-y-auto border-none bg-transparent text-sm leading-relaxed ring-transparent! focus-visible:ring-0!"
          />

          <div className="flex items-center justify-between border-mist-800">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".sol"
              onChange={handleFileUpload}
            />

            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-mist-400 hover:text-white"
              onClick={() => fileInputRef.current?.click()}
            >
              <HugeiconsIcon icon={Upload01Icon} size={18} fontWeight={2} />
              <span>Upload File</span>
            </Button>

            <Button onClick={handleAnalyze}>
              <HugeiconsIcon
                icon={AiSecurity01Icon}
                size={18}
                strokeWidth={2}
              />
              Analyze
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default AnalyzePage;
