"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import useQueryAdminContractCatalog from "./hooks/use-query-admin-contract-catalog";
import {
  useCreateAdminContractCatalog,
  useUpdateAdminContractCatalog,
} from "./hooks/use-upsert-admin-contract-catalog";

import type { Contract } from "@/shared/types/contract.type";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";

function codeToSourceCode(code: string): Array<{ line: number; code: string }> {
  return code
    .split(/\r?\n/)
    .map((line, idx) => ({ line: idx + 1, code: line }));
}

function sourceCodeToText(source_code?: Array<{ line: number; code: string }>) {
  if (!source_code?.length) return "";
  return [...source_code]
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
    .map((l) => l.code ?? "")
    .join("\n");
}

function isoToDatetimeLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DDTHH:mm
  return d.toISOString().slice(0, 16);
}

export default function AdminContractCatalogPage() {
  const { data, isLoading } = useQueryAdminContractCatalog();
  const { mutateAsync: createCatalog, isPending: isCreating } =
    useCreateAdminContractCatalog();
  const { mutateAsync: updateCatalog, isPending: isUpdating } =
    useUpdateAdminContractCatalog();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<Contract | null>(null);

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("solidity");
  const [expiredAt, setExpiredAt] = useState("");
  const [rewardPerFinding, setRewardPerFinding] = useState<string>("0");
  const [code, setCode] = useState("");

  const isMutating = isCreating || isUpdating;

  const rows = useMemo(() => data ?? [], [data]);

  const resetForm = () => {
    setName("");
    setLanguage("solidity");
    setExpiredAt("");
    setRewardPerFinding("0");
    setCode("");
    setEditing(null);
    setMode("create");
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (c: Contract) => {
    setMode("edit");
    setEditing(c);
    setName(c.name ?? "");
    setLanguage(c.language ?? "solidity");
    setExpiredAt(isoToDatetimeLocal(c.expired_at));
    setRewardPerFinding(String(c.reward_per_finding ?? 0));
    setCode(sourceCodeToText(c.source_code));
    setOpen(true);
  };

  const handleSubmit = async () => {
    const reward = Number(rewardPerFinding);
    if (Number.isNaN(reward) || reward < 0) {
      toast.error("Reward per finding harus angka (>= 0).");
      return;
    }

    if (mode === "create") {
      if (!code.trim()) {
        toast.error("Source code wajib diisi.");
        return;
      }

      await toast.promise(
        createCatalog({
          name: name?.trim() || undefined,
          language: language || "solidity",
          expired_at: expiredAt ? new Date(expiredAt).toISOString() : null,
          reward_per_finding: reward,
          source_code: codeToSourceCode(code),
        }),
        {
          loading: "Membuat catalog contract...",
          success: () => {
            setOpen(false);
            resetForm();
            return "Catalog contract berhasil dibuat.";
          },
          error: (err: unknown) =>
            err instanceof Error
              ? err.message
              : "Gagal membuat catalog contract.",
        },
      );
      return;
    }

    if (!editing?.uuid) return;

    await toast.promise(
      updateCatalog({
        uuid: editing.uuid,
        payload: {
          name: name?.trim() || undefined,
          language: language || "solidity",
          expired_at: expiredAt ? new Date(expiredAt).toISOString() : null,
          reward_per_finding: reward,
          // biar admin bisa update source code juga kalau perlu
          source_code: codeToSourceCode(code),
        },
      }),
      {
        loading: "Menyimpan perubahan...",
        success: () => {
          setOpen(false);
          resetForm();
          return "Catalog contract berhasil di-update.";
        },
        error: (err: unknown) =>
          err instanceof Error ? err.message : "Gagal update catalog contract.",
      },
    );
  };

  return (
    <main className="flex h-full flex-col space-y-6 p-6">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Contract Catalog
          </h1>
          <p className="text-sm text-mist-500">
            Manage target contract catalog and reward per finding.
          </p>
        </div>
        <Button onClick={openCreate}>Tambah</Button>
      </div>

      <div className="rounded-md border bg-mist-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-mist-800 hover:bg-transparent">
              <TableHead>Contract</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Reward / finding</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground italic"
                >
                  Belum ada catalog contract.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow
                  key={c.uuid}
                  className="border-b border-mist-800 transition-colors hover:bg-white/5"
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{c.name}</span>
                      <span className="font-mono text-[10px] text-mist-500">
                        {c.uuid}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{c.language}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="tabular-nums">
                      {(c.reward_per_finding ?? 0).toLocaleString()} 0G
                    </Badge>
                  </TableCell>
                  <TableCell className="text-mist-300">
                    {c.expired_at ? formatRelativeTime(c.expired_at) : "-"}
                  </TableCell>
                  <TableCell className="text-mist-300">
                    {c.updated_at ? formatRelativeTime(c.updated_at) : "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => openEdit(c)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>
              {mode === "create"
                ? "Tambah Catalog Contract"
                : "Edit Catalog Contract"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-mist-400">Name</p>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-mist-400">Language</p>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="solidity"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-mist-400">Reward per finding (0g)</p>
              <Input
                type="number"
                min={0}
                value={rewardPerFinding}
                onChange={(e) => setRewardPerFinding(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-mist-400">Expired at</p>
              <Input
                type="datetime-local"
                value={expiredAt}
                onChange={(e) => setExpiredAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-mist-400">Source code (Solidity)</p>
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="min-h-[280px] font-mono text-xs"
              placeholder={"pragma solidity ^0.8.0;\n\ncontract Target {\n}\n"}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isMutating}
            >
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={isMutating}>
              {isMutating ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
