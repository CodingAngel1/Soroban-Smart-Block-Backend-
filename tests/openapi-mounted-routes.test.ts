import { existsSync, readFileSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { swaggerSpec } from '../src/indexer/swaggerSpec';

interface RouterReference {
  filePath: string;
  routerName: string;
}

interface OpenApiDocument {
  servers?: Array<{ url: string }>;
  paths?: Record<string, Record<string, unknown>>;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function sourceFile(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function resolveModule(filePath: string, modulePath: string): string | undefined {
  if (!modulePath.startsWith('.')) return undefined;
  const basePath = path.resolve(path.dirname(filePath), modulePath);
  for (const candidate of [`${basePath}.ts`, path.join(basePath, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function importedRouters(source: ts.SourceFile): Map<string, RouterReference> {
  const result = new Map<string, RouterReference>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      continue;
    }

    const moduleFile = resolveModule(source.fileName, statement.moduleSpecifier.text);
    if (!moduleFile) continue;
    const bindings = statement.importClause.namedBindings;
    if (statement.importClause.name) {
      result.set(statement.importClause.name.text, {
        filePath: moduleFile,
        routerName: 'default',
      });
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        result.set(element.name.text, {
          filePath: moduleFile,
          routerName: (element.propertyName ?? element.name).text,
        });
      }
    }
  }
  return result;
}

function isRouterFactory(expression: ts.Expression): boolean {
  return (
    ts.isCallExpression(expression) &&
    ((ts.isIdentifier(expression.expression) && expression.expression.text === 'Router') ||
      (ts.isPropertyAccessExpression(expression.expression) &&
        expression.expression.name.text === 'Router'))
  );
}

function routerVariables(source: ts.SourceFile): Set<string> {
  const result = new Set<string>();
  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isRouterFactory(node.initializer)
    ) {
      result.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function literalPath(expression: ts.Expression | undefined): string | undefined {
  if (
    expression &&
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
  ) {
    return expression.text;
  }
  return undefined;
}

function joinPath(prefix: string, routePath: string): string {
  const segments = `${prefix}/${routePath}`.split('/').filter(Boolean);
  return `/${segments.join('/')}`;
}

function openApiPath(routePath: string): string {
  return routePath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
}

function mountedOperations(): Set<string> {
  const apiRoot = path.resolve(process.cwd(), 'src/api/router.ts');
  const mounted = new Set<string>();
  const visited = new Set<string>();

  function visitRouter(reference: RouterReference, prefix: string): void {
    const filePath = reference.filePath;
    const source = sourceFile(filePath);
    let routerName = reference.routerName;
    if (routerName === 'default') {
      const defaultExport = source.statements.find(
        (statement): statement is ts.ExportAssignment =>
          ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression),
      );
      if (!defaultExport) return;
      routerName = defaultExport.expression.text;
    }

    const visitKey = `${filePath}:${routerName}:${prefix}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    const imports = importedRouters(source);
    const localRouters = routerVariables(source);
    function collect(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === routerName
      ) {
        const method = node.expression.name.text.toLowerCase();
        const pathArg = literalPath(node.arguments[0]);
        if (HTTP_METHODS.includes(method) && pathArg !== undefined) {
          mounted.add(`${method} ${openApiPath(joinPath(prefix, pathArg))}`);
        } else if (method === 'use') {
          const hasPath = pathArg !== undefined;
          const childPrefix = joinPath(prefix, hasPath ? pathArg : '');
          const handlers = node.arguments.slice(hasPath ? 1 : 0);
          for (const handler of handlers) {
            if (!ts.isIdentifier(handler)) continue;
            const imported = imports.get(handler.text);
            if (imported) {
              visitRouter(imported, childPrefix);
            } else if (localRouters.has(handler.text) && handler.text !== routerName) {
              visitRouter({ filePath, routerName: handler.text }, childPrefix);
            }
          }
        }
      }
      ts.forEachChild(node, collect);
    }
    collect(source);
  }

  visitRouter({ filePath: apiRoot, routerName: 'router' }, '');
  return mounted;
}

describe('OpenAPI mounted-route contract', () => {
  it('documents only HTTP operations reachable from the application API router', () => {
    const spec = swaggerSpec as OpenApiDocument;
    const serverPath = spec.servers?.[0]?.url;
    expect(serverPath).toBe('/api/v1');

    const mounted = mountedOperations();
    const missing = Object.entries(spec.paths ?? {}).flatMap(([routePath, pathItem]) =>
      HTTP_METHODS.filter((method) => pathItem[method] !== undefined)
        .filter((method) => !mounted.has(`${method} ${routePath}`))
        .map((method) => `${method.toUpperCase()} ${routePath}`),
    );

    expect(missing).toEqual([]);
  });
});
