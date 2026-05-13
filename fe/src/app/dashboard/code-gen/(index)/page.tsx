"use client";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { APP_PATH } from "@/shared/constants/app-path";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useGenerateSmartContract } from "./hooks/use-generate-smart-contract";
import { ChangeEvent, useState, KeyboardEvent, useRef, useEffect } from "react";
import { payForFeature } from "@/shared/lib/zv-contract";

const CodeGenPage = () => {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutateAsync: generate, isPending } = useGenerateSmartContract();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [prompt]);

  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    setPrompt(e.target.value);

  const handleGenerate = async () => {
    if (prompt.trim().length <= 1) {
      toast.error("Please provide a more detailed description.");
      return;
    }

    try {
      // Bayar 0.1 0g (fee on-chain) sebelum menggunakan fitur CodeGen
      await toast.promise(payForFeature("CodeGen", `codegen:${Date.now()}`), {
        loading: "Memproses pembayaran 0.1 0g...",
        success: () => "Pembayaran berhasil.",
        error: (err: unknown) =>
          err instanceof Error ? err.message : "Pembayaran gagal.",
      });

      toast.promise(generate({ prompt }), {
        loading: "AI is crafting your Solidity contract...",
        success: (data) => {
          if (!data.generated_code || data.generated_code.length <= 1) {
            throw new Error("Generation failed: Empty code received.");
          }

          router.push(`${APP_PATH.dashboard.codeGen}/${data.contract_id}`);
          return "Contract generated successfully!";
        },
        error: (err: Error) => {
          return (
            err.message || "Failed to generate smart contract. Please try again."
          );
        },
      });
    } catch {
      // toast sudah handle error message
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-5 p-6">
      <div className="mb-8 flex flex-col items-center space-y-2 text-center">
        <h2 className="text-4xl font-bold tracking-tight text-white uppercase">
          Describe What You Want to Build
        </h2>
        <p className="max-w-[600px] text-sm text-mist-500 md:text-base">
          Transform natural language into secure Solidity contracts. Grounded in
          our verified template library for maximum reliability.
        </p>
      </div>

      <section className="w-full max-w-4xl space-y-6 rounded-2xl border border-mist-800 bg-mist-950/50 p-6 backdrop-blur-sm">
        <Textarea
          ref={textareaRef}
          style={{
            minHeight: "10px",
            maxHeight: "210px",
          }}
          value={prompt}
          onChange={handlePromptChange}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          className="w-full resize-none overflow-y-auto border-none bg-transparent text-sm leading-relaxed ring-transparent! focus-visible:ring-0 disabled:opacity-50"
          placeholder="e.g. staking pool with daily rewards, max stake 1000 tokens..."
        />
        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={isPending}>
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              size={18}
              className={isPending ? "animate-pulse" : ""}
            />
            {isPending ? "Generating..." : "Generate"}
          </Button>
        </div>
      </section>
    </main>
  );
};

export default CodeGenPage;
