/**
 * scripts/lib/github-commit.mjs
 * ---------------------------------------------------------------------------
 * Sube varios archivos al repositorio en UN SOLO commit, usando la API de
 * datos de Git de GitHub (blobs + tree + commit + mover la rama) en vez de
 * la API de Contents (que crearía un commit POR ARCHIVO — y cada commit
 * dispara su propio despliegue en Vercel, así que con 3 archivos serían 3
 * despliegues gastados de una sola vez en vez de 1).
 * ---------------------------------------------------------------------------
 */
const OWNER = "Yair202";
const REPO = "balance-vivo";
const BRANCH = "main";

function headersGitHub(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "balance-vivo-sync",
  };
}

async function gh(token, path, options = {}) {
  const resp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    ...options,
    headers: { ...headersGitHub(token), ...(options.headers || {}) },
  });
  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`GitHub API ${resp.status} en ${path}: ${texto}`);
  }
  return resp.json();
}

export async function commitArchivos(token, { mensaje, archivos }) {
  // archivos: [{ path: "public/datos-ventas.json", contenido: "..." }, ...]
  const ref = await gh(token, `git/ref/heads/${BRANCH}`);
  const commitBase = await gh(token, `git/commits/${ref.object.sha}`);

  const blobs = await Promise.all(
    archivos.map(async (a) => {
      const blob = await gh(token, "git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: Buffer.from(a.contenido, "utf-8").toString("base64"), encoding: "base64" }),
      });
      return { path: a.path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );

  const nuevoTree = await gh(token, "git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: commitBase.tree.sha, tree: blobs }),
  });

  const nuevoCommit = await gh(token, "git/commits", {
    method: "POST",
    body: JSON.stringify({ message: mensaje, tree: nuevoTree.sha, parents: [ref.object.sha] }),
  });

  await gh(token, `git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: nuevoCommit.sha }),
  });

  return nuevoCommit.sha;
}
