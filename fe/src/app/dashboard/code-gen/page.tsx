import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const CodeGenPage = () => {
  return (
    <main className="-mt-20 flex h-screen w-full flex-col items-center justify-center gap-5 p-6">
      <div className="text-center">
        <h3 className="text-3xl font-bold">Describe What You Want to Build</h3>
        <p className="text-mist-500">
          Transform natural language into secure Solidity contracts. Grounded in
          our verified template library for maximum reliability.
        </p>
      </div>
      <section className="w-full max-w-4xl space-y-6 rounded-2xl border bg-mist-900/50 p-6">
        <Textarea rows={8} placeholder="Type your prompt here" />
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
