import argparse
import os
import re
from pathlib import Path

import psycopg
import requests
from core.indexer import Indexer


ROOT_HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")


def _db_url() -> str:
    url = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("Missing SUPABASE_DATABASE_URL (or DATABASE_URL)")
    return url


def _indexer_url() -> str:
    url = os.getenv("OG_STORAGE_INDEXER") or "https://indexer-storage-testnet-turbo.0g.ai"
    return url.rstrip("/")


def _storage_node_url() -> str:
    url = os.getenv("OG_STORAGE_NODE") or os.getenv("OG_STORAGE_INDEXER") or "https://indexer-storage-testnet-turbo.0g.ai"
    return url.rstrip("/")


def _normalize_uri(uri: str) -> str:
    u = uri.strip()
    if u.startswith("0g://"):
        return u[len("0g://") :]
    return u


def _download_root_hash(root_hash: str, out_path: Path, proof: bool) -> None:
    indexer = Indexer(_indexer_url())
    err = indexer.download(root_hash, str(out_path), proof=proof)
    if err is not None:
        raise RuntimeError(f"0G download failed: {err}")


def _download_legacy_path(path: str, out_path: Path) -> None:
    url = f"{_storage_node_url()}/{path.lstrip('/')}"
    resp = requests.get(url, timeout=120)
    if not resp.ok:
        raise RuntimeError(f"HTTP download failed: {resp.status_code} {resp.text}")
    out_path.write_text(resp.text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="./datasets/from_0g")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--proof", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    sql = """
        select uuid::text as uuid, dataset_uri
        from auditor_findings
        where review_status = 'approved'
          and dataset_uri is not null
        order by decided_at desc nulls last
        limit %s
    """

    with psycopg.connect(_db_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (args.limit,))
            rows = cur.fetchall()

    for uuid, dataset_uri in rows:
        if not uuid or not dataset_uri:
            continue

        raw = str(dataset_uri)
        normalized = _normalize_uri(raw)
        out_path = out_dir / f"{uuid}.jsonl"

        if ROOT_HASH_RE.match(normalized):
            _download_root_hash(normalized, out_path, proof=args.proof)
        else:
            _download_legacy_path(normalized, out_path)

        print(f"saved {out_path}")


if __name__ == "__main__":
    main()

