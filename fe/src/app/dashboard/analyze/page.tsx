"use client";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { APP_PATH } from "@/shared/constants/app-path";
import { payForFeature } from "@/shared/lib/zv-contract";
import { ShieldBlockchainIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import React, { KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useAnalyzeSmartContract from "./hooks/use-analyze-smart-contract";

const AnalyzePage = () => {
  const [code, setCode] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { mutateAsync: analyze, isPending } = useAnalyzeSmartContract();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleAnalyze = async () => {
    if (!code.trim()) {
      toast.error("Please provide some contract code to analyze");
      return;
    }

    try {
      await toast.promise(payForFeature("Analyze", `analyze:${Date.now()}`), {
        loading: "Memproses pembayaran 0.1 0g...",
        success: () => "Pembayaran berhasil.",
        error: (err: unknown) =>
          err instanceof Error ? err.message : "Pembayaran gagal.",
      });

      await toast.promise(analyze({ code }), {
        loading: "Menganalisis smart contract...",
        success: (data) => {
          router.push(`${APP_PATH.dashboard.codeGen}/${data.contract_id}`);
          return "Analisis selesai.";
        },
        error: (err: unknown) =>
          err instanceof Error ? err.message : "Gagal analyze smart contract.",
      });
    } catch {
      // toast sudah handle
    }
  };

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
              minHeight: "10px",
              maxHeight: "210px",
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
                icon={ShieldBlockchainIcon}
                size={24}
                strokeWidth={2}
              />
              {isPending ? "Analyzing..." : "Analyze"}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default AnalyzePage;
