import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const CodeGenPage = () => {
  return (
    <main className="-mt-20 flex h-screen w-full flex-col items-center justify-center gap-5 p-6">
      <div className="mb-8 flex flex-col items-center space-y-2 text-center">
        <h2 className="text-4xl font-bold tracking-tight text-white uppercase">
          Describe What You Want to Build
        </h2>
        <p className="max-w-[600px] text-sm text-zinc-500 md:text-base">
          Transform natural language into secure Solidity contracts. Grounded in
          our verified template library for maximum reliability.
        </p>
      </div>
      <section className="w-full max-w-4xl space-y-6 rounded-2xl border bg-mist-950/50 p-6">
        <Textarea
          rows={8}
          className="w-full resize-none border-none bg-transparent text-sm leading-relaxed ring-transparent! focus-visible:ring-0"
          placeholder="Type your prompt here"
        />
        <div className="flex justify-end">
          <Button>
            <HugeiconsIcon icon={SparklesIcon} />
            Generate
          </Button>
        </div>
      </section>
    </main>
  );
};

export default CodeGenPage;
