"use client";

import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { APP_PATH } from "@/shared/constants/app-path";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useGenerateSmartContract } from "./hooks/use-generate-smart-contract";
import { ChangeEvent, useState } from "react";

const CodeGenPage = () => {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  const { mutateAsync: generate, isPending } = useGenerateSmartContract();

  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    setPrompt(e.target.value);

  const handleGenerate = async () => {
    if (prompt.trim().length <= 1) {
      toast.error("Please provide a more detailed description.");
      return;
    }

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
  };

  return (
    <main className="-mt-20 flex h-screen w-full flex-col items-center justify-center gap-5 p-6">
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
          rows={8}
          value={prompt}
          onChange={handlePromptChange}
          disabled={isPending}
          className="w-full resize-none border-none bg-transparent text-sm leading-relaxed ring-transparent! focus-visible:ring-0 disabled:opacity-50"
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
