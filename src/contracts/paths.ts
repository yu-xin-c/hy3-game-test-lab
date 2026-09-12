import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function isInsidePath(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

export async function resolveRegularFileInsideRoot(
  rootDirectory: string,
  repositoryRelativePath: string,
  options: { requiredPrefix?: string; rejectSymlink?: boolean } = {}
): Promise<string> {
  if (isAbsolute(repositoryRelativePath)) {
    throw new Error(`absolute path is not allowed: ${repositoryRelativePath}`);
  }
  const canonicalRoot = await realpath(resolve(rootDirectory));
  const lexicalCandidate = resolve(canonicalRoot, repositoryRelativePath);
  if (!isInsidePath(canonicalRoot, lexicalCandidate)) {
    throw new Error(`path escapes repository root: ${repositoryRelativePath}`);
  }

  if (options.requiredPrefix) {
    const prefixRoot = resolve(canonicalRoot, options.requiredPrefix);
    if (!isInsidePath(prefixRoot, lexicalCandidate)) {
      throw new Error(
        `path must be inside ${options.requiredPrefix}: ${repositoryRelativePath}`
      );
    }
  }

  if (options.rejectSymlink && (await lstat(lexicalCandidate)).isSymbolicLink()) {
    throw new Error(`symbolic-link file is not allowed: ${repositoryRelativePath}`);
  }
  const canonicalCandidate = await realpath(lexicalCandidate);
  if (!isInsidePath(canonicalRoot, canonicalCandidate)) {
    throw new Error(`real path escapes repository root: ${repositoryRelativePath}`);
  }
  if (options.requiredPrefix) {
    const canonicalPrefix = await realpath(resolve(canonicalRoot, options.requiredPrefix));
    if (!isInsidePath(canonicalPrefix, canonicalCandidate)) {
      throw new Error(
        `real path must stay inside ${options.requiredPrefix}: ${repositoryRelativePath}`
      );
    }
  }
  const fileStat = await stat(canonicalCandidate);
  if (!fileStat.isFile()) {
    throw new Error(`path is not a regular file: ${repositoryRelativePath}`);
  }
  return canonicalCandidate;
}
