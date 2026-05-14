import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import solc from "solc";

export const runtime = "nodejs";

type SolcOutputError = {
  severity?: string;
  formattedMessage?: string;
  message?: string;
};

function formatSolcErrors(errors: SolcOutputError[]): string {
  const fatal = errors.filter((e) => e?.severity === "error");
  const list = fatal.length > 0 ? fatal : errors;
  return list
    .map((e) => e.formattedMessage || e.message || "Unknown compiler error")
    .join("\n");
}

type CompiledContractArtifact = {
  abi?: unknown;
  evm?: { bytecode?: { object?: unknown } };
};

type CompiledOutput = {
  contracts?: Record<string, Record<string, CompiledContractArtifact>>;
  errors?: SolcOutputError[];
};

function pickFirstContract(compiled: CompiledOutput): CompiledContractArtifact {
  const files = compiled?.contracts ? Object.keys(compiled.contracts) : [];
  for (const file of files) {
    const contractsInFile = compiled.contracts?.[file];
    if (!contractsInFile || typeof contractsInFile !== "object") continue;
    for (const name of Object.keys(contractsInFile)) {
      const artifact = contractsInFile[name];
      const bytecodeObj = artifact?.evm?.bytecode?.object;
      if (typeof bytecodeObj === "string" && bytecodeObj.length > 0) {
        return artifact;
      }
    }
  }
  throw new Error("Compiler tidak menghasilkan bytecode kontrak.");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { source?: unknown }
    | null;

  const source = typeof body?.source === "string" ? body.source : "";
  if (!source.trim()) {
    return NextResponse.json({ error: "source wajib diisi" }, { status: 400 });
  }

  const input = {
    language: "Solidity",
    sources: {
      "Contract.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  try {
    const projectRoot = process.cwd();
    const nodeModules = path.join(projectRoot, "node_modules");

    const findImports = (importPath: string): { contents?: string; error?: string } => {
      // 1) Support imports from node_modules (contoh: @openzeppelin/...)
      const nmCandidate = path.join(nodeModules, importPath);
      try {
        if (fs.existsSync(nmCandidate)) {
          return { contents: fs.readFileSync(nmCandidate, "utf8") };
        }
      } catch {}

      // 2) Support absolute-ish paths that already include @openzeppelin/... prefix
      // (solc kadang mengirim path yang sudah dinormalisasi)
      try {
        const ozCandidate = path.join(nodeModules, importPath.replace(/^@/, "@"));
        if (fs.existsSync(ozCandidate)) {
          return { contents: fs.readFileSync(ozCandidate, "utf8") };
        }
      } catch {}

      // 3) Fallback: coba resolve sebagai path relatif project (untuk import lokal)
      try {
        const localCandidate = path.resolve(projectRoot, importPath);
        if (fs.existsSync(localCandidate)) {
          return { contents: fs.readFileSync(localCandidate, "utf8") };
        }
      } catch {}

      return {
        error: `Import tidak ditemukan: ${importPath}. Pastikan dependency sudah ter-install (mis. @openzeppelin/contracts).`,
      };
    };

    const outRaw = solc.compile(JSON.stringify(input), { import: findImports });
    const compiled = JSON.parse(outRaw) as CompiledOutput;

    if (Array.isArray(compiled?.errors) && compiled.errors.length > 0) {
      const hasError = compiled.errors.some(
        (e: SolcOutputError) => e?.severity === "error",
      );
      if (hasError) {
        return new NextResponse(formatSolcErrors(compiled.errors), { status: 400 });
      }
    }

    const artifact = pickFirstContract(compiled);
    const abi = artifact?.abi;
    const bytecodeObj = artifact?.evm?.bytecode?.object;

    if (!Array.isArray(abi)) {
      return new NextResponse("ABI tidak valid dari compiler.", { status: 500 });
    }
    if (typeof bytecodeObj !== "string" || !bytecodeObj) {
      return new NextResponse("Bytecode tidak ditemukan dari compiler.", {
        status: 500,
      });
    }

    const ctor = abi.find((x) => (x as { type?: unknown })?.type === "constructor") as
      | { inputs?: unknown }
      | undefined;
    const constructorInputs = Array.isArray(ctor?.inputs)
      ? (ctor.inputs as { name?: string; type?: string }[])
      : [];

    return NextResponse.json({
      abi,
      bytecode: `0x${bytecodeObj}`,
      constructorInputs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Compile gagal: ${msg}`, { status: 500 });
  }
}
