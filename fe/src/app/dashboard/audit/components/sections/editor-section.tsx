"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import {
  Add01Icon,
  CopyIcon,
  Rotate01Icon,
  ThirdBracketIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "sonner";
import useQueryContractCatalogDetail from "../../hooks/use-query-contract-catalog-detail";
import { Field, FieldError, FieldLabel } from "@/shared/components/ui/field";
import { useAddAuditorFinding } from "../../hooks/use-add-auditor-fnding";
import {
  AddAuditorFindingPayload,
  AuditorFindingSeverity,
} from "@/shared/types/auditor-finding.type";
import { AUDITOR_FINDING_QUERY_KEY } from "../../hooks/use-query-auditor-finding";
import { useQueryClient } from "@tanstack/react-query";
import { Spinner } from "@/shared/components/ui/spinner";
import CodeSkeleton from "../skeletons/code-skeleton";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  severity: z.string().min(1, "Severity is required"),
  description: z.string().min(5, "Description must be at least 5 characters"),
});

type FormValues = z.infer<typeof formSchema>;

interface LineSelection {
  start: number;
  end: number;
}

const EditorSection = () => {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const selectedScId = searchParams.get("selected_sc");

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [tempValues, setTempValues] = useState<FormValues | null>(null);
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      severity: "low",
      description: "",
    },
  });

  const { data, isLoading } = useQueryContractCatalogDetail(selectedScId ?? "");
  const { mutate: addAuditorFinding, isPending: isAddAuditorFindingPending } =
    useAddAuditorFinding();

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const formattedCode = useMemo(() => {
    if (!data?.source_code) return "";
    return data.source_code.map((lineObj) => lineObj.code).join("\n");
  }, [data?.source_code]);

  const onFormSubmit = (values: FormValues) => {
    setTempValues(values);
    setIsConfirmOpen(true);
  };

  const handleMouseUp = () => {
    const selectionObj = window.getSelection();
    if (!selectionObj || selectionObj.isCollapsed) return;

    const range = selectionObj.getRangeAt(0);
    const startNode =
      range.startContainer.parentElement?.closest("[data-line]");
    const endNode = range.endContainer.parentElement?.closest("[data-line]");

    const startLineRaw = startNode?.getAttribute("data-line");
    const endLineRaw = endNode?.getAttribute("data-line");

    if (startLineRaw && endLineRaw) {
      const start = parseInt(startLineRaw);
      const end = parseInt(endLineRaw);
      setSelection({
        start: Math.min(start, end),
        end: Math.max(start, end),
      });
    }
  };

  const handleFinalConfirm = () => {
    if (!selection || !tempValues) return;

    const payload: AddAuditorFindingPayload = {
      contract_id: selectedScId ?? "",
      description: tempValues.description,
      title: tempValues.title,
      severity: tempValues.severity as AuditorFindingSeverity,
      line_start: selection?.start,
      line_end: selection?.end,
    };

    addAuditorFinding(payload, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [AUDITOR_FINDING_QUERY_KEY],
        });
        toast.success("Security finding saved successfully");
        setIsConfirmOpen(false); // Close confirmation
        setIsDialogOpen(false); // Close form
        setSelection(null);
        setTempValues(null);
        form.reset();
      },
      onError: (error: Error) => {
        toast.error(`Failed to save finding: ${error.message}`);
      },
    });
  };

  const handleCopy = async () => {
    if (!formattedCode) return;
    try {
      await navigator.clipboard.writeText(formattedCode);
      toast.success("Source code copied to clipboard");
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleResetSelection = () => {
    setSelection(null);
    toast.info("Selection cleared");
  };

  return (
    <section className="flex h-full basis-[50%] flex-col rounded-2xl border bg-mist-900/50">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="text-sm font-bold text-mist-400">{data?.name}</h3>
        <div className="flex items-center gap-3">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!formattedCode || isLoading}
            title="Copy source code"
          >
            <HugeiconsIcon icon={CopyIcon} />
          </Button>

          <Button
            size="icon-sm"
            variant="outline"
            onClick={handleResetSelection}
            disabled={!selection}
            className={cn(!selection && "pointer-events-none opacity-0")}
            title="Reset selection"
          >
            <HugeiconsIcon icon={Rotate01Icon} />
          </Button>

          <Button
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            disabled={!selection}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={3} />
            <span>Add Finding</span>
          </Button>
        </div>
      </div>

      <div onMouseUp={handleMouseUp} className="relative grow overflow-auto">
        {!selectedScId ? (
          <div className="flex h-full items-center justify-center text-mist-500">
            <div className="flex flex-col items-center justify-center gap-4 text-sm italic">
              <HugeiconsIcon icon={ThirdBracketIcon} size={44} />
              <p>Select a contract to view source code</p>
            </div>
          </div>
        ) : isLoading ? (
          <CodeSkeleton />
        ) : (
          <SyntaxHighlighter
            language="solidity"
            style={darcula}
            showLineNumbers={true}
            wrapLines={true}
            lineProps={(lineNumber) => {
              const isSelected =
                selection &&
                lineNumber >= selection.start &&
                lineNumber <= selection.end;
              return {
                style: { display: "block" },
                className: cn(
                  "border-l-4 border-transparent hover:bg-white/5 transition-colors",
                  isSelected && "bg-primary/20 border-l-primary",
                ),
                "data-line": lineNumber,
              };
            }}
            customStyle={{
              margin: 0,
              padding: "1.5rem 0",
              fontSize: "0.875rem",
              lineHeight: "1.5",
              background: "transparent",
            }}
            lineNumberStyle={{
              minWidth: "3.5em",
              paddingRight: "1.5em",
              color: "#4a4a4a",
              textAlign: "right",
              userSelect: "none",
            }}
          >
            {formattedCode}
          </SyntaxHighlighter>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Audit Finding</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={form.handleSubmit(onFormSubmit)}
            className="space-y-6"
          >
            <Field>
              <FieldLabel>Finding Title</FieldLabel>
              <Controller
                name="title"
                control={form.control}
                render={({ field }) => (
                  <Input
                    placeholder="e.g., Unprotected Ether Withdrawal"
                    {...field}
                  />
                )}
              />
              <FieldError>{form.formState.errors.title?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel>Severity</FieldLabel>
              <Controller
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError>{form.formState.errors.severity?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Controller
                name="description"
                control={form.control}
                render={({ field }) => (
                  <Textarea
                    {...field}
                    id="description"
                    placeholder="Type your analysis here."
                    disabled={!selection}
                  />
                )}
              />
              <FieldError>
                {form.formState.errors.description?.message}
              </FieldError>
            </Field>

            <div className="text-xs text-mist-400">
              <span className="font-bold text-primary">Target Location:</span>{" "}
              Lines {selection?.start} - {selection?.end}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex items-center gap-2"
                disabled={isAddAuditorFindingPending}
              >
                {isAddAuditorFindingPending && <Spinner />}
                <span>Save Finding</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Review Security Finding</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-4">
              <div className="rounded-lg border border-mist-800 bg-mist-950/50 p-4">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-bold text-mist-500 uppercase">
                    Title
                  </div>
                  <div className="text-sm text-white">{tempValues?.title}</div>
                </div>
                <div className="mt-4 flex justify-between">
                  <div>
                    <div className="text-xs font-bold text-mist-500 uppercase">
                      Severity
                    </div>
                    <div
                      className={cn(
                        "text-sm font-bold capitalize",
                        tempValues?.severity === "critical"
                          ? "text-rose-500"
                          : "text-primary",
                      )}
                    >
                      {tempValues?.severity}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-mist-500 uppercase">
                      Lines
                    </div>
                    <div className="text-sm text-white">
                      {selection?.start} - {selection?.end}
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-sm">
                Are you sure you want to save this finding to the audit report?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant={"outline"} onClick={() => setIsConfirmOpen(false)}>
              Back to Edit
            </Button>
            <Button
              onClick={handleFinalConfirm}
              disabled={isAddAuditorFindingPending}
            >
              {isAddAuditorFindingPending && <Spinner />}
              <span>Confirm & Save</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default EditorSection;
