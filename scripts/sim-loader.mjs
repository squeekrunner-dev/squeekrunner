// Node CLI only. Workers/browser consumers import the TypeScript source normally.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    }).outputText };
  }
  return nextLoad(url, context);
}
