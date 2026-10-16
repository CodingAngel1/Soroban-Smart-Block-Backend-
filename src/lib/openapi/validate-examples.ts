import Ajv from 'ajv';

type OpenApiObject = Record<string, unknown>;
const OPENAPI_SCHEMA_ID = 'http://openapi.local/spec.json';

export interface OpenApiExampleValidationResult {
  checked: number;
  errors: string[];
}

function isObject(value: unknown): value is OpenApiObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveReference(value: unknown, document: OpenApiObject): unknown {
  if (!isObject(value) || typeof value.$ref !== 'string') return value;
  if (!value.$ref.startsWith('#/'))
    throw new Error(`Only local references are supported: ${value.$ref}`);

  return value.$ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((current, part) => (isObject(current) ? current[part] : undefined), document);
}

function exampleValue(
  example: unknown,
  document: OpenApiObject,
): { found: boolean; value?: unknown } {
  const resolved = resolveReference(example, document);
  if (!isObject(resolved)) return { found: false };
  if (!Object.prototype.hasOwnProperty.call(resolved, 'value')) return { found: false };
  return { found: true, value: resolved.value };
}

export function validateOpenApiExamples(documentValue: unknown): OpenApiExampleValidationResult {
  const errors: string[] = [];
  let checked = 0;
  if (!isObject(documentValue)) {
    return { checked, errors: ['OpenAPI document must be an object'] };
  }

  const document = documentValue;
  const schemas =
    isObject(document.components) && isObject(document.components.schemas)
      ? document.components.schemas
      : {};
  const validator = new Ajv({ allErrors: true, nullable: true, schemaId: 'auto' });

  validator.addSchema(document, OPENAPI_SCHEMA_ID);

  const absoluteReferences = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(absoluteReferences);
    if (!isObject(value)) return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key === '$ref' && typeof entry === 'string' && entry.startsWith('#/')
          ? `${OPENAPI_SCHEMA_ID}${entry}`
          : absoluteReferences(entry),
      ]),
    );
  };

  const checkExample = (schemaValue: unknown, value: unknown, location: string): void => {
    const schema = resolveReference(schemaValue, document);
    if (!isObject(schema)) {
      errors.push(`${location}: example has no resolvable schema`);
      return;
    }

    checked += 1;
    try {
      const validate = validator.compile(absoluteReferences(schema) as object);
      if (!validate(value)) {
        const details = (validate.errors ?? [])
          .map((error) => `${error.dataPath || '/'} ${error.message ?? 'is invalid'}`)
          .join('; ');
        errors.push(`${location}: ${details}`);
      }
    } catch (error) {
      errors.push(`${location}: ${(error as Error).message}`);
    }
  };

  const walkSchema = (
    schemaValue: unknown,
    location: string,
    visitedReferences: Set<string> = new Set(),
  ): void => {
    const reference =
      isObject(schemaValue) && typeof schemaValue.$ref === 'string' ? schemaValue.$ref : undefined;
    if (reference && visitedReferences.has(reference)) return;
    const nextVisitedReferences = new Set(visitedReferences);
    if (reference) nextVisitedReferences.add(reference);
    const schema = resolveReference(schemaValue, document);
    if (!isObject(schema)) return;

    if (Object.prototype.hasOwnProperty.call(schema, 'example')) {
      checkExample(schema, schema.example, `${location}.example`);
    }

    if (isObject(schema.properties)) {
      for (const [name, property] of Object.entries(schema.properties)) {
        walkSchema(property, `${location}.properties.${name}`, nextVisitedReferences);
      }
    }
    if (isObject(schema.items))
      walkSchema(schema.items, `${location}.items`, nextVisitedReferences);
    if (isObject(schema.additionalProperties)) {
      walkSchema(
        schema.additionalProperties,
        `${location}.additionalProperties`,
        nextVisitedReferences,
      );
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const subschemas = schema[keyword];
      if (Array.isArray(subschemas)) {
        subschemas.forEach((subschema, index) =>
          walkSchema(subschema, `${location}.${keyword}[${index}]`, nextVisitedReferences),
        );
      }
    }
  };

  const checkExamples = (container: OpenApiObject, schema: unknown, location: string): void => {
    if (Object.prototype.hasOwnProperty.call(container, 'example')) {
      checkExample(schema, container.example, `${location}.example`);
    }
    if (isObject(container.examples)) {
      for (const [name, example] of Object.entries(container.examples)) {
        const resolved = exampleValue(example, document);
        if (resolved.found) checkExample(schema, resolved.value, `${location}.examples.${name}`);
      }
    }
  };

  const checkContent = (contentValue: unknown, location: string): void => {
    if (!isObject(contentValue)) return;
    for (const [mediaType, mediaValue] of Object.entries(contentValue)) {
      if (!isObject(mediaValue)) continue;
      const media = resolveReference(mediaValue, document);
      if (!isObject(media)) continue;
      const schema = media.schema;
      if (schema !== undefined) checkExamples(media, schema, `${location}.${mediaType}`);
    }
  };

  const checkParameter = (parameterValue: unknown, location: string): void => {
    const parameter = resolveReference(parameterValue, document);
    if (!isObject(parameter)) return;
    const schema = parameter.schema;
    if (schema !== undefined) checkExamples(parameter, schema, location);
    if (isObject(parameter.content)) checkContent(parameter.content, location);
  };

  const paths = isObject(document.paths) ? document.paths : {};
  for (const [path, pathValue] of Object.entries(paths)) {
    if (!isObject(pathValue)) continue;
    const pathItem = resolveReference(pathValue, document);
    if (!isObject(pathItem)) continue;

    const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    pathParameters.forEach((parameter, index) =>
      checkParameter(parameter, `${path}.parameters[${index}]`),
    );

    for (const [method, operationValue] of Object.entries(pathItem)) {
      if (!isObject(operationValue) || !('responses' in operationValue)) continue;
      const operation = operationValue;
      const operationLocation = `${method.toUpperCase()} ${path}`;

      if (Array.isArray(operation.parameters)) {
        operation.parameters.forEach((parameter, index) =>
          checkParameter(parameter, `${operationLocation}.parameters[${index}]`),
        );
      }
      if (isObject(operation.requestBody)) {
        const requestBody = resolveReference(operation.requestBody, document);
        if (isObject(requestBody))
          checkContent(requestBody.content, `${operationLocation}.requestBody`);
      }
      if (isObject(operation.responses)) {
        for (const [status, responseValue] of Object.entries(operation.responses)) {
          const response = resolveReference(responseValue, document);
          if (isObject(response))
            checkContent(response.content, `${operationLocation}.responses.${status}`);
        }
      }
    }
  }

  for (const [name, schema] of Object.entries(schemas)) {
    walkSchema(schema, `components.schemas.${name}`);
  }

  return { checked, errors };
}
