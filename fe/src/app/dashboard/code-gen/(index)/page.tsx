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
import { useMutation } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";

const CodeGenPage = () => {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
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

  const { mutate: pay, isPending: isPaying } = useMutation({
    mutationFn: () => payForFeature("CodeGen", `codegen:${Date.now()}`),
    onMutate: () => {
      toast.loading("Processing payment", { id: "pay-toast" });
    },
    onSuccess: () => {
      toast.success("Pembayaran berhasil.", { id: "pay-toast" });

      toast.promise(generate({ prompt }), {
        loading: "AI is crafting your smart contract...",
        success: (data) => {
          if (!data.generated_code || data.generated_code.length <= 1) {
            throw new Error("Generation failed: Empty code received.");
          }

          router.push(`${APP_PATH.dashboard.codeGen}/${data.contract_id}`);
          return "Contract generated successfully!";
        },
        error: (err: Error) =>
          err.message || "Failed to generate smart contract.",
      });
    },
    onError: () => {
      const message = "Payment failed";
      toast.error(message, { id: "pay-toast" });
    },
  });

  const handleGenerate = () => {
    if (prompt.trim().length <= 1) {
      toast.error("Please provide a more detailed description.");
      return;
    }
    setIsConfirmOpen(true);
  };

  const handleConfirmPay = () => {
    setIsConfirmOpen(false);
    pay();
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
          disabled={isPending || isPaying}
          className="w-full resize-none overflow-y-auto border-none bg-transparent text-sm leading-relaxed ring-transparent! focus-visible:ring-0 disabled:opacity-50"
          placeholder="e.g. staking pool with daily rewards, max stake 1000 tokens..."
        />
        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={isPending || isPaying}>
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              size={18}
              className={isPending || isPaying ? "animate-pulse" : ""}
            />
            {isPending || isPaying ? "Generating..." : "Generate"}
          </Button>
        </div>

        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent className="border-mist-800 bg-mist-950 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Transaction</AlertDialogTitle>
              <AlertDialogDescription className="text-mist-400">
                Generating this smart contract requires a network fee of
                <span className="font-bold text-primary"> 0.1 0g</span>. Please
                confirm you want to proceed with the payment.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-mist-800 bg-transparent hover:bg-mist-900 hover:text-white">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmPay}
                className="bg-primary hover:bg-primary/90"
              >
                Confirm & Pay
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </main>
  );
};

export default CodeGenPage;
