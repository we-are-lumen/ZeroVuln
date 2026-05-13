import { Button } from "@/shared/components/ui/button";
import { NeuralNetworkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const EditorSection = () => {
  return (
    <section className="basis-[70%] rounded-lg border bg-mist-900/50">
      <div className="flex items-center justify-between border-b p-3">
        <p>result.sol</p>
        <div>
          <Button size="sm">
            <HugeiconsIcon icon={NeuralNetworkIcon} />
            <p>Deploy</p>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default EditorSection;
