import os
import shutil
from huggingface_hub import snapshot_download


def main():
    repo = os.environ.get("MODEL_REPO", "althof3/zeroVuln")
    subdir = os.environ.get("MODEL_SUBDIR", "ai/merged_model")
    token = os.environ.get("HF_TOKEN") or os.environ.get("hf_TOKEN")
    dest = os.environ.get("MODEL_PATH", "/app/merged_model")

    if os.path.exists(dest) and os.listdir(dest):
        print("Model already exists at", dest)
        return

    print(f"Downloading repository '{repo}' from Hugging Face...")
    # snapshot_download will cache the repo locally; we then copy the requested subdir
    repo_path = snapshot_download(repo_id=repo, token=token)
    src_dir = os.path.join(repo_path, *subdir.split("/"))

    if not os.path.exists(src_dir):
        raise SystemExit(f"Subdirectory '{subdir}' not found in repo '{repo}'.")

    os.makedirs(dest, exist_ok=True)

    for name in os.listdir(src_dir):
        s = os.path.join(src_dir, name)
        d = os.path.join(dest, name)
        if os.path.isdir(s):
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)

    print("Model files copied to", dest)


if __name__ == "__main__":
    main()
