import { swaggerSpec } from '../src/indexer/swaggerSpec';
import { validateOpenApiExamples } from '../src/lib/openapi/validate-examples';

const result = validateOpenApiExamples(swaggerSpec);

if (result.errors.length > 0) {
  process.stderr.write(
    `OpenAPI examples failed validation (${result.errors.length} error(s)):\n\n`,
  );
  for (const error of result.errors) process.stderr.write(`- ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Validated ${result.checked} OpenAPI request, response, and schema examples.\n`,
  );
}
